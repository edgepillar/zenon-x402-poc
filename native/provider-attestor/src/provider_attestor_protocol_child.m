#import "provider_attestor.h"

#import <Foundation/Foundation.h>
#include <errno.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>

// No independently approved, fixed authority is provisioned in this draft.
// These must be fixed and reviewed together before any response is enabled.
#if defined(PA_SYNTHETIC_CHILD_TESTING) && defined(PA_RELEASE_BUILD)
#error Synthetic child pins cannot be used in a release build
#elif defined(PA_SYNTHETIC_CHILD_TESTING)
#if !defined(PA_TEST_AUTHORITY_RECORD) || !defined(PA_TEST_AUTHORITY_RECORD_DIGEST)
#error Synthetic child tests require a compiled authority record and digest
#endif
static const char *const PACompiledAuthorityRecord = PA_TEST_AUTHORITY_RECORD;
static const char *const PACompiledAuthorityDigest = PA_TEST_AUTHORITY_RECORD_DIGEST;
#else
static const char *const PACompiledAuthorityRecord = NULL;
static const char *const PACompiledAuthorityDigest = NULL;
#endif

static BOOL PAReadExact(int descriptor, uint8_t *destination, NSUInteger length) {
  NSUInteger offset = 0U;
  while (offset < length) {
    ssize_t count = read(descriptor, destination + offset, length - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return NO;
    offset += (NSUInteger)count;
  }
  return YES;
}

static NSData *PAReadOneFrame(int descriptor) {
  uint8_t prefix[4];
  if (!PAReadExact(descriptor, prefix, sizeof(prefix))) return nil;
  NSUInteger length = ((NSUInteger)prefix[0] << 24U) | ((NSUInteger)prefix[1] << 16U)
    | ((NSUInteger)prefix[2] << 8U) | (NSUInteger)prefix[3];
  if (length == 0U || length > PAProviderSigningWireRequestMaximumPayloadBytes) return nil;
  NSMutableData *frame = [NSMutableData dataWithLength:length + sizeof(prefix)];
  if (frame == nil) return nil;
  uint8_t *bytes = frame.mutableBytes;
  memcpy(bytes, prefix, sizeof(prefix));
  if (!PAReadExact(descriptor, bytes + sizeof(prefix), length)) return nil;
  uint8_t trailing = 0U;
  ssize_t extra;
  do { extra = read(descriptor, &trailing, 1U); } while (extra < 0 && errno == EINTR);
  return extra == 0 ? [frame copy] : nil;
}

static PAAuthority *PAIndependentPinnedAuthority(void) {
  if (PACompiledAuthorityRecord == NULL || PACompiledAuthorityDigest == NULL) return nil;
  NSString *record = [NSString stringWithUTF8String:PACompiledAuthorityRecord];
  NSString *expected = [NSString stringWithUTF8String:PACompiledAuthorityDigest];
  PAAuthority *authority = record == nil ? nil : PAParseAuthorityRecord(record, NULL);
  return authority != nil && [authority.recordDigest isEqualToString:expected]
    ? authority : nil;
}

static NSData *PAApprovalRequiredResponse(NSData *frame) {
  PAAuthority *authority = PAIndependentPinnedAuthority();
  if (authority == nil) return nil;
  PAParsedSigningRequest *request = PAParseSigningRequestFrame(frame, authority, NULL);
  if (request == nil) return nil;
  return PAFrameSigningResponse(@{
    @"protocolVersion": @1,
    @"messageType": @"zenon-funding-provider-signing-response",
    @"operationId": request.operationIdentifier,
    @"status": @"APPROVAL_REQUIRED",
    @"reasonCode": @"OPERATOR_APPROVAL_REQUIRED",
    @"envelope": [NSNull null],
  }, 512U * 1024U, NULL);
}

static BOOL PAWriteExact(int descriptor, NSData *data) {
  const uint8_t *bytes = data.bytes;
  NSUInteger offset = 0U;
  while (offset < data.length) {
    ssize_t count = write(descriptor, bytes + offset, data.length - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return NO;
    offset += (NSUInteger)count;
  }
  return YES;
}

int main(int argc, const char *argv[]) {
  (void)argv;
  @autoreleasepool {
    if (argc != 1) return 2;
    NSData *frame = PAReadOneFrame(3);
    close(3);
    NSData *response = frame == nil ? nil : PAApprovalRequiredResponse(frame);
    if (response == nil) {
      close(4);
      return 3;
    }
    BOOL written = PAWriteExact(4, response);
    if (close(4) != 0) written = NO;
    return written ? 0 : 4;
  }
}
