#import "provider_attestor.h"

#import <Foundation/Foundation.h>
#include <errno.h>
#include <string.h>
#include <unistd.h>

static BOOL PAParseDecimal(const char *text, uint64_t *output) {
  if (text == NULL || *text == '\0') return NO;
  uint64_t value = 0U;
  for (const char *cursor = text; *cursor != '\0'; cursor += 1) {
    if (*cursor < '0' || *cursor > '9') return NO;
    uint64_t digit = (uint64_t)(*cursor - '0');
    if (value > (9007199254740991ULL - digit) / 10U) return NO;
    value = (value * 10U) + digit;
  }
  *output = value;
  return YES;
}

static BOOL PAWriteStandardOutput(NSData *output) {
  const uint8_t *bytes = output.bytes;
  NSUInteger offset = 0U;
  while (offset < output.length) {
    ssize_t written = write(STDOUT_FILENO, bytes + offset, output.length - offset);
    if (written < 0 && errno == EINTR) continue;
    if (written <= 0) return NO;
    offset += (NSUInteger)written;
  }
  return YES;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc == 3 && strcmp(argv[1], "--canonical-json") == 0) {
      NSString *path = [NSString stringWithUTF8String:argv[2]];
      NSData *input = path == nil ? nil
        : [NSData dataWithContentsOfFile:path options:0 error:NULL];
      id parsed = input == nil ? nil : PAParseCanonicalJSONData(input, 1024U * 1024U, NULL);
      NSData *canonical = parsed == nil ? nil : PACanonicalJSONData(parsed, 1024U * 1024U, NULL);
      return canonical != nil && PAWriteStandardOutput(canonical) ? 0 : 3;
    }
    if (argc != 5) return 2;
    NSString *authorityPath = [NSString stringWithUTF8String:argv[1]];
    NSString *framePath = [NSString stringWithUTF8String:argv[2]];
    uint64_t issuedAt = 0U;
    uint64_t validUntil = 0U;
    if (authorityPath == nil || framePath == nil
        || !PAParseDecimal(argv[3], &issuedAt)
        || !PAParseDecimal(argv[4], &validUntil)) return 2;
    NSData *authorityData = [NSData dataWithContentsOfFile:authorityPath options:0 error:NULL];
    NSData *frame = [NSData dataWithContentsOfFile:framePath options:0 error:NULL];
    NSString *authorityText = authorityData == nil
      ? nil
      : [[NSString alloc] initWithData:authorityData encoding:NSUTF8StringEncoding];
    PAAuthority *authority = authorityText == nil
      ? nil
      : PAParseAuthorityRecord(authorityText, NULL);
    PAParsedSigningRequest *request = authority == nil || frame == nil
      ? nil
      : PAParseSigningRequestFrame(frame, authority, NULL);
    NSData *signingBytes = request == nil
      ? nil
      : PACreateAttestationSigningBytes(request, issuedAt, validUntil, NULL);
    if (request == nil || signingBytes == nil) return 3;
    NSDictionary *result = @{
      @"canonicalFrame": PABase64URLString(frame),
      @"signingMessage": PABase64URLString(signingBytes),
    };
    NSData *output = [NSJSONSerialization dataWithJSONObject:result options:0 error:NULL];
    if (output == nil) return 4;
    return PAWriteStandardOutput(output) ? 0 : 4;
  }
}
