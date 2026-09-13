#import "disposable_token_module_integrity.h"
#import "provider_attestor_private_acl.h"

#import <Foundation/Foundation.h>
#if !defined(PA_GUI_BOOTSTRAP_FAKE_UI)
#import <AppKit/AppKit.h>
#endif
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <limits.h>
#include <signal.h>
#include <spawn.h>
#include <stdint.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#if !defined(PA_TESTING) || !defined(PA_DISPOSABLE_TOKEN_SIGNING_TEST) \
  || !defined(PA_SYNTHETIC_BOOTSTRAP_GUI) || defined(PA_RELEASE_BUILD)
#error Synthetic bootstrap GUI collector is test-only
#endif
#if !defined(PA_GUI_BOOTSTRAP_EXECUTABLE_PATH) \
  || !defined(PA_GUI_BOOTSTRAP_EXECUTABLE_SHA256) \
  || !defined(PA_GUI_BOOTSTRAP_MODULE_PATH) \
  || !defined(PA_GUI_BOOTSTRAP_MODULE_SHA256) \
  || !defined(PA_GUI_BOOTSTRAP_ROOT_TAG)
#error Synthetic bootstrap GUI collector requires independently reviewed pins
#endif
#if defined(PA_GUI_BOOTSTRAP_FAKE_UI) && !defined(PA_GUI_BOOTSTRAP_OFFLINE_TEST)
#error Fake UI is only available to the offline test target
#endif

_Static_assert(sizeof(PA_GUI_BOOTSTRAP_ROOT_TAG) == 17U,
               "The private synthetic root tag must have 16 hexadecimal characters");

static void PAWipe(void *memory, size_t length) {
  volatile uint8_t *bytes = memory;
  for (size_t index = 0U; index < length; index += 1U) bytes[index] = 0U;
}

static BOOL PAWriteExact(int descriptor, const uint8_t *bytes, size_t length) {
  size_t offset = 0U;
  while (offset < length) {
    ssize_t count = write(descriptor, bytes + offset, length - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return NO;
    offset += (size_t)count;
  }
  return YES;
}

static BOOL PAValidTag(void) {
  const char *tag = PA_GUI_BOOTSTRAP_ROOT_TAG;
  for (size_t index = 0U; index < 16U; index += 1U) {
    char value = tag[index];
    if (!((value >= '0' && value <= '9') || (value >= 'a' && value <= 'f'))) return NO;
  }
  return tag[16] == '\0';
}

static BOOL PAPrivateParent(int *descriptor) {
  *descriptor = -1;
  char canonical[PATH_MAX];
  if (realpath("/private/tmp", canonical) == NULL
      || strcmp(canonical, "/private/tmp") != 0) return NO;
  struct stat pathStatus;
  if (lstat("/private/tmp", &pathStatus) != 0 || !S_ISDIR(pathStatus.st_mode)
      || pathStatus.st_uid != 0 || (pathStatus.st_mode & 07777U) != 01777U) return NO;
  int opened = open("/private/tmp", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  struct stat fileStatus;
  BOOL valid = opened >= 0 && fstat(opened, &fileStatus) == 0
    && fileStatus.st_dev == pathStatus.st_dev && fileStatus.st_ino == pathStatus.st_ino
    && fileStatus.st_uid == 0 && (fileStatus.st_mode & 07777U) == 01777U
    && PAHasNoExtendedACL(opened);
  if (!valid) {
    if (opened >= 0) close(opened);
    return NO;
  }
  *descriptor = opened;
  return YES;
}

static BOOL PAAbsentAt(int parent, const char *leaf) {
  struct stat status;
  errno = 0;
  return fstatat(parent, leaf, &status, AT_SYMLINK_NOFOLLOW) != 0 && errno == ENOENT;
}

static BOOL PAValidateImageAncestors(const char *path) {
  if (path == NULL || path[0] != '/') return NO;
  char current[PATH_MAX] = { 0 };
  size_t length = strlen(path);
  if (length >= sizeof(current)) return NO;
  for (size_t index = 1U; index < length; index += 1U) {
    if (index != 1U && path[index] != '/') continue;
    if (index == 1U) strcpy(current, "/");
    else { memcpy(current, path, index); current[index] = '\0'; }
    struct stat status;
    if (lstat(current, &status) != 0 || !S_ISDIR(status.st_mode)) return NO;
    BOOL systemTemporary = strcmp(current, "/private/tmp") == 0
      && status.st_uid == 0 && (status.st_mode & 07777U) == 01777U;
    if (!systemTemporary && (status.st_uid != 0 && status.st_uid != geteuid())) return NO;
    if (!systemTemporary && (status.st_mode & 0022U) != 0U) return NO;
    int descriptor = open(current, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    struct stat opened;
    BOOL valid = descriptor >= 0 && fstat(descriptor, &opened) == 0
      && opened.st_dev == status.st_dev && opened.st_ino == status.st_ino
      && PAHasNoExtendedACL(descriptor);
    if (descriptor >= 0 && close(descriptor) != 0) valid = NO;
    if (!valid) return NO;
  }
  return YES;
}

static BOOL PAValidatePinnedImage(NSString *path, NSString *digest, BOOL executable) {
  if (path == nil || !path.isAbsolutePath || digest == nil) return NO;
  const char *name = path.fileSystemRepresentation;
  char canonical[PATH_MAX];
  if (name == NULL || realpath(name, canonical) == NULL || strcmp(name, canonical) != 0
      || !PAValidateImageAncestors(name)) return NO;
  struct stat before;
  if (lstat(name, &before) != 0 || !S_ISREG(before.st_mode)
      || (before.st_uid != geteuid() && before.st_uid != 0) || before.st_nlink != 1
      || (before.st_mode & 0022U) != 0U
      || (executable && (before.st_mode & S_IXUSR) == 0U)) return NO;
  int descriptor = open(name, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  struct stat opened;
  BOOL valid = descriptor >= 0 && fstat(descriptor, &opened) == 0
    && PADisposableSameFile(&before, &opened)
    && PAHasNoExtendedACL(descriptor);
  if (descriptor >= 0 && close(descriptor) != 0) valid = NO;
  return valid && PAValidateDisposableModuleBytes(path, digest);
}

typedef enum { PAPINCancel = 0, PAPINValid = 1, PAPINInvalid = 2 } PAPINResult;

#if defined(PA_GUI_BOOTSTRAP_FAKE_UI)
// Test-only FD6 replaces AppKit. Empty input cancels; exact 16 digits approve.
// The test process supplies bytes over an inherited pipe, never argv or env.
static PAPINResult PACollectPIN(uint8_t pin[16]) {
  uint8_t input[17];
  size_t used = 0U;
  while (used < sizeof(input)) {
    ssize_t count = read(6, input + used, sizeof(input) - used);
    if (count < 0 && errno == EINTR) continue;
    if (count < 0) { PAWipe(input, sizeof(input)); return PAPINInvalid; }
    if (count == 0) break;
    used += (size_t)count;
  }
  uint8_t extra;
  ssize_t trailing;
  do { trailing = read(6, &extra, 1U); } while (trailing < 0 && errno == EINTR);
  close(6);
  PAPINResult result = used == 0U && trailing == 0 ? PAPINCancel : PAPINInvalid;
  if (used == 16U && trailing == 0) {
    result = PAPINValid;
    for (size_t index = 0U; index < 16U; index += 1U) {
      if (input[index] < '0' || input[index] > '9') result = PAPINInvalid;
    }
    if (result == PAPINValid) memcpy(pin, input, 16U);
  }
  PAWipe(input, sizeof(input));
  return result;
}
#else
static PAPINResult PACollectPIN(uint8_t pin[16]) {
  if (![NSThread isMainThread]) return PAPINInvalid;
  @try {
    NSApplication *app = [NSApplication sharedApplication];
    if (app == nil) return PAPINInvalid;
    NSApplicationActivationPolicy previous = app.activationPolicy;
    BOOL changed = [app setActivationPolicy:NSApplicationActivationPolicyRegular];
    if (app.activationPolicy != NSApplicationActivationPolicyRegular
        || (!changed && previous != NSApplicationActivationPolicyRegular)) return PAPINInvalid;
    [app finishLaunching];
    [app activateIgnoringOtherApps:YES];
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:3.0];
    while (!app.active && deadline.timeIntervalSinceNow > 0.0) {
      [[NSRunLoop mainRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
    }
    if (!app.active) return PAPINInvalid;
    NSSecureTextField *field = [[NSSecureTextField alloc]
      initWithFrame:NSMakeRect(0, 0, 340, 28)];
    NSAlert *alert = [[NSAlert alloc] init];
    alert.alertStyle = NSAlertStyleWarning;
    alert.messageText = @"SYNTHETIC/OFFLINE DISPOSABLE TOKEN";
    alert.informativeText = @"Approve creation of one disposable software token under the reviewed private test root. This is not a live-chain or hardware-custody action. Enter the 16-digit one-shot token PIN locally.";
    alert.accessoryView = field;
    [alert addButtonWithTitle:@"Cancel"];
    NSButton *approve = [alert addButtonWithTitle:@"Create disposable token once"];
    approve.keyEquivalent = @"";
    __block BOOL timedOut = NO;
    NSTimer *timer = [NSTimer timerWithTimeInterval:30.0 repeats:NO
      block:^(__unused NSTimer *unused) {
        timedOut = YES;
        NSWindow *window = [NSApp modalWindow];
        if (window != nil) { [NSApp abortModal]; [window orderOut:nil]; }
      }];
    [[NSRunLoop mainRunLoop] addTimer:timer forMode:NSModalPanelRunLoopMode];
    NSModalResponse response = [alert runModal];
    [timer invalidate];
    if (timedOut || response != NSAlertSecondButtonReturn) {
      [field setStringValue:@""];
      return response == NSAlertFirstButtonReturn && !timedOut ? PAPINCancel : PAPINInvalid;
    }
    NSString *value = field.stringValue;
    PAPINResult result = value.length == 16U ? PAPINValid : PAPINInvalid;
    if (result == PAPINValid) {
      unichar characters[16];
      [value getCharacters:characters range:NSMakeRange(0, 16)];
      for (size_t index = 0U; index < 16U; index += 1U) {
        if (characters[index] < '0' || characters[index] > '9') result = PAPINInvalid;
        else pin[index] = (uint8_t)characters[index];
      }
      PAWipe(characters, sizeof(characters));
    }
    [field setStringValue:@""];
    return result;
  } @catch (__unused NSException *exception) { return PAPINInvalid; }
}
#endif

static uint64_t PAMonotonicMilliseconds(void) {
  struct timespec value;
  if (clock_gettime(CLOCK_MONOTONIC, &value) != 0 || value.tv_sec < 0) return 0U;
  return (uint64_t)value.tv_sec * 1000U + (uint64_t)value.tv_nsec / 1000000U;
}

static BOOL PAReadExactMetadataAndExit(int descriptor, pid_t child,
                                      uint8_t output[64], BOOL *reaped) {
  *reaped = NO;
  uint64_t now = PAMonotonicMilliseconds();
  if (now == 0U) return NO;
#if defined(PA_GUI_BOOTSTRAP_OFFLINE_TEST)
  const uint64_t allowance = 1200U;
#else
  const uint64_t allowance = 45000U;
#endif
  uint64_t deadline = now + allowance;
  uint8_t received[65];
  size_t count = 0U;
  BOOL eof = NO;
  BOOL exited = NO;
  int status = 0;
  while (!eof || !exited) {
    now = PAMonotonicMilliseconds();
    if (now == 0U || now >= deadline) return NO;
    if (!exited) {
      pid_t waited = waitpid(child, &status, WNOHANG);
      if (waited == child) { exited = YES; *reaped = YES; }
      else if (waited < 0 && errno != EINTR) return NO;
    }
    if (!eof) {
      struct pollfd item = { .fd = descriptor, .events = POLLIN | POLLHUP };
      int ready = poll(&item, 1U, 25);
      if (ready < 0 && errno == EINTR) continue;
      if (ready < 0) return NO;
      if (ready > 0) {
        ssize_t readCount = read(descriptor, received + count, sizeof(received) - count);
        if (readCount < 0 && errno == EINTR) continue;
        if (readCount < 0) return NO;
        if (readCount == 0) eof = YES;
        else count += (size_t)readCount;
        if (count > 64U) return NO;
      }
    } else {
      struct timespec pause = { .tv_sec = 0, .tv_nsec = 25000000 };
      nanosleep(&pause, NULL);
    }
  }
  BOOL valid = count == 64U && WIFEXITED(status) && WEXITSTATUS(status) == 0;
  if (valid) memcpy(output, received, 64U);
  PAWipe(received, sizeof(received));
  return valid;
}

static BOOL PAWritePrivateMetadata(int root, const uint8_t metadata[64]) {
  int descriptor = openat(root, "bootstrap-metadata.bin",
                          O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
  struct stat status;
  BOOL valid = descriptor >= 0 && fstat(descriptor, &status) == 0
    && S_ISREG(status.st_mode) && status.st_uid == geteuid()
    && status.st_nlink == 1 && (status.st_mode & 07777U) == 0600U
    && PAHasNoExtendedACL(descriptor)
    && PAWriteExact(descriptor, metadata, 64U) && fsync(descriptor) == 0
    && fstat(descriptor, &status) == 0 && status.st_size == 64;
  if (descriptor >= 0 && close(descriptor) != 0) valid = NO;
  return valid && fsync(root) == 0;
}

static BOOL PAEstablishWaitableSIGCHLD(void) {
  struct sigaction action;
  memset(&action, 0, sizeof(action));
  action.sa_handler = SIG_DFL;
  if (sigemptyset(&action.sa_mask) != 0) return NO;
  action.sa_flags = 0;
  return sigaction(SIGCHLD, &action, NULL) == 0;
}

static void PAStopChildBounded(pid_t child) {
  if (child <= 0) return;
  // Never signal an auto-reaped or already-reaped PID: it may have been reused.
  for (;;) {
    pid_t waited = waitpid(child, NULL, WNOHANG);
    if (waited == child) return;
    if (waited == 0) break;
    if (waited < 0 && errno == EINTR) continue;
    return;
  }
  if (kill(child, SIGKILL) != 0 && errno != ESRCH) return;
  uint64_t now = PAMonotonicMilliseconds();
  uint64_t deadline = now == 0U ? 0U : now + 2000U;
  while (now != 0U && now < deadline) {
    pid_t waited = waitpid(child, NULL, WNOHANG);
    if (waited == child || (waited < 0 && errno == ECHILD)) return;
    struct timespec pause = { .tv_sec = 0, .tv_nsec = 25000000 };
    nanosleep(&pause, NULL);
    now = PAMonotonicMilliseconds();
  }
  // Reaping uncertainty is not a retry signal. The private root stays intact.
}

static BOOL PASpawnOneBootstrap(NSString *root, uint8_t pin[16], uint8_t metadata[64]) {
  int pinPipe[2] = { -1, -1 };
  int metadataPipe[2] = { -1, -1 };
  if (pipe(pinPipe) != 0) return NO;
  if (pipe(metadataPipe) != 0) { close(pinPipe[0]); close(pinPipe[1]); return NO; }
  int pinRead = fcntl(pinPipe[0], F_DUPFD_CLOEXEC, 10);
  int metadataWrite = fcntl(metadataPipe[1], F_DUPFD_CLOEXEC, 10);
  close(pinPipe[0]);
  close(metadataPipe[1]);
  if (pinRead < 0 || metadataWrite < 0) {
    if (pinRead >= 0) close(pinRead);
    if (metadataWrite >= 0) close(metadataWrite);
    close(pinPipe[1]); close(metadataPipe[0]);
    return NO;
  }
  posix_spawn_file_actions_t actions;
  posix_spawnattr_t attributes;
  BOOL actionReady = posix_spawn_file_actions_init(&actions) == 0;
  BOOL attributeReady = actionReady && posix_spawnattr_init(&attributes) == 0;
  BOOL valid = attributeReady
    && posix_spawnattr_setflags(&attributes, POSIX_SPAWN_CLOEXEC_DEFAULT) == 0
    && posix_spawn_file_actions_addopen(&actions, 0, "/dev/null", O_RDONLY, 0) == 0
    && posix_spawn_file_actions_addopen(&actions, 1, "/dev/null", O_WRONLY, 0) == 0
    && posix_spawn_file_actions_addopen(&actions, 2, "/dev/null", O_WRONLY, 0) == 0
    && posix_spawn_file_actions_adddup2(&actions, metadataWrite, 4) == 0
    && posix_spawn_file_actions_adddup2(&actions, pinRead, 5) == 0;
  pid_t child = -1;
  char *argv[] = {
    (char *)PA_GUI_BOOTSTRAP_EXECUTABLE_PATH,
    (char *)root.fileSystemRepresentation,
    (char *)PA_GUI_BOOTSTRAP_MODULE_PATH,
    (char *)PA_GUI_BOOTSTRAP_MODULE_SHA256,
    NULL,
  };
  char *emptyEnvironment[] = { NULL };
  // AppKit ran between the initial signal gate and this child boundary.
  if (valid) valid = PAEstablishWaitableSIGCHLD();
  if (valid) valid = posix_spawn(&child, PA_GUI_BOOTSTRAP_EXECUTABLE_PATH,
                                 &actions, &attributes, argv, emptyEnvironment) == 0;
  if (attributeReady) posix_spawnattr_destroy(&attributes);
  if (actionReady) posix_spawn_file_actions_destroy(&actions);
  close(pinRead);
  close(metadataWrite);
  if (!valid) { close(pinPipe[1]); close(metadataPipe[0]); return NO; }
  // Recheck after the single spawn and before any PIN byte is sent. This
  // cannot prove the already mapped executable image against a same-UID swap.
  NSString *executable = @PA_GUI_BOOTSTRAP_EXECUTABLE_PATH;
  NSString *module = @PA_GUI_BOOTSTRAP_MODULE_PATH;
  BOOL pinned = PAValidatePinnedImage(executable,
                  @PA_GUI_BOOTSTRAP_EXECUTABLE_SHA256, YES)
    && PAValidatePinnedImage(module, @PA_GUI_BOOTSTRAP_MODULE_SHA256, NO);
  BOOL sent = pinned && PAWriteExact(pinPipe[1], pin, 16U);
  if (close(pinPipe[1]) != 0) sent = NO;
  PAWipe(pin, 16U);
  BOOL reaped = NO;
  BOOL received = sent && PAReadExactMetadataAndExit(metadataPipe[0], child, metadata, &reaped);
  close(metadataPipe[0]);
  if (!received && !reaped) {
    // The root is a durable one-shot latch; never clean or retry it here.
    PAStopChildBounded(child);
  }
  return received;
}

int main(int argc, const char *argv[]) {
  (void)argv;
  @autoreleasepool {
    int nullOutput = open("/dev/null", O_WRONLY | O_CLOEXEC);
    if (nullOutput < 0) return 3;
    BOOL stderrSuppressed = dup2(nullOutput, STDERR_FILENO) == STDERR_FILENO;
    if (nullOutput != STDERR_FILENO && close(nullOutput) != 0) return 3;
    if (!stderrSuppressed) return 3;
    signal(SIGPIPE, SIG_IGN);
    const char *result = "BOOTSTRAP_GUI=REFUSED\n";
    int parent = -1;
    int root = -1;
    uint8_t pin[16] = { 0 };
    uint8_t metadata[64] = { 0 };
    NSString *leaf = [NSString stringWithFormat:@"ProviderAttestorSyntheticBootstrap-%s",
                       PA_GUI_BOOTSTRAP_ROOT_TAG];
    NSString *rootPath = [@"/private/tmp" stringByAppendingPathComponent:leaf];
    NSString *executable = @PA_GUI_BOOTSTRAP_EXECUTABLE_PATH;
    NSString *module = @PA_GUI_BOOTSTRAP_MODULE_PATH;
    NSString *executableDigest = @PA_GUI_BOOTSTRAP_EXECUTABLE_SHA256;
    NSString *moduleDigest = @PA_GUI_BOOTSTRAP_MODULE_SHA256;
    do {
      if (argc != 1 || !PAEstablishWaitableSIGCHLD()
          || !PAValidTag() || !PAPrivateParent(&parent)
          || !PAAbsentAt(parent, leaf.fileSystemRepresentation)
          || !PAValidatePinnedImage(executable, executableDigest, YES)
          || !PAValidatePinnedImage(module, moduleDigest, NO)) break;
      PAPINResult pinResult = PACollectPIN(pin);
      if (pinResult == PAPINCancel) { result = "BOOTSTRAP_GUI=CANCELLED\n"; break; }
      if (pinResult != PAPINValid) break;
      // Repeat every preflight immediately before the one-way creation boundary.
      if (!PAAbsentAt(parent, leaf.fileSystemRepresentation)
          || !PAValidatePinnedImage(executable, executableDigest, YES)
          || !PAValidatePinnedImage(module, moduleDigest, NO)) break;
      if (mkdirat(parent, leaf.fileSystemRepresentation, 0700) != 0) break;
      result = "BOOTSTRAP_GUI=UNKNOWN\n";
      root = openat(parent, leaf.fileSystemRepresentation,
                    O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
      struct stat status;
      struct stat pathStatus;
      if (root < 0 || fstat(root, &status) != 0
          || fstatat(parent, leaf.fileSystemRepresentation, &pathStatus,
                     AT_SYMLINK_NOFOLLOW) != 0
          || !S_ISDIR(status.st_mode) || status.st_uid != geteuid()
          || status.st_nlink < 1 || (status.st_mode & 07777U) != 0700U
          || status.st_dev != pathStatus.st_dev || status.st_ino != pathStatus.st_ino
          || !PAHasNoExtendedACL(root) || fsync(root) != 0 || fsync(parent) != 0) break;
      if (!PAValidatePinnedImage(executable, executableDigest, YES)
          || !PAValidatePinnedImage(module, moduleDigest, NO)) break;
      if (!PASpawnOneBootstrap(rootPath, pin, metadata)) break;
      if (!PAWritePrivateMetadata(root, metadata)) break;
      result = "BOOTSTRAP_GUI=PASS\n";
    } while (NO);
    PAWipe(pin, sizeof(pin));
    PAWipe(metadata, sizeof(metadata));
    if (root >= 0) close(root);
    if (parent >= 0) close(parent);
    BOOL statusWritten = PAWriteExact(STDOUT_FILENO, (const uint8_t *)result, strlen(result));
    return statusWritten && strcmp(result, "BOOTSTRAP_GUI=PASS\n") == 0 ? 0 : 3;
  }
}
