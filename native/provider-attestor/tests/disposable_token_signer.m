#import "disposable_token_signer.h"
#import "disposable_token_module_integrity.h"
#import "provider_attestor_private.h"

#include <dlfcn.h>
#include <string.h>
#include <stdlib.h>

static void PAWipeDisposable(void *memory, size_t length) {
  volatile uint8_t *bytes = memory;
  for (size_t index = 0U; index < length; index += 1U) bytes[index] = 0U;
}

static NSString *PADisposableTokenSerial(CK_TOKEN_INFO *info) {
  NSString *text = [[NSString alloc] initWithBytes:info->serialNumber
                                          length:sizeof(info->serialNumber)
                                        encoding:NSASCIIStringEncoding];
  return [text stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
}

@interface PADisposableSigner ()
@property(nonatomic, copy) NSString *modulePath;
@property(nonatomic, copy) NSString *moduleDigest;
@property(nonatomic, copy) NSString *tokenSerial;
@property(nonatomic, copy) NSData *objectIdentifier;
@property(nonatomic, copy) NSData *publicKey;
@property(nonatomic, copy) NSString *tokenConfiguration;
@property(nonatomic, strong) id<PADisposablePINProvider> pinProvider;
@property(nonatomic) BOOL used;
@end

@implementation PADisposableSigner

- (instancetype)initWithModulePath:(NSString *)modulePath
                     moduleDigest:(NSString *)moduleDigest
                      tokenSerial:(NSString *)tokenSerial
                 objectIdentifier:(NSData *)objectIdentifier
                        publicKey:(NSData *)publicKey
               tokenConfiguration:(NSString *)tokenConfiguration
                      pinProvider:(id<PADisposablePINProvider>)pinProvider {
  self = [super init];
  if (self != nil) {
    _modulePath = [modulePath copy];
    _moduleDigest = [moduleDigest copy];
    _tokenSerial = [tokenSerial copy];
    _objectIdentifier = [objectIdentifier copy];
    _publicKey = [publicKey copy];
    _tokenConfiguration = [tokenConfiguration copy];
    _pinProvider = pinProvider;
  }
  return self;
}

- (NSData *)signFrozenMessage:(NSData *)message
          operationIdentifier:(NSString *)operationIdentifier {
  if (self.used) return nil;
  self.used = YES;
  if (self.objectIdentifier.length != 16U || self.publicKey.length != 32U
      || ![self.tokenConfiguration isAbsolutePath]
      || !PAValidateDisposableModuleBytes(self.modulePath, self.moduleDigest)
      || setenv("SOFTHSM2_CONF", self.tokenConfiguration.fileSystemRepresentation, 1) != 0) {
    return nil;
  }
  void *library = dlopen(self.modulePath.fileSystemRepresentation, RTLD_NOW | RTLD_LOCAL);
  if (library == NULL) {
    unsetenv("SOFTHSM2_CONF");
    return nil;
  }
  if (!PAValidateDisposableModuleBytes(self.modulePath, self.moduleDigest)) {
    dlclose(library);
    unsetenv("SOFTHSM2_CONF");
    return nil;
  }
  void *symbol = dlsym(library, "C_GetFunctionList");
  CK_C_GetFunctionList getFunctions = NULL;
  memcpy(&getFunctions, &symbol, sizeof(symbol));
  CK_FUNCTION_LIST_PTR functions = NULL;
  CK_SESSION_HANDLE session = CK_INVALID_HANDLE;
  BOOL initialized = NO;
  BOOL loggedIn = NO;
  NSData *signature = nil;
  uint8_t pin[16];
  uint8_t rawSignature[64];
  memset(pin, 0, sizeof(pin));
  memset(rawSignature, 0, sizeof(rawSignature));
  do {
    if (getFunctions == NULL || getFunctions(&functions) != CKR_OK
        || functions == NULL || functions->C_Initialize == NULL
        || functions->C_Finalize == NULL || functions->C_GetSlotList == NULL
        || functions->C_GetTokenInfo == NULL || functions->C_OpenSession == NULL
        || functions->C_CloseSession == NULL || functions->C_Login == NULL
        || functions->C_Logout == NULL || functions->C_FindObjectsInit == NULL
        || functions->C_FindObjects == NULL || functions->C_FindObjectsFinal == NULL
        || functions->C_SignInit == NULL || functions->C_Sign == NULL
        || functions->C_VerifyInit == NULL || functions->C_Verify == NULL
        || functions->C_Initialize(NULL) != CKR_OK) break;
    initialized = YES;
    CK_ULONG slotCount = 0U;
    CK_SLOT_ID slot = 0U;
    if (functions->C_GetSlotList(CK_TRUE, NULL, &slotCount) != CKR_OK
        || slotCount == 0U || slotCount > 1024U) break;
    CK_SLOT_ID *slots = calloc((size_t)slotCount, sizeof(*slots));
    if (slots == NULL) break;
    CK_ULONG observedCount = slotCount;
    CK_RV listed = functions->C_GetSlotList(CK_TRUE, slots, &observedCount);
    NSUInteger matches = 0U;
    if (listed == CKR_OK && observedCount <= slotCount) {
      for (CK_ULONG index = 0U; index < observedCount; index += 1U) {
        CK_TOKEN_INFO candidate;
        memset(&candidate, 0, sizeof(candidate));
        if (functions->C_GetTokenInfo(slots[index], &candidate) == CKR_OK
            && [PADisposableTokenSerial(&candidate) isEqualToString:self.tokenSerial]) {
          slot = slots[index];
          matches += 1U;
        }
      }
    }
    free(slots);
    if (matches != 1U) break;
    if (functions->C_OpenSession(slot, CKF_SERIAL_SESSION | CKF_RW_SESSION,
                                  NULL, NULL, &session) != CKR_OK) break;
    if (![self.pinProvider copyOneShotPIN:pin operationIdentifier:operationIdentifier]) break;
    BOOL pinValid = YES;
    for (size_t index = 0U; index < sizeof(pin); index += 1U) {
      if (pin[index] < '0' || pin[index] > '9') pinValid = NO;
    }
    if (!pinValid) break;
    CK_RV login = functions->C_Login(session, CKU_USER, pin, sizeof(pin));
    PAWipeDisposable(pin, sizeof(pin));
    if (login != CKR_OK) break;
    loggedIn = YES;
    if (!PAValidateSignerKeyProfileForTesting(
          functions, session, self.objectIdentifier, self.publicKey)) break;
    CK_OBJECT_CLASS privateClass = CKO_PRIVATE_KEY;
    CK_ATTRIBUTE query[] = {
      { CKA_CLASS, &privateClass, sizeof(privateClass) },
      { CKA_ID, (void *)self.objectIdentifier.bytes, (CK_ULONG)self.objectIdentifier.length },
    };
    CK_OBJECT_HANDLE privateObject = CK_INVALID_HANDLE;
    CK_ULONG found = 0U;
    if (functions->C_FindObjectsInit(session, query, 2U) != CKR_OK) break;
    CK_RV find = functions->C_FindObjects(session, &privateObject, 1U, &found);
    CK_RV finished = functions->C_FindObjectsFinal(session);
    if (find != CKR_OK || finished != CKR_OK || found != 1U
        || privateObject == CK_INVALID_HANDLE) break;
    CK_OBJECT_CLASS publicClass = CKO_PUBLIC_KEY;
    CK_ATTRIBUTE publicQuery[] = {
      { CKA_CLASS, &publicClass, sizeof(publicClass) },
      { CKA_ID, (void *)self.objectIdentifier.bytes, (CK_ULONG)self.objectIdentifier.length },
    };
    CK_OBJECT_HANDLE publicObjects[2] = { CK_INVALID_HANDLE, CK_INVALID_HANDLE };
    CK_ULONG publicFound = 0U;
    if (functions->C_FindObjectsInit(session, publicQuery, 2U) != CKR_OK) break;
    CK_RV publicFind = functions->C_FindObjects(session, publicObjects, 2U, &publicFound);
    CK_RV publicFinished = functions->C_FindObjectsFinal(session);
    if (publicFind != CKR_OK || publicFinished != CKR_OK || publicFound != 1U
        || publicObjects[0] == CK_INVALID_HANDLE) break;
    CK_MECHANISM mechanism = { CKM_EDDSA, NULL, 0U };
    CK_ULONG signatureLength = sizeof(rawSignature);
    CK_OBJECT_HANDLE signObject = privateObject;
#if defined(PA_DISPOSABLE_SIGNER_TEST_FAULTS)
    if (self.failSignForTesting) signObject = CK_INVALID_HANDLE;
#endif
    if (!PAPureEdDSAMechanismForTesting(&mechanism)
        || functions->C_SignInit(session, &mechanism, signObject) != CKR_OK
        || functions->C_Sign(session, (CK_BYTE_PTR)message.bytes, (CK_ULONG)message.length,
                             rawSignature, &signatureLength) != CKR_OK
        || signatureLength != sizeof(rawSignature)) break;
#if defined(PA_DISPOSABLE_SIGNER_TEST_FAULTS)
    if (self.corruptSignatureForTesting) rawSignature[0] ^= 1U;
#endif
    // This same-module check catches accidental corruption only. The JS parent
    // independently verifies the READY envelope against its pinned public key.
    CK_MECHANISM verifyMechanism = { CKM_EDDSA, NULL, 0U };
    if (!PAPureEdDSAMechanismForTesting(&verifyMechanism)
        || functions->C_VerifyInit(session, &verifyMechanism, publicObjects[0]) != CKR_OK
        || functions->C_Verify(session, (CK_BYTE_PTR)message.bytes, (CK_ULONG)message.length,
                               rawSignature, signatureLength) != CKR_OK) break;
    signature = [NSData dataWithBytes:rawSignature length:sizeof(rawSignature)];
  } while (NO);
  PAWipeDisposable(pin, sizeof(pin));
  PAWipeDisposable(rawSignature, sizeof(rawSignature));
  if (loggedIn && functions->C_Logout(session) != CKR_OK) signature = nil;
  if (session != CK_INVALID_HANDLE && functions->C_CloseSession(session) != CKR_OK) signature = nil;
  if (initialized && functions->C_Finalize(NULL) != CKR_OK) signature = nil;
  dlclose(library);
  unsetenv("SOFTHSM2_CONF");
  return signature;
}

@end
