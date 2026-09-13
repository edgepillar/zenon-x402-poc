#import "development_testnet_ui.h"
#import "disposable_token_module_integrity.h"
#import "provider_attestor_private.h"
#import "provider_attestor_private_acl.h"
#if defined(PA_DEVELOPMENT_TESTNET_TESTING)
#import "test_grant_adapter.h"
#endif

#import <Foundation/Foundation.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#if !defined(PA_TESTING) || !defined(PA_DEVELOPMENT_TESTNET_CHILD) \
  || !defined(PA_DISPOSABLE_TOKEN_SIGNING_TEST) || defined(PA_RELEASE_BUILD)
#error Development/testnet child cannot enter a release build
#endif
#if !defined(PA_TEST_FIXTURE_ONLY) || !defined(PA_TEST_AUTHORITY_RECORD_DIGEST) \
  || !defined(PA_TEST_PUBLIC_KEY) || !defined(PA_TEST_CONFIGURATION_DIGEST) \
  || !defined(PA_DEV_MODULE_PATH) || !defined(PA_DEV_MODULE_SHA256) \
  || !defined(PA_DEV_TOKEN_SERIAL) || !defined(PA_DEV_OBJECT_ID_BASE64URL) \
  || !defined(PA_DEV_TOKEN_CONFIGURATION_SHA256)
#error Development/testnet child needs independently compiled nonsecret pins
#endif
#if defined(PA_DEVELOPMENT_TESTNET_TESTING) && defined(PA_SYNTHETIC_MANUAL_GUI_TESTING)
#error Fake-UI and manual-GUI variants cannot be combined
#endif
#if defined(PA_SYNTHETIC_MANUAL_NO_DIALOG_TESTING) \
  && !defined(PA_SYNTHETIC_MANUAL_GUI_TESTING)
#error No-dialog guard is only for the synthetic manual-GUI test variant
#endif
#if defined(PA_DEV_TEST_ROOT) && !defined(PA_DEVELOPMENT_TESTNET_TESTING)
#error A development child cannot accept a test-root override
#endif
#if defined(PA_DEVELOPMENT_TESTNET_TESTING) && !defined(PA_DEV_TEST_ROOT)
#error The fake-UI test child needs a compiled temporary root
#endif
#if defined(PA_SYNTHETIC_MANUAL_GUI_TESTING) \
  && !defined(PA_SYNTHETIC_MANUAL_ROOT_TAG)
#error The manual-GUI test child needs a compiled temporary-root tag
#endif
#if defined(PA_SYNTHETIC_MANUAL_ROOT_TAG) \
  && !defined(PA_SYNTHETIC_MANUAL_GUI_TESTING)
#error The manual-GUI temporary-root tag cannot enter another child
#endif
#if defined(PA_SYNTHETIC_MANUAL_GUI_TESTING)
_Static_assert(sizeof(PA_SYNTHETIC_MANUAL_ROOT_TAG) == 17U,
  "The manual-GUI temporary-root tag must be 16 ASCII bytes");
#endif

FOUNDATION_EXPORT NSString *PASHA256Commitment(NSString *domain, NSData *payload);

static NSString *PADevPinnedString(const char *value) {
  return value == NULL ? nil : [NSString stringWithUTF8String:value];
}

static NSData *PADevBase64URL(NSString *text, NSUInteger length) {
  if (![text isKindOfClass:[NSString class]]) return nil;
  NSString *base64 = [[text stringByReplacingOccurrencesOfString:@"-" withString:@"+"]
    stringByReplacingOccurrencesOfString:@"_" withString:@"/"];
  while (base64.length % 4U != 0U) base64 = [base64 stringByAppendingString:@"="];
  NSData *decoded = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
  if (decoded.length != length) return nil;
  NSString *canonical = [[decoded base64EncodedStringWithOptions:0]
    stringByReplacingOccurrencesOfString:@"+" withString:@"-"];
  canonical = [canonical stringByReplacingOccurrencesOfString:@"/" withString:@"_"];
  canonical = [canonical stringByReplacingOccurrencesOfString:@"=" withString:@""];
  return [canonical isEqualToString:text] ? decoded : nil;
}

static BOOL PADevSamePrivateObject(const struct stat *left, const struct stat *right) {
  return left->st_dev == right->st_dev && left->st_ino == right->st_ino
    && left->st_mode == right->st_mode && left->st_uid == right->st_uid
    && left->st_gid == right->st_gid && left->st_nlink == right->st_nlink
    && left->st_size == right->st_size
    && left->st_ctimespec.tv_sec == right->st_ctimespec.tv_sec
    && left->st_ctimespec.tv_nsec == right->st_ctimespec.tv_nsec;
}

#if defined(PA_SYNTHETIC_MANUAL_GUI_TESTING)
static BOOL PADevDirectoryHasNoACL(const char *path, uid_t owner, mode_t mode) {
  struct stat before;
  if (lstat(path, &before) != 0 || !S_ISDIR(before.st_mode)
      || before.st_uid != owner || before.st_nlink < 1
      || (before.st_mode & 07777U) != mode) return NO;
  int descriptor = open(path, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
  if (descriptor < 0) return NO;
  struct stat opened;
  struct stat after;
  BOOL valid = fstat(descriptor, &opened) == 0
    && PADevSamePrivateObject(&before, &opened)
    && PAHasNoExtendedACL(descriptor)
    && lstat(path, &after) == 0
    && PADevSamePrivateObject(&opened, &after);
  if (close(descriptor) != 0) valid = NO;
  return valid;
}
#endif

static NSString *PADevelopmentRoot(void) {
#if defined(PA_DEVELOPMENT_TESTNET_TESTING)
  return PADevPinnedString(PA_DEV_TEST_ROOT);
#elif defined(PA_SYNTHETIC_MANUAL_GUI_TESTING)
  const char *tag = PA_SYNTHETIC_MANUAL_ROOT_TAG;
  for (size_t index = 0U; index < 16U; index += 1U) {
    if (!((tag[index] >= '0' && tag[index] <= '9')
          || (tag[index] >= 'a' && tag[index] <= 'f'))) return nil;
  }
  const char *temporary = "/private/tmp";
  char canonicalTemporary[PATH_MAX];
  if (realpath(temporary, canonicalTemporary) == NULL
      || strcmp(temporary, canonicalTemporary) != 0) return nil;
  if (!PADevDirectoryHasNoACL(canonicalTemporary, 0, 01777U)) return nil;
  NSString *temporaryRoot = [NSString stringWithUTF8String:canonicalTemporary];
  NSString *leaf = [@"ProviderAttestorSyntheticManualGUI-"
    stringByAppendingString:PADevPinnedString(tag)];
  NSString *testRoot = [temporaryRoot stringByAppendingPathComponent:leaf];
  NSString *ordinaryRoot = PAEffectiveUserApplicationSupportRoot(NULL);
  if (ordinaryRoot == nil) return nil;
  NSString *fixedRoot = [[ordinaryRoot stringByDeletingLastPathComponent]
    stringByAppendingPathComponent:@"ProviderAttestorDevelopmentTestnet"];
  if ([testRoot isEqualToString:fixedRoot]
      || [testRoot hasPrefix:[fixedRoot stringByAppendingString:@"/"]]) return nil;
  char canonicalRoot[PATH_MAX];
  if (realpath(testRoot.fileSystemRepresentation, canonicalRoot) == NULL
      || strcmp(testRoot.fileSystemRepresentation, canonicalRoot) != 0
      || !PADevDirectoryHasNoACL(canonicalRoot, geteuid(), 0700U)) return nil;
  return testRoot;
#else
  NSString *ordinaryRoot = PAEffectiveUserApplicationSupportRoot(NULL);
  if (ordinaryRoot == nil) return nil;
  return [[ordinaryRoot stringByDeletingLastPathComponent]
    stringByAppendingPathComponent:@"ProviderAttestorDevelopmentTestnet"];
#endif
}

static NSData *PAReadOneFrame(int descriptor) {
  NSMutableData *frame = [NSMutableData data];
  const NSUInteger maximum = PAProviderSigningWireRequestMaximumPayloadBytes + 4U;
  uint8_t buffer[4096];
  while (frame.length <= maximum) {
    ssize_t count = read(descriptor, buffer, sizeof(buffer));
    if (count < 0 && errno == EINTR) continue;
    if (count < 0) return nil;
    if (count == 0) break;
    if ((NSUInteger)count > maximum - frame.length) return nil;
    [frame appendBytes:buffer length:(NSUInteger)count];
  }
  if (frame.length < 5U) return nil;
  const uint8_t *bytes = frame.bytes;
  NSUInteger length = ((NSUInteger)bytes[0] << 24U) | ((NSUInteger)bytes[1] << 16U)
    | ((NSUInteger)bytes[2] << 8U) | (NSUInteger)bytes[3];
  return length != 0U && length <= PAProviderSigningWireRequestMaximumPayloadBytes
    && frame.length == length + 4U ? frame : nil;
}

static BOOL PAWriteOneFrame(int descriptor, NSData *frame) {
  const uint8_t *bytes = frame.bytes;
  NSUInteger offset = 0U;
  while (offset < frame.length) {
    ssize_t count = write(descriptor, bytes + offset, frame.length - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return NO;
    offset += (NSUInteger)count;
  }
  return YES;
}

static NSData *PADevReadPrivateConfiguration(NSString *path) {
  int descriptor = open(path.fileSystemRepresentation, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
  if (descriptor < 0) return nil;
  struct stat before;
  BOOL valid = fstat(descriptor, &before) == 0 && S_ISREG(before.st_mode)
    && before.st_uid == geteuid() && before.st_nlink == 1
    && (before.st_mode & 077) == 0 && before.st_size > 0
    && before.st_size <= 64 * 1024 && PAHasNoExtendedACL(descriptor);
  NSMutableData *data = valid ? [NSMutableData dataWithLength:(NSUInteger)before.st_size] : nil;
  NSUInteger offset = 0U;
  while (valid && offset < data.length) {
    ssize_t count = read(descriptor, (uint8_t *)data.mutableBytes + offset, data.length - offset);
    if (count < 0 && errno == EINTR) continue;
    valid = count > 0;
    if (valid) offset += (NSUInteger)count;
  }
  uint8_t extra;
  ssize_t trailing = -1;
  if (valid) {
    do { trailing = read(descriptor, &extra, 1U); } while (trailing < 0 && errno == EINTR);
  }
  struct stat after;
  valid = valid && trailing == 0 && PAHasNoExtendedACL(descriptor)
    && fstat(descriptor, &after) == 0
    && before.st_dev == after.st_dev && before.st_ino == after.st_ino
    && before.st_size == after.st_size
    && before.st_mtimespec.tv_sec == after.st_mtimespec.tv_sec
    && before.st_mtimespec.tv_nsec == after.st_mtimespec.tv_nsec
    && before.st_ctimespec.tv_sec == after.st_ctimespec.tv_sec
    && before.st_ctimespec.tv_nsec == after.st_ctimespec.tv_nsec;
  if (close(descriptor) != 0) valid = NO;
  return valid ? data : nil;
}

static BOOL PADevPinnedConfigurationMatches(NSString *root) {
  NSData *bytes = PADevReadPrivateConfiguration(
    [root stringByAppendingPathComponent:@"configuration.json"]);
  if (bytes == nil
      || ![PASHA256Commitment(@"zenon-x402:provider-attestor-configuration-v1", bytes)
        isEqualToString:PADevPinnedString(PA_TEST_CONFIGURATION_DIGEST)]) return NO;
  id parsed = [NSJSONSerialization JSONObjectWithData:bytes options:0 error:NULL];
  NSDictionary *configuration = [parsed isKindOfClass:[NSDictionary class]] ? parsed : nil;
  NSDictionary *pkcs11 = [configuration[@"pkcs11"] isKindOfClass:[NSDictionary class]]
    ? configuration[@"pkcs11"] : nil;
  return [configuration[@"publicKey"] isEqualToString:PADevPinnedString(PA_TEST_PUBLIC_KEY)]
    && [pkcs11[@"modulePath"] isEqualToString:PADevPinnedString(PA_DEV_MODULE_PATH)]
    && [pkcs11[@"moduleSha256"] isEqualToString:PADevPinnedString(PA_DEV_MODULE_SHA256)]
    && [pkcs11[@"tokenSerial"] isEqualToString:PADevPinnedString(PA_DEV_TOKEN_SERIAL)]
    && [pkcs11[@"objectId"] isEqualToString:PADevPinnedString(PA_DEV_OBJECT_ID_BASE64URL)];
}

static BOOL PADevPinnedTokenConfiguration(NSString *path) {
  const char *filePath = path.fileSystemRepresentation;
  struct stat before;
  if (filePath == NULL || lstat(filePath, &before) != 0
      || !S_ISREG(before.st_mode) || before.st_uid != geteuid()
      || before.st_nlink != 1 || (before.st_mode & 07777U) != 0600U) return NO;
  int descriptor = open(filePath, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
  if (descriptor < 0) return NO;
  struct stat opened;
  struct stat after;
  BOOL valid = fstat(descriptor, &opened) == 0
    && PADevSamePrivateObject(&before, &opened)
    && PAHasNoExtendedACL(descriptor)
    && lstat(filePath, &after) == 0
    && PADevSamePrivateObject(&opened, &after);
  if (close(descriptor) != 0) valid = NO;
  return valid && PAValidateDisposableModuleBytes(path,
    PADevPinnedString(PA_DEV_TOKEN_CONFIGURATION_SHA256));
}

@interface PADevelopmentGuardedSigner : NSObject <PATestSigner>
@property(nonatomic) NSString *root;
@property(nonatomic) NSString *tokenConfiguration;
@property(nonatomic) PADisposableSigner *inner;
@property(nonatomic) BOOL used;
@end

@implementation PADevelopmentGuardedSigner
- (NSData *)signFrozenMessage:(NSData *)message
          operationIdentifier:(NSString *)operationIdentifier {
  if (self.used) return nil;
  self.used = YES;
  if (!PADevPinnedConfigurationMatches(self.root)
      || !PADevPinnedTokenConfiguration(self.tokenConfiguration)) return nil;
  return [self.inner signFrozenMessage:message operationIdentifier:operationIdentifier];
}
@end

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    (void)argv;
    if (argc != 1) return 2;
    NSData *frame = PAReadOneFrame(3);
    close(3);
    NSString *root = PADevelopmentRoot();
    NSData *objectIdentifier = PADevBase64URL(
      PADevPinnedString(PA_DEV_OBJECT_ID_BASE64URL), 16U);
    NSData *publicKey = PADevBase64URL(PADevPinnedString(PA_TEST_PUBLIC_KEY), 32U);
    if (frame == nil || root == nil || objectIdentifier == nil || publicKey == nil) return 2;
    NSString *tokenConfiguration = [root stringByAppendingPathComponent:@"softhsm2.conf"];
    PADisposableSigner *inner = [[PADisposableSigner alloc]
      initWithModulePath:PADevPinnedString(PA_DEV_MODULE_PATH)
       moduleDigest:PADevPinnedString(PA_DEV_MODULE_SHA256)
        tokenSerial:PADevPinnedString(PA_DEV_TOKEN_SERIAL)
   objectIdentifier:objectIdentifier publicKey:publicKey
  tokenConfiguration:tokenConfiguration pinProvider:PADevelopmentTestnetPINProvider()];
    PADevelopmentGuardedSigner *signer = [[PADevelopmentGuardedSigner alloc] init];
    signer.root = root;
    signer.tokenConfiguration = tokenConfiguration;
    signer.inner = inner;
    id<PAPlatformAdapter> platform = PADevelopmentTestnetApprovalAdapter();
    int result = PATestExecuteProviderAttestorFrame(frame, root, platform, signer,
      ^BOOL(NSData *response) {
#if defined(PA_DEVELOPMENT_TESTNET_TESTING)
        if (![platform isKindOfClass:[PATestGrantAdapter class]]
            || ![(PATestGrantAdapter *)platform validateBeforeEmission:response]) return NO;
#endif
        return PAWriteOneFrame(4, response);
      });
    close(4);
    return result;
  }
}
