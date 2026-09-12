#import "provider_attestor_private.h"

#import <Foundation/Foundation.h>
#include <dlfcn.h>
#include <fcntl.h>
#include <openssl/evp.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

// This executable is a disposable, isolated profile probe. It never calls the
// production preflight/sign entry points or weakens their loader deny gate.
static const uint8_t TestOID[] = { 0x06U, 0x03U, 0x2bU, 0x65U, 0x70U };
static const uint8_t ObservedSoftHSMPrivateCurve[] = {
  0x13U, 0x0cU, 'e', 'd', 'w', 'a', 'r', 'd', 's', '2', '5', '5', '1', '9'
};
static CK_FUNCTION_LIST_PTR originalFunctions = NULL;
static CK_OBJECT_HANDLE testPrivateObject = CK_INVALID_HANDLE;
static CK_OBJECT_HANDLE testPublicObject = CK_INVALID_HANDLE;
typedef enum {
  TestNormal, TestDuplicate, TestMissing, TestWrongCurve, TestWrongID,
  TestWrongLength, TestUnavailable, TestWrongFlag, TestWrongType
} TestMutation;
static TestMutation mutation = TestNormal;
static const char *failureStage = "initialization";

static CK_RV TestFindObjects(CK_SESSION_HANDLE session, CK_OBJECT_HANDLE *objects,
                            CK_ULONG maximum, CK_ULONG_PTR count) {
  if (mutation == TestMissing) {
    *count = 0U;
    return CKR_OK;
  }
  if (mutation == TestDuplicate && maximum >= 2U) {
    objects[0] = testPrivateObject;
    objects[1] = testPublicObject;
    *count = 2U;
    return CKR_OK;
  }
  return originalFunctions->C_FindObjects(session, objects, maximum, count);
}

static CK_RV TestGetAttribute(CK_SESSION_HANDLE session, CK_OBJECT_HANDLE object,
                              CK_ATTRIBUTE_PTR attributes, CK_ULONG count) {
  if (count != 1U) return CKR_ARGUMENTS_BAD;
  CK_ATTRIBUTE *attribute = &attributes[0];
  if (mutation == TestUnavailable && object == testPrivateObject
      && attribute->type == CKA_EC_PARAMS) return CKR_FUNCTION_NOT_SUPPORTED;
  CK_RV result = originalFunctions->C_GetAttributeValue(session, object, attributes, count);
  if (result != CKR_OK) return result;
  if (mutation == TestWrongLength && object == testPublicObject
      && attribute->type == CKA_EC_POINT) {
    attribute->ulValueLen = 32U;
  } else if (attribute->pValue != NULL && mutation == TestWrongCurve
             && object == testPrivateObject && attribute->type == CKA_EC_PARAMS
             && attribute->ulValueLen == sizeof(ObservedSoftHSMPrivateCurve)) {
    ((uint8_t *)attribute->pValue)[13] ^= 1U;
  } else if (attribute->pValue != NULL && mutation == TestWrongID
             && object == testPrivateObject && attribute->type == CKA_ID
             && attribute->ulValueLen == 16U) {
    ((uint8_t *)attribute->pValue)[0] ^= 1U;
  } else if (attribute->pValue != NULL && mutation == TestWrongFlag
             && object == testPrivateObject && attribute->type == CKA_SIGN
             && attribute->ulValueLen == sizeof(CK_BBOOL)) {
    *(CK_BBOOL *)attribute->pValue = CK_FALSE;
  } else if (attribute->pValue != NULL && mutation == TestWrongType
             && object == testPrivateObject && attribute->type == CKA_KEY_TYPE
             && attribute->ulValueLen == sizeof(CK_KEY_TYPE)) {
    *(CK_KEY_TYPE *)attribute->pValue = 0U;
  }
  return result;
}

static void TestRandomPIN(uint8_t *pin, size_t length) {
  uint8_t random[32];
  arc4random_buf(random, length);
  for (size_t index = 0U; index < length; index += 1U) {
    pin[index] = (uint8_t)('0' + (random[index] % 10U));
  }
  memset(random, 0, sizeof(random));
}

static BOOL TestIndependentVerify(NSData *publicKey, const uint8_t *message,
                                  size_t messageLength, uint8_t *signature) {
  EVP_PKEY *key = EVP_PKEY_new_raw_public_key_ex(NULL, "ED25519", NULL,
                                                 publicKey.bytes, publicKey.length);
  EVP_MD_CTX *context = EVP_MD_CTX_new();
  BOOL valid = key != NULL && context != NULL
    && EVP_DigestVerifyInit(context, NULL, NULL, NULL, key) == 1
    && EVP_DigestVerify(context, signature, 64U, message, messageLength) == 1;
  EVP_MD_CTX_free(context);
  EVP_PKEY_free(key);
  return valid;
}

static BOOL TestAttributeEquals(CK_FUNCTION_LIST_PTR functions, CK_SESSION_HANDLE session,
                                CK_OBJECT_HANDLE object, CK_ATTRIBUTE_TYPE type,
                                const void *expected, size_t length) {
  CK_ATTRIBUTE attribute = { type, NULL, 0U };
  if (functions->C_GetAttributeValue(session, object, &attribute, 1U) != CKR_OK
      || attribute.ulValueLen != length || length > 64U) return NO;
  uint8_t value[64];
  attribute.pValue = value;
  attribute.ulValueLen = (CK_ULONG)length;
  BOOL equal = functions->C_GetAttributeValue(session, object, &attribute, 1U) == CKR_OK
    && attribute.ulValueLen == length && memcmp(value, expected, length) == 0;
  memset(value, 0, sizeof(value));
  return equal;
}

static const char *TestProfileMismatch(CK_FUNCTION_LIST_PTR functions,
                                       CK_SESSION_HANDLE session,
                                       CK_OBJECT_HANDLE publicObject,
                                       CK_OBJECT_HANDLE privateObject,
                                       NSData *identifier, NSData *publicKey) {
  CK_OBJECT_CLASS publicClass = CKO_PUBLIC_KEY;
  CK_OBJECT_CLASS privateClass = CKO_PRIVATE_KEY;
  CK_KEY_TYPE edwards = CKK_EC_EDWARDS;
  CK_BBOOL yes = CK_TRUE;
  CK_BBOOL no = CK_FALSE;
  uint8_t encoded[34] = { 0x04U, 0x20U };
  memcpy(&encoded[2], publicKey.bytes, 32U);
#define MATCH(object, type, value, length, label) \
  if (!TestAttributeEquals(functions, session, object, type, value, length)) return label
  MATCH(publicObject, CKA_CLASS, &publicClass, sizeof(publicClass), "public object class");
  MATCH(privateObject, CKA_CLASS, &privateClass, sizeof(privateClass), "private object class");
  MATCH(publicObject, CKA_ID, identifier.bytes, identifier.length, "public exact ID");
  MATCH(privateObject, CKA_ID, identifier.bytes, identifier.length, "private exact ID");
  MATCH(publicObject, CKA_KEY_TYPE, &edwards, sizeof(edwards), "public Edwards key type");
  MATCH(privateObject, CKA_KEY_TYPE, &edwards, sizeof(edwards), "private Edwards key type");
  MATCH(publicObject, CKA_EC_PARAMS, ObservedSoftHSMPrivateCurve,
        sizeof(ObservedSoftHSMPrivateCurve), "public exact RFC8032 curveName");
  MATCH(privateObject, CKA_EC_PARAMS, ObservedSoftHSMPrivateCurve,
        sizeof(ObservedSoftHSMPrivateCurve), "private exact RFC8032 curveName");
  MATCH(publicObject, CKA_TOKEN, &yes, sizeof(yes), "public token persistence flag");
  MATCH(privateObject, CKA_TOKEN, &yes, sizeof(yes), "private token persistence flag");
  MATCH(publicObject, CKA_PRIVATE, &no, sizeof(no), "public visibility flag");
  MATCH(privateObject, CKA_PRIVATE, &yes, sizeof(yes), "private visibility flag");
  MATCH(publicObject, CKA_VERIFY, &yes, sizeof(yes), "public verify flag");
  MATCH(privateObject, CKA_SIGN, &yes, sizeof(yes), "private sign flag");
  MATCH(publicObject, CKA_EC_POINT, encoded, sizeof(encoded), "public exact point encoding");
#undef MATCH
  return "object discovery";
}

static BOOL TestWriteConfig(NSString *root) {
  NSString *tokens = [root stringByAppendingPathComponent:@"tokens"];
  if (mkdir(tokens.fileSystemRepresentation, 0700) != 0) return NO;
  NSString *path = [root stringByAppendingPathComponent:@"softhsm2.conf"];
  NSString *contents = [NSString stringWithFormat:
    @"directories.tokendir = %@\nobjectstore.backend = file\nlog.level = ERROR\n", tokens];
  NSData *data = [contents dataUsingEncoding:NSUTF8StringEncoding];
  int fd = open(path.fileSystemRepresentation, O_WRONLY | O_CREAT | O_EXCL, 0600);
  BOOL written = fd >= 0 && write(fd, data.bytes, data.length) == (ssize_t)data.length;
  if (fd >= 0) close(fd);
  return written && setenv("SOFTHSM2_CONF", path.fileSystemRepresentation, 1) == 0;
}

static BOOL TestPureSignature(CK_FUNCTION_LIST_PTR functions, CK_SESSION_HANDLE session,
                              CK_OBJECT_HANDLE privateObject, NSData *pinnedPublicKey) {
  CK_MECHANISM pure = { CKM_EDDSA, NULL, 0U };
  CK_BYTE parameter = 0U;
  CK_MECHANISM nonempty = { CKM_EDDSA, &parameter, 1U };
  CK_MECHANISM nonnull = { CKM_EDDSA, &parameter, 0U };
  CK_MECHANISM wrongMechanism = { CKM_EC_EDWARDS_KEY_PAIR_GEN, NULL, 0U };
  failureStage = "pure mechanism parameters";
  if (!PAPureEdDSAMechanismForTesting(&pure)
      || PAPureEdDSAMechanismForTesting(&nonempty)
      || PAPureEdDSAMechanismForTesting(&nonnull)
      || PAPureEdDSAMechanismForTesting(&wrongMechanism)) return NO;
  static const uint8_t message[] = "synthetic offline key-profile probe";
  uint8_t signatures[2][64];
  BOOL verified = YES;
  failureStage = "independent signature verification and determinism";
  for (size_t index = 0U; index < 2U; index += 1U) {
    CK_ULONG length = sizeof(signatures[index]);
    verified = verified && functions->C_SignInit(session, &pure, privateObject) == CKR_OK
      && functions->C_Sign(session, (CK_BYTE_PTR)message,
                           (CK_ULONG)(sizeof(message) - 1U),
                           signatures[index], &length) == CKR_OK
      && length == sizeof(signatures[index])
      && TestIndependentVerify(pinnedPublicKey, message, sizeof(message) - 1U,
                               signatures[index]);
    if (!verified) break;
  }
  verified = verified && memcmp(signatures[0], signatures[1], 64U) == 0;
  memset(signatures, 0, sizeof(signatures));
  return verified;
}

static BOOL TestProbe(CK_FUNCTION_LIST_PTR functions, CK_SESSION_HANDLE session,
                      CK_OBJECT_HANDLE publicObject, CK_OBJECT_HANDLE privateObject,
                      NSData *identifier, BOOL printableProfile) {
  CK_ATTRIBUTE point = { CKA_EC_POINT, NULL, 0U };
  failureStage = "public point encoding";
  if (functions->C_GetAttributeValue(session, publicObject, &point, 1U) != CKR_OK
      || point.ulValueLen != 34U) return NO;
  uint8_t bytes[34];
  point.pValue = bytes;
  if (functions->C_GetAttributeValue(session, publicObject, &point, 1U) != CKR_OK
      || point.ulValueLen != sizeof(bytes) || bytes[0] != 0x04U || bytes[1] != 0x20U) return NO;
  NSData *pinnedPublicKey = [NSData dataWithBytes:&bytes[2] length:32U];
  memset(bytes, 0, sizeof(bytes));
  if (!printableProfile) {
    failureStage = "mixed OID/curveName rejection";
    return TestAttributeEquals(functions, session, publicObject, CKA_EC_PARAMS,
                               TestOID, sizeof(TestOID))
      && TestAttributeEquals(functions, session, privateObject, CKA_EC_PARAMS,
                             ObservedSoftHSMPrivateCurve, sizeof(ObservedSoftHSMPrivateCurve))
      && !PAValidateSignerKeyProfileForTesting(functions, session, identifier,
                                               pinnedPublicKey);
  }
  originalFunctions = functions;
  testPrivateObject = privateObject;
  testPublicObject = publicObject;
  CK_FUNCTION_LIST proxy = *functions;
  proxy.C_FindObjects = TestFindObjects;
  proxy.C_GetAttributeValue = TestGetAttribute;
  failureStage = "exact coherent RFC8032 curveName profile";
  if (!PAValidateSignerKeyProfileForTesting(functions, session, identifier, pinnedPublicKey)) {
    failureStage = TestProfileMismatch(functions, session, publicObject, privateObject,
                                       identifier, pinnedPublicKey);
    return NO;
  }
  for (TestMutation mode = TestDuplicate; mode <= TestWrongType; mode += 1) {
    mutation = mode;
    failureStage = "negative profile mutation";
    if (PAValidateSignerKeyProfileForTesting(&proxy, session, identifier, pinnedPublicKey)) return NO;
  }
  mutation = TestNormal;
  NSMutableData *wrongKey = [pinnedPublicKey mutableCopy];
  ((uint8_t *)wrongKey.mutableBytes)[0] ^= 1U;
  if (PAValidateSignerKeyProfileForTesting(functions, session, identifier, wrongKey)) return NO;
  NSMutableData *wrongIdentifier = [identifier mutableCopy];
  ((uint8_t *)wrongIdentifier.mutableBytes)[0] ^= 1U;
  if (PAValidateSignerKeyProfileForTesting(functions, session, wrongIdentifier,
                                          pinnedPublicKey)) return NO;

  return TestPureSignature(functions, session, privateObject, pinnedPublicKey);
}

static BOOL TestIsolatedSoftHSM(const char *module, BOOL printableProfile) {
  void *library = dlopen(module, RTLD_NOW | RTLD_LOCAL);
  if (library == NULL) return NO;
  void *symbol = dlsym(library, "C_GetFunctionList");
  CK_C_GetFunctionList getFunctions = NULL;
  memcpy(&getFunctions, &symbol, sizeof(symbol));
  CK_FUNCTION_LIST_PTR functions = NULL;
  CK_SESSION_HANDLE session = CK_INVALID_HANDLE;
  uint8_t soPIN[16];
  uint8_t userPIN[16];
  uint8_t identifierBytes[16];
  TestRandomPIN(soPIN, sizeof(soPIN));
  TestRandomPIN(userPIN, sizeof(userPIN));
  arc4random_buf(identifierBytes, sizeof(identifierBytes));
  BOOL initialized = NO;
  BOOL passed = NO;
  do {
    failureStage = "module initialization";
    if (getFunctions == NULL || getFunctions(&functions) != CKR_OK
        || functions == NULL || functions->C_Initialize(NULL) != CKR_OK) break;
    initialized = YES;
    CK_ULONG slotCount = 0U;
    failureStage = "isolated slot enumeration";
    if (functions->C_GetSlotList(CK_FALSE, NULL, &slotCount) != CKR_OK
        || slotCount != 1U) break;
    CK_SLOT_ID slot = 0U;
    if (functions->C_GetSlotList(CK_FALSE, &slot, &slotCount) != CKR_OK
        || slotCount != 1U) break;
    CK_UTF8CHAR label[32];
    memset(label, ' ', sizeof(label));
    memcpy(label, "ephemeral-profile", 17U);
    failureStage = "disposable token initialization";
    if (functions->C_InitToken(slot, soPIN, sizeof(soPIN), label) != CKR_OK) break;
    slotCount = 0U;
    failureStage = "initialized token enumeration";
    if (functions->C_GetSlotList(CK_TRUE, NULL, &slotCount) != CKR_OK
        || slotCount == 0U || slotCount > 1024U) break;
    CK_SLOT_ID *tokenSlots = calloc((size_t)slotCount, sizeof(*tokenSlots));
    if (tokenSlots == NULL) break;
    CK_ULONG observedSlots = slotCount;
    CK_RV slotResult = functions->C_GetSlotList(CK_TRUE, tokenSlots, &observedSlots);
    CK_ULONG matchingTokens = 0U;
    for (CK_ULONG index = 0U; slotResult == CKR_OK && index < observedSlots
                              && observedSlots <= slotCount; index += 1U) {
      CK_TOKEN_INFO current;
      if (functions->C_GetTokenInfo(tokenSlots[index], &current) == CKR_OK
          && memcmp(current.label, label, sizeof(label)) == 0) {
        slot = tokenSlots[index];
        matchingTokens += 1U;
      }
    }
    free(tokenSlots);
    if (matchingTokens != 1U) break;
    CK_TOKEN_INFO before;
    CK_TOKEN_INFO after;
    failureStage = "disposable token login";
    if (functions->C_GetTokenInfo(slot, &before) != CKR_OK
        || functions->C_OpenSession(slot, CKF_RW_SESSION | CKF_SERIAL_SESSION,
                                    NULL, NULL, &session) != CKR_OK
        || functions->C_Login(session, CKU_SO, soPIN, sizeof(soPIN)) != CKR_OK
        || functions->C_InitPIN(session, userPIN, sizeof(userPIN)) != CKR_OK
        || functions->C_Logout(session) != CKR_OK
        || functions->C_Login(session, CKU_USER, userPIN, sizeof(userPIN)) != CKR_OK) break;
    CK_BBOOL yes = CK_TRUE;
    CK_BBOOL no = CK_FALSE;
    CK_ATTRIBUTE publicAttributes[] = {
      { CKA_TOKEN, &yes, sizeof(yes) },
      { CKA_PRIVATE, &no, sizeof(no) },
      { CKA_VERIFY, &yes, sizeof(yes) },
      { CKA_ID, identifierBytes, sizeof(identifierBytes) },
      { CKA_EC_PARAMS,
        printableProfile ? (void *)ObservedSoftHSMPrivateCurve : (void *)TestOID,
        printableProfile ? sizeof(ObservedSoftHSMPrivateCurve) : sizeof(TestOID) },
    };
    CK_ATTRIBUTE privateAttributes[] = {
      { CKA_TOKEN, &yes, sizeof(yes) },
      { CKA_PRIVATE, &yes, sizeof(yes) },
      { CKA_SIGN, &yes, sizeof(yes) },
      { CKA_ID, identifierBytes, sizeof(identifierBytes) },
    };
    CK_MECHANISM generate = { CKM_EC_EDWARDS_KEY_PAIR_GEN, NULL, 0U };
    CK_OBJECT_HANDLE publicObject = CK_INVALID_HANDLE;
    CK_OBJECT_HANDLE privateObject = CK_INVALID_HANDLE;
    failureStage = "Ed25519 keypair generation and token serial";
    if (functions->C_GenerateKeyPair(session, &generate,
                                     publicAttributes, sizeof(publicAttributes) / sizeof(publicAttributes[0]),
                                     privateAttributes, sizeof(privateAttributes) / sizeof(privateAttributes[0]),
                                     &publicObject, &privateObject) != CKR_OK
        || functions->C_GetTokenInfo(slot, &after) != CKR_OK
        || memcmp(before.serialNumber, after.serialNumber, sizeof(before.serialNumber)) != 0) break;
    NSData *identifier = [NSData dataWithBytes:identifierBytes length:sizeof(identifierBytes)];
    passed = TestProbe(functions, session, publicObject, privateObject,
                       identifier, printableProfile);
  } while (NO);
  memset(soPIN, 0, sizeof(soPIN));
  memset(userPIN, 0, sizeof(userPIN));
  memset(identifierBytes, 0, sizeof(identifierBytes));
  if (session != CK_INVALID_HANDLE) {
    functions->C_Logout(session);
    functions->C_CloseSession(session);
  }
  if (initialized) functions->C_Finalize(NULL);
  dlclose(library);
  return passed;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    BOOL printableProfile = argc == 3 && strcmp(argv[1], "--printable") == 0;
    if (argc != 2 && !printableProfile) return 2;
    char path[] = "/private/tmp/provider-attestor-profile.XXXXXXXX";
    char *created = mkdtemp(path);
    if (created == NULL) return 3;
    NSString *temporary = [NSString stringWithUTF8String:created];
    BOOL passed = NO;
    BOOL cleaned = NO;
    @try {
      passed = TestWriteConfig(temporary)
        && TestIsolatedSoftHSM(argv[printableProfile ? 2 : 1], printableProfile);
    } @finally {
      unsetenv("SOFTHSM2_CONF");
      cleaned = [[NSFileManager defaultManager] removeItemAtPath:temporary error:NULL]
        && ![[NSFileManager defaultManager] fileExistsAtPath:temporary];
    }
    if (!cleaned) {
      fputs("NO-GO: disposable token cleanup failed\n", stderr);
      return 1;
    }
    if (!passed) {
      fprintf(stderr, "NO-GO: isolated SoftHSM key-profile probe failed at %s (no credentials retained)\n", failureStage);
      return 1;
    }
    puts(printableProfile
      ? "PASS: isolated coherent PrintableString curveName profile, negative mutations, pure EdDSA, independent verification and determinism"
      : "PASS: isolated mixed OID/curveName key pair rejected by exact curveName profile");
    return 0;
  }
}
