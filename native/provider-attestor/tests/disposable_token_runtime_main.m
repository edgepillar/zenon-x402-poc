#import "disposable_token_signer.h"
#import "test_grant_adapter.h"

#import <Foundation/Foundation.h>
#include <errno.h>
#include <unistd.h>

#if !defined(PA_TESTING) || !defined(PA_DISPOSABLE_TOKEN_SIGNING_TEST) \
  || !defined(PA_DISPOSABLE_SIGNER_TEST_FAULTS) || defined(PA_RELEASE_BUILD)
#error Disposable token runtime is test-only and cannot enter a release build
#endif

@interface PATestGrantAdapter (PADisposableBridge)
- (BOOL)committedState:(NSString *)state
       approvalStarted:(int)approval
                 field:(NSString *)field
                 value:(NSData *)value;
@end

@interface PAFD5PINProvider : NSObject <PADisposablePINProvider>
@property(nonatomic) BOOL used;
@end

@implementation PAFD5PINProvider
- (BOOL)copyOneShotPIN:(uint8_t [16])pin
   operationIdentifier:(NSString *)operationIdentifier {
  (void)operationIdentifier;
  if (self.used) return NO;
  self.used = YES;
  size_t offset = 0U;
  while (offset < 16U) {
    ssize_t count = read(5, pin + offset, 16U - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) { close(5); return NO; }
    offset += (size_t)count;
  }
  uint8_t extra = 0U;
  ssize_t trailing;
  do { trailing = read(5, &extra, 1U); } while (trailing < 0 && errno == EINTR);
  close(5);
  return trailing == 0;
}
@end

@interface PAInstrumentedDisposableSigner : NSObject <PATestSigner>
@property(nonatomic) PATestGrantAdapter *platform;
@property(nonatomic) NSString *mode;
@property(nonatomic) PADisposableSigner *signer;
@end

@implementation PAInstrumentedDisposableSigner
- (NSData *)signFrozenMessage:(NSData *)message
          operationIdentifier:(NSString *)operationIdentifier {
  if (![self.platform committedState:@"SIGN_ATTEMPTED" approvalStarted:1
                               field:@"signing" value:message]) _exit(32);
  if ([self.mode isEqualToString:@"replay"]) _exit(33);
  return [self.signer signFrozenMessage:message operationIdentifier:operationIdentifier];
}
@end

static NSData *PADecodeTestBase64URL(NSString *text) {
  if (![text isKindOfClass:[NSString class]]) return nil;
  NSString *base64 = [[text stringByReplacingOccurrencesOfString:@"-" withString:@"+"]
    stringByReplacingOccurrencesOfString:@"_" withString:@"/"];
  while (base64.length % 4U != 0U) base64 = [base64 stringByAppendingString:@"="];
  return [[NSData alloc] initWithBase64EncodedString:base64 options:0];
}

static BOOL PAWriteTestResponse(NSData *frame) {
  const uint8_t *bytes = frame.bytes;
  NSUInteger offset = 0U;
  while (offset < frame.length) {
    ssize_t count = write(4, bytes + offset, frame.length - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return NO;
    offset += (NSUInteger)count;
  }
  return YES;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc != 5) return 2;
    NSString *root = [NSString stringWithUTF8String:argv[1]];
    NSString *framePath = [NSString stringWithUTF8String:argv[2]];
    NSString *mode = [NSString stringWithUTF8String:argv[3]];
    NSString *tokenConfiguration = [NSString stringWithUTF8String:argv[4]];
    NSData *frame = framePath == nil ? nil : [NSData dataWithContentsOfFile:framePath];
    NSData *configurationBytes = root == nil ? nil : [NSData dataWithContentsOfFile:
      [root stringByAppendingPathComponent:@"configuration.json"]];
    id parsed = configurationBytes == nil ? nil
      : [NSJSONSerialization JSONObjectWithData:configurationBytes options:0 error:NULL];
    NSDictionary *configuration = [parsed isKindOfClass:[NSDictionary class]] ? parsed : nil;
    NSDictionary *pkcs11 = [configuration[@"pkcs11"] isKindOfClass:[NSDictionary class]]
      ? configuration[@"pkcs11"] : nil;
    NSString *modulePath = pkcs11[@"modulePath"];
    NSString *moduleDigest = pkcs11[@"moduleSha256"];
    NSString *tokenSerial = pkcs11[@"tokenSerial"];
    NSData *objectIdentifier = PADecodeTestBase64URL(pkcs11[@"objectId"]);
    NSData *publicKey = PADecodeTestBase64URL(configuration[@"publicKey"]);
    if (root == nil || frame == nil || mode == nil || tokenConfiguration == nil
        || ![modulePath isKindOfClass:[NSString class]]
        || ![moduleDigest isKindOfClass:[NSString class]]
        || ![tokenSerial isKindOfClass:[NSString class]]
        || objectIdentifier.length != 16U || publicKey.length != 32U
        || ![@[ @"grant", @"drop_ready_output", @"replay", @"bad_pin", @"fail_sign",
                  @"corrupt_signature" ]
          containsObject:mode]) return 2;
    NSString *journalPath = [[[root stringByAppendingPathComponent:@"generations"]
      stringByAppendingPathComponent:@"provider.synthetic.non-live.generation"]
      stringByAppendingPathComponent:@"journal.sqlite3"];
    PATestGrantAdapter *platform = [[PATestGrantAdapter alloc] initWithMode:mode
                                                               journalPath:journalPath];
    PADisposableSigner *softwareSigner = [[PADisposableSigner alloc]
      initWithModulePath:modulePath moduleDigest:moduleDigest tokenSerial:tokenSerial
       objectIdentifier:objectIdentifier publicKey:publicKey
      tokenConfiguration:tokenConfiguration pinProvider:[[PAFD5PINProvider alloc] init]];
    softwareSigner.failSignForTesting = [mode isEqualToString:@"fail_sign"];
    softwareSigner.corruptSignatureForTesting = [mode isEqualToString:@"corrupt_signature"];
    PAInstrumentedDisposableSigner *signer = [[PAInstrumentedDisposableSigner alloc] init];
    signer.platform = platform;
    signer.mode = mode;
    signer.signer = softwareSigner;
    int result = PATestExecuteProviderAttestorFrame(frame, root, platform, signer,
      ^BOOL(NSData *response) {
        return [platform validateBeforeEmission:response] && PAWriteTestResponse(response);
      });
    close(4);
    return result;
  }
}
