#import "test_grant_adapter.h"

#import <Foundation/Foundation.h>
#include <errno.h>
#include <unistd.h>

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
    if (argc != 4) return 2;
    NSString *root = [NSString stringWithUTF8String:argv[1]];
    NSString *framePath = [NSString stringWithUTF8String:argv[2]];
    NSString *mode = [NSString stringWithUTF8String:argv[3]];
    NSData *frame = framePath == nil ? nil : [NSData dataWithContentsOfFile:framePath];
    if (root == nil || frame == nil || mode == nil) return 2;
    NSString *journalPath = [[[root stringByAppendingPathComponent:@"generations"]
      stringByAppendingPathComponent:@"provider.synthetic.non-live.generation"]
      stringByAppendingPathComponent:@"journal.sqlite3"];
    PATestGrantAdapter *platform = [[PATestGrantAdapter alloc] initWithMode:mode
                                                               journalPath:journalPath];
    int result = PATestExecuteProviderAttestorFrame(frame, root, platform, platform,
      ^BOOL(NSData *response) {
        return [platform validateBeforeEmission:response] && PAWriteTestResponse(response);
      });
    close(4);
    if (result != 0) return result;
    if ([mode isEqualToString:@"unavailable"]
        && (platform.clockCalls != 2U || platform.contextCalls != 1U
          || platform.displayCalls != 0U || platform.authenticationCalls != 0U
          || platform.signCalls != 0U)) return 5;
    if ([mode isEqualToString:@"replay"]
        && (platform.clockCalls != 0U || platform.contextCalls != 0U
          || platform.displayCalls != 0U || platform.authenticationCalls != 0U
          || platform.signCalls != 0U)) return 5;
    if (([mode isEqualToString:@"grant"] || [mode isEqualToString:@"slow_grant"])
        && (platform.clockCalls != 3U || platform.contextCalls != 1U
          || platform.displayCalls != 1U || platform.authenticationCalls != 1U
          || platform.signCalls != 1U)) return 5;
    if ([mode isEqualToString:@"post_expired"]
        && (platform.clockCalls != 3U || platform.contextCalls != 1U
          || platform.displayCalls != 1U || platform.authenticationCalls != 1U
          || platform.signCalls != 0U)) return 5;
    return 0;
  }
}
