#import <CommonCrypto/CommonDigest.h>
#import <Foundation/Foundation.h>
#include <errno.h>
#include <fcntl.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#if !defined(PA_TESTING) || !defined(PA_DISPOSABLE_TOKEN_SIGNING_TEST) \
  || defined(PA_RELEASE_BUILD)
#error Disposable token module validation is test-only
#endif

static int PADisposableHexNibble(uint8_t value) {
  if (value >= '0' && value <= '9') return value - '0';
  if (value >= 'a' && value <= 'f') return value - 'a' + 10;
  return -1;
}

static BOOL PADisposableSameFile(const struct stat *left, const struct stat *right) {
  return left->st_dev == right->st_dev && left->st_ino == right->st_ino
    && left->st_mode == right->st_mode && left->st_uid == right->st_uid
    && left->st_gid == right->st_gid && left->st_nlink == right->st_nlink
    && left->st_size == right->st_size
    && left->st_mtimespec.tv_sec == right->st_mtimespec.tv_sec
    && left->st_mtimespec.tv_nsec == right->st_mtimespec.tv_nsec
    && left->st_ctimespec.tv_sec == right->st_ctimespec.tv_sec
    && left->st_ctimespec.tv_nsec == right->st_ctimespec.tv_nsec;
}

// This pins the test module's on-disk bytes, not dyld's mapped image. Same-UID
// replacement between this check and dlopen remains outside this offline test.
static BOOL PAValidateDisposableModuleBytes(NSString *path, NSString *expectedDigest) {
  if (![path isKindOfClass:[NSString class]] || ![path isAbsolutePath]
      || ![expectedDigest isKindOfClass:[NSString class]]
      || expectedDigest.length != 71U || ![expectedDigest hasPrefix:@"sha256:"]) return NO;
  const char *expected = expectedDigest.UTF8String;
  if (expected == NULL || strlen(expected) != 71U) return NO;
  uint8_t expectedBytes[CC_SHA256_DIGEST_LENGTH];
  for (size_t index = 0U; index < sizeof(expectedBytes); index += 1U) {
    int upper = PADisposableHexNibble((uint8_t)expected[7U + index * 2U]);
    int lower = PADisposableHexNibble((uint8_t)expected[8U + index * 2U]);
    if (upper < 0 || lower < 0) return NO;
    expectedBytes[index] = (uint8_t)((upper << 4) | lower);
  }
  int descriptor = open(path.fileSystemRepresentation, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
  if (descriptor < 0) return NO;
  struct stat before;
  BOOL valid = fstat(descriptor, &before) == 0 && S_ISREG(before.st_mode)
    && before.st_nlink == 1 && before.st_size > 0
    && before.st_size <= 64 * 1024 * 1024;
  CC_SHA256_CTX context;
  valid = valid && CC_SHA256_Init(&context) == 1;
  uint8_t buffer[16384];
  off_t observed = 0;
  while (valid && observed < before.st_size) {
    size_t wanted = sizeof(buffer);
    if ((off_t)wanted > before.st_size - observed) wanted = (size_t)(before.st_size - observed);
    ssize_t count = read(descriptor, buffer, wanted);
    if (count < 0 && errno == EINTR) continue;
    valid = count > 0 && CC_SHA256_Update(&context, buffer, (CC_LONG)count) == 1;
    if (valid) observed += count;
  }
  uint8_t actualBytes[CC_SHA256_DIGEST_LENGTH];
  memset(actualBytes, 0, sizeof(actualBytes));
  valid = valid && CC_SHA256_Final(actualBytes, &context) == 1
    && memcmp(actualBytes, expectedBytes, sizeof(actualBytes)) == 0;
  struct stat after;
  struct stat pathStatus;
  valid = valid && fstat(descriptor, &after) == 0
    && lstat(path.fileSystemRepresentation, &pathStatus) == 0
    && PADisposableSameFile(&before, &after)
    && PADisposableSameFile(&after, &pathStatus);
  if (close(descriptor) != 0) valid = NO;
  volatile uint8_t *wipe = buffer;
  for (size_t index = 0U; index < sizeof(buffer); index += 1U) wipe[index] = 0U;
  wipe = actualBytes;
  for (size_t index = 0U; index < sizeof(actualBytes); index += 1U) wipe[index] = 0U;
  return valid;
}
