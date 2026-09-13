#import "pkcs11_minimal.h"
#import "disposable_token_module_integrity.h"
#import "provider_attestor_private_acl.h"

#import <Foundation/Foundation.h>
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#if !defined(PA_TESTING) || !defined(PA_DISPOSABLE_TOKEN_SIGNING_TEST) \
  || defined(PA_RELEASE_BUILD)
#error Disposable token bootstrap is test-only and cannot enter a release build
#endif

static const uint8_t PATestCurveName[] = {
  0x13U, 0x0cU, 'e', 'd', 'w', 'a', 'r', 'd', 's', '2', '5', '5', '1', '9'
};

static void PAWipe(void *memory, size_t length) {
  volatile uint8_t *bytes = memory;
  for (size_t index = 0U; index < length; index += 1U) bytes[index] = 0U;
}

static BOOL PAWriteExact(int descriptor, const void *memory, size_t length) {
  const uint8_t *bytes = memory;
  size_t offset = 0U;
  while (offset < length) {
    ssize_t written = write(descriptor, bytes + offset, length - offset);
    if (written < 0 && errno == EINTR) continue;
    if (written <= 0) return NO;
    offset += (size_t)written;
  }
  return YES;
}

static BOOL PAReadOneShotPIN(uint8_t pin[16]) {
  size_t offset = 0U;
  while (offset < 16U) {
    ssize_t readCount = read(5, pin + offset, 16U - offset);
    if (readCount < 0 && errno == EINTR) continue;
    if (readCount <= 0) return NO;
    offset += (size_t)readCount;
  }
  uint8_t extra = 0U;
  ssize_t trailing;
  do { trailing = read(5, &extra, 1U); } while (trailing < 0 && errno == EINTR);
  BOOL exact = trailing == 0;
  close(5);
  if (!exact) return NO;
  for (size_t index = 0U; index < 16U; index += 1U) {
    if (pin[index] < '0' || pin[index] > '9') return NO;
  }
  return YES;
}

static BOOL PAWritePrivateConfig(NSString *root) {
  struct stat rootStatus;
  const char *rootPath = root.fileSystemRepresentation;
  if (![root isAbsolutePath] || rootPath == NULL
      || lstat(rootPath, &rootStatus) != 0
      || !S_ISDIR(rootStatus.st_mode) || rootStatus.st_uid != geteuid()
      || (rootStatus.st_mode & 0777) != 0700) return NO;
  int rootDescriptor = open(rootPath, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (rootDescriptor < 0) return NO;
  struct stat openedRoot;
  BOOL privateRoot = fstat(rootDescriptor, &openedRoot) == 0
    && openedRoot.st_dev == rootStatus.st_dev
    && openedRoot.st_ino == rootStatus.st_ino
    && openedRoot.st_uid == rootStatus.st_uid
    && (openedRoot.st_mode & 07777U) == 0700U
    && PAHasNoExtendedACL(rootDescriptor);
  if (close(rootDescriptor) != 0) privateRoot = NO;
  if (!privateRoot) return NO;
  NSString *tokens = [root stringByAppendingPathComponent:@"tokens"];
  NSString *configuration = [root stringByAppendingPathComponent:@"softhsm2.conf"];
  if (mkdir(tokens.fileSystemRepresentation, 0700) != 0) return NO;
  NSString *contents = [NSString stringWithFormat:
    @"directories.tokendir = %@\nobjectstore.backend = file\nlog.level = ERROR\n", tokens];
  NSData *bytes = [contents dataUsingEncoding:NSUTF8StringEncoding];
  int descriptor = open(configuration.fileSystemRepresentation,
                        O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0600);
  BOOL written = descriptor >= 0 && PAWriteExact(descriptor, bytes.bytes, bytes.length);
  if (descriptor >= 0 && close(descriptor) != 0) written = NO;
  int checked = written ? open(configuration.fileSystemRepresentation,
                               O_RDONLY | O_NOFOLLOW | O_CLOEXEC) : -1;
  struct stat configurationStatus;
  written = checked >= 0 && fstat(checked, &configurationStatus) == 0
    && S_ISREG(configurationStatus.st_mode)
    && configurationStatus.st_uid == geteuid()
    && configurationStatus.st_nlink == 1
    && (configurationStatus.st_mode & 07777U) == 0600U
    && PAHasNoExtendedACL(checked);
  if (checked >= 0 && close(checked) != 0) written = NO;
  return written && setenv("SOFTHSM2_CONF", configuration.fileSystemRepresentation, 1) == 0;
}

static BOOL PAInitializeDisposableToken(NSString *modulePath, NSString *expectedDigest,
                                        uint8_t pin[16],
                                        uint8_t metadata[64]) {
  if (!PAValidateDisposableModuleBytes(modulePath, expectedDigest)) return NO;
  void *library = dlopen(modulePath.fileSystemRepresentation, RTLD_NOW | RTLD_LOCAL);
  if (library == NULL) return NO;
  if (!PAValidateDisposableModuleBytes(modulePath, expectedDigest)) {
    dlclose(library);
    return NO;
  }
  void *symbol = dlsym(library, "C_GetFunctionList");
  CK_C_GetFunctionList getFunctions = NULL;
  memcpy(&getFunctions, &symbol, sizeof(symbol));
  CK_FUNCTION_LIST_PTR functions = NULL;
  CK_SESSION_HANDLE session = CK_INVALID_HANDLE;
  BOOL initialized = NO;
  BOOL loggedIn = NO;
  BOOL success = NO;
  uint8_t soPIN[16];
  uint8_t objectIdentifier[16];
  uint8_t encodedPoint[34];
  memset(encodedPoint, 0, sizeof(encodedPoint));
  arc4random_buf(soPIN, sizeof(soPIN));
  arc4random_buf(objectIdentifier, sizeof(objectIdentifier));
  for (size_t index = 0U; index < sizeof(soPIN); index += 1U) {
    soPIN[index] = (uint8_t)('0' + (soPIN[index] % 10U));
  }
  do {
    if (getFunctions == NULL || getFunctions(&functions) != CKR_OK
        || functions == NULL || functions->C_Initialize == NULL
        || functions->C_Finalize == NULL || functions->C_GetSlotList == NULL
        || functions->C_InitToken == NULL || functions->C_GetTokenInfo == NULL
        || functions->C_OpenSession == NULL || functions->C_CloseSession == NULL
        || functions->C_Login == NULL || functions->C_Logout == NULL
        || functions->C_InitPIN == NULL || functions->C_GenerateKeyPair == NULL
        || functions->C_GetAttributeValue == NULL
        || functions->C_Initialize(NULL) != CKR_OK) break;
    initialized = YES;
    CK_ULONG slotCount = 1U;
    CK_SLOT_ID slot = 0U;
    if (functions->C_GetSlotList(CK_FALSE, &slot, &slotCount) != CKR_OK
        || slotCount != 1U) break;
    CK_UTF8CHAR label[32];
    memset(label, ' ', sizeof(label));
    memcpy(label, "disposable-journal-test", 23U);
    if (!PAReadOneShotPIN(pin)
        || functions->C_InitToken(slot, soPIN, sizeof(soPIN), label) != CKR_OK) break;
    slotCount = 1U;
    if (functions->C_GetSlotList(CK_TRUE, &slot, &slotCount) != CKR_OK
        || slotCount != 1U) break;
    CK_TOKEN_INFO tokenInfo;
    memset(&tokenInfo, 0, sizeof(tokenInfo));
    if (functions->C_GetTokenInfo(slot, &tokenInfo) != CKR_OK
        || functions->C_OpenSession(slot, CKF_SERIAL_SESSION | CKF_RW_SESSION,
                                    NULL, NULL, &session) != CKR_OK) break;
    if (functions->C_Login(session, CKU_SO, soPIN, sizeof(soPIN)) != CKR_OK) break;
    loggedIn = YES;
    if (functions->C_InitPIN(session, pin, 16U) != CKR_OK
        || functions->C_Logout(session) != CKR_OK) break;
    loggedIn = NO;
    CK_RV userLogin = functions->C_Login(session, CKU_USER, pin, 16U);
    PAWipe(pin, 16U);
    if (userLogin != CKR_OK) break;
    loggedIn = YES;
    CK_BBOOL yes = CK_TRUE;
    CK_BBOOL no = CK_FALSE;
    CK_ATTRIBUTE publicAttributes[] = {
      { CKA_TOKEN, &yes, sizeof(yes) },
      { CKA_PRIVATE, &no, sizeof(no) },
      { CKA_VERIFY, &yes, sizeof(yes) },
      { CKA_ID, objectIdentifier, sizeof(objectIdentifier) },
      { CKA_EC_PARAMS, (void *)PATestCurveName, sizeof(PATestCurveName) },
    };
    CK_ATTRIBUTE privateAttributes[] = {
      { CKA_TOKEN, &yes, sizeof(yes) },
      { CKA_PRIVATE, &yes, sizeof(yes) },
      { CKA_SIGN, &yes, sizeof(yes) },
      { CKA_ID, objectIdentifier, sizeof(objectIdentifier) },
    };
    CK_MECHANISM generation = { CKM_EC_EDWARDS_KEY_PAIR_GEN, NULL, 0U };
    CK_OBJECT_HANDLE publicObject = CK_INVALID_HANDLE;
    CK_OBJECT_HANDLE privateObject = CK_INVALID_HANDLE;
    if (functions->C_GenerateKeyPair(session, &generation,
          publicAttributes, sizeof(publicAttributes) / sizeof(publicAttributes[0]),
          privateAttributes, sizeof(privateAttributes) / sizeof(privateAttributes[0]),
          &publicObject, &privateObject) != CKR_OK
        || publicObject == CK_INVALID_HANDLE || privateObject == CK_INVALID_HANDLE) break;
    CK_ATTRIBUTE point = { CKA_EC_POINT, encodedPoint, sizeof(encodedPoint) };
    if (functions->C_GetAttributeValue(session, publicObject, &point, 1U) != CKR_OK
        || point.ulValueLen != sizeof(encodedPoint)
        || encodedPoint[0] != 0x04U || encodedPoint[1] != 0x20U) break;
    memcpy(metadata, &encodedPoint[2], 32U);
    memcpy(&metadata[32], objectIdentifier, sizeof(objectIdentifier));
    memcpy(&metadata[48], tokenInfo.serialNumber, sizeof(tokenInfo.serialNumber));
    success = YES;
  } while (NO);
  if (loggedIn && functions->C_Logout(session) != CKR_OK) success = NO;
  if (session != CK_INVALID_HANDLE && functions->C_CloseSession(session) != CKR_OK) success = NO;
  if (initialized && functions->C_Finalize(NULL) != CKR_OK) success = NO;
  dlclose(library);
  PAWipe(soPIN, sizeof(soPIN));
  PAWipe(objectIdentifier, sizeof(objectIdentifier));
  PAWipe(encodedPoint, sizeof(encodedPoint));
  return success;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    uint8_t pin[16];
    uint8_t metadata[64];
    memset(pin, 0, sizeof(pin));
    memset(metadata, 0, sizeof(metadata));
    BOOL success = NO;
    if (argc == 4) {
      NSString *root = [NSString stringWithUTF8String:argv[1]];
      NSString *modulePath = [NSString stringWithUTF8String:argv[2]];
      NSString *expectedDigest = [NSString stringWithUTF8String:argv[3]];
      success = root != nil && modulePath != nil && expectedDigest != nil
        && PAWritePrivateConfig(root)
        && PAInitializeDisposableToken(modulePath, expectedDigest, pin, metadata)
        && PAWriteExact(4, metadata, sizeof(metadata));
    }
    PAWipe(pin, sizeof(pin));
    PAWipe(metadata, sizeof(metadata));
    close(4);
    unsetenv("SOFTHSM2_CONF");
    return success ? 0 : 3;
  }
}
