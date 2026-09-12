#import "development_testnet_ui.h"
#import "test_grant_adapter.h"

#include <errno.h>
#include <unistd.h>

#if !defined(PA_DEVELOPMENT_TESTNET_TESTING) || !defined(PA_DEV_TEST_ROOT) \
  || !defined(PA_DEV_TEST_GENERATION_ID) || defined(PA_RELEASE_BUILD)
#error Fake development child UI is isolated to a compiled test variant
#endif

@interface PAStallingDevelopmentAdapter : PATestGrantAdapter
@end
@implementation PAStallingDevelopmentAdapter
- (PAOperatorDisplayOutcome)displayCommittedOperation:(NSString *)displayText {
  PAOperatorDisplayOutcome outcome = [super displayCommittedOperation:displayText];
  if (outcome == PAOperatorDisplayOutcomeContinued) usleep(2000000U);
  return outcome;
}
@end

@interface PADevelopmentTestPINProvider : NSObject <PADisposablePINProvider>
@property(nonatomic) BOOL used;
@end
@implementation PADevelopmentTestPINProvider
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

id<PAPlatformAdapter> PADevelopmentTestnetApprovalAdapter(void) {
  NSString *root = [NSString stringWithUTF8String:PA_DEV_TEST_ROOT];
  NSString *mode = [NSString stringWithContentsOfFile:
    [root stringByAppendingPathComponent:@"test-mode"]
    encoding:NSUTF8StringEncoding error:NULL];
  NSString *journalPath = [[[root stringByAppendingPathComponent:@"generations"]
    stringByAppendingPathComponent:[NSString stringWithUTF8String:PA_DEV_TEST_GENERATION_ID]]
    stringByAppendingPathComponent:@"journal.sqlite3"];
  if (![mode isEqualToString:@"grant"] && ![mode isEqualToString:@"deny"]
      && ![mode isEqualToString:@"replay"] && ![mode isEqualToString:@"stall_approval"]
      && ![mode isEqualToString:@"drop_ready_output"]) return nil;
  if ([mode isEqualToString:@"stall_approval"]) {
    return [[PAStallingDevelopmentAdapter alloc] initWithMode:@"grant"
                                                     journalPath:journalPath];
  }
  return [[PATestGrantAdapter alloc] initWithMode:mode journalPath:journalPath];
}

id<PADisposablePINProvider> PADevelopmentTestnetPINProvider(void) {
  return [[PADevelopmentTestPINProvider alloc] init];
}
