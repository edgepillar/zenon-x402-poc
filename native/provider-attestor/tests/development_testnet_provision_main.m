#import "provider_attestor.h"
#import "disposable_token_module_integrity.h"
#import "provider_attestor_private_acl.h"

#import <Foundation/Foundation.h>
#if !defined(PA_DEV_PROVISION_FAKE_UI)
#import <AppKit/AppKit.h>
#endif
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <poll.h>
#include <pwd.h>
#include <signal.h>
#include <spawn.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#if !defined(PA_TESTING) || !defined(PA_DISPOSABLE_TOKEN_SIGNING_TEST) \
  || !defined(PA_DEVELOPMENT_TESTNET_PROVISION) || defined(PA_RELEASE_BUILD)
#error Development provisioning cannot enter a release build
#endif
#if !defined(PA_DEV_PROVISION_PLAN_SHA256) \
  || !defined(PA_DEV_PROVISION_VERIFIER_PATH) \
  || !defined(PA_DEV_PROVISION_VERIFIER_SHA256)
#error Development provisioning needs independently reviewed plan and verifier pins
#endif
#if defined(PA_DEV_PROVISION_FAKE_UI) != defined(PA_DEV_PROVISION_OFFLINE_TEST)
#error Fake UI is available only to the isolated offline provisioning variant
#endif
#if defined(PA_DEV_PROVISION_OFFLINE_TEST)
#if !defined(PA_DEV_PROVISION_TEST_TAG)
#error Offline provisioning needs a compiled temporary-base tag
#endif
_Static_assert(sizeof(PA_DEV_PROVISION_TEST_TAG) == 17U,
               "The private offline base tag must have 16 hexadecimal characters");
#elif defined(PA_DEV_PROVISION_TEST_TAG)
#error A development provisioner cannot select an offline base
#endif

static NSString *const PARootLeaf = @"ProviderAttestorDevelopmentTestnet";
static NSString *const PAStagingLeaf = @"ProviderAttestorDevelopmentTestnetStaging";
static const NSUInteger PAMaximumPlanBytes = 64U * 1024U;
static NSArray<NSString *> *PADevelopmentAncestorPaths;

static void PAWipe(void *memory, size_t length) {
  volatile uint8_t *bytes = memory;
  for (size_t index = 0U; index < length; index += 1U) bytes[index] = 0U;
}

static uint64_t PANowMilliseconds(void) {
  struct timespec value;
  if (clock_gettime(CLOCK_MONOTONIC, &value) != 0 || value.tv_sec < 0
      || (uint64_t)value.tv_sec > (UINT64_MAX - 1000U) / 1000U) return 0U;
  return (uint64_t)value.tv_sec * 1000U + (uint64_t)value.tv_nsec / 1000000U;
}

static BOOL PAWriteExact(int descriptor, const void *memory, size_t length) {
  const uint8_t *bytes = memory;
  size_t used = 0U;
  while (used < length) {
    ssize_t count = write(descriptor, bytes + used, length - used);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return NO;
    used += (size_t)count;
  }
  return YES;
}

static BOOL PANonblocking(int descriptor) {
  int flags = fcntl(descriptor, F_GETFL);
  return flags >= 0 && fcntl(descriptor, F_SETFL, flags | O_NONBLOCK) == 0;
}

static BOOL PAUnnamedLocalAddress(const struct sockaddr_un *address, socklen_t length) {
  const socklen_t prefix = offsetof(struct sockaddr_un, sun_path);
  if (address->sun_family != AF_UNIX || length < prefix || length > sizeof(*address)) return NO;
  // The kernel can return padding for an unnamed address. Every returned
  // pathname byte must remain empty.
  for (socklen_t index = 0U; index < length - prefix; index += 1U) {
    if (address->sun_path[index] != '\0') return NO;
  }
  return YES;
}

static BOOL PAPrivateInputChannel(int descriptor) {
  struct stat status;
  if (fstat(descriptor, &status) != 0) return NO;
  if (S_ISFIFO(status.st_mode)) return YES;
  if (!S_ISSOCK(status.st_mode)) return NO;
  int type = 0;
  socklen_t typeLength = sizeof(type);
  struct sockaddr_un local = { 0 };
  struct sockaddr_un peer = { 0 };
  socklen_t localLength = sizeof(local);
  socklen_t peerLength = sizeof(peer);
  return getsockopt(descriptor, SOL_SOCKET, SO_TYPE, &type, &typeLength) == 0
    && typeLength == sizeof(type) && type == SOCK_STREAM
    && getsockname(descriptor, (struct sockaddr *)&local, &localLength) == 0
    // A connected peer is required; a listening or unconnected socket is not
    // an input channel.
    && getpeername(descriptor, (struct sockaddr *)&peer, &peerLength) == 0
    && PAUnnamedLocalAddress(&local, localLength)
    && PAUnnamedLocalAddress(&peer, peerLength);
}

// The sole plan and offline UI inputs are bounded inherited pipes or connected,
// unnamed local stream channels followed by EOF. No endpoint is opened here.
// They are not paths, environment selectors, or attestation request frames.
static NSData *PAReadPipeToEOF(int descriptor, NSUInteger maximumBytes) {
  if (!PAPrivateInputChannel(descriptor) || !PANonblocking(descriptor)) return nil;
  uint64_t now = PANowMilliseconds();
  if (now == 0U || now > UINT64_MAX - 5000U) return nil;
  uint64_t deadline = now + 5000U;
  NSMutableData *data = [NSMutableData data];
  uint8_t buffer[4096];
  while ((now = PANowMilliseconds()) != 0U && now < deadline) {
    struct pollfd item = { .fd = descriptor, .events = POLLIN | POLLHUP };
    int ready = poll(&item, 1U, 25);
    if (ready < 0 && errno == EINTR) continue;
    if (ready < 0 || (item.revents & (POLLERR | POLLNVAL)) != 0) return nil;
    if (ready == 0) continue;
    ssize_t count = read(descriptor, buffer, sizeof(buffer));
    if (count < 0 && (errno == EINTR || errno == EAGAIN)) continue;
    if (count < 0) return nil;
    if (count == 0) return [data copy];
    if ((NSUInteger)count > maximumBytes - data.length) return nil;
    [data appendBytes:buffer length:(NSUInteger)count];
  }
  return nil;
}

static BOOL PAExactDictionary(id value, NSArray<NSString *> *keys) {
  if (![value isKindOfClass:[NSDictionary class]] || [value count] != keys.count) return NO;
  for (NSString *key in keys) if (value[key] == nil) return NO;
  return YES;
}

static BOOL PAUnsignedInteger(id value, uint64_t *output) {
  if (![value isKindOfClass:[NSNumber class]]
      || CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()) return NO;
  const char *text = [value stringValue].UTF8String;
  if (text == NULL || text[0] == '\0') return NO;
  uint64_t number = 0U;
  for (size_t index = 0U; text[index] != '\0'; index += 1U) {
    if (text[index] < '0' || text[index] > '9' || number > 9007199254740991ULL / 10U) return NO;
    number = number * 10U + (uint64_t)(text[index] - '0');
    if (number > 9007199254740991ULL) return NO;
  }
  *output = number;
  return YES;
}

static BOOL PADigest(id value) {
  if (![value isKindOfClass:[NSString class]] || [value length] != 71U
      || ![value hasPrefix:@"sha256:"]) return NO;
  for (NSUInteger index = 7U; index < 71U; index += 1U) {
    unichar unit = [value characterAtIndex:index];
    if (!((unit >= '0' && unit <= '9') || (unit >= 'a' && unit <= 'f'))) return NO;
  }
  return YES;
}

static NSString *PARawDigest(NSData *data) {
  if (data == nil || data.length > UINT32_MAX) return nil;
  uint8_t digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
  NSMutableString *text = [NSMutableString stringWithString:@"sha256:"];
  for (NSUInteger index = 0U; index < sizeof(digest); index += 1U) {
    [text appendFormat:@"%02x", digest[index]];
  }
  PAWipe(digest, sizeof(digest));
  return text;
}

static BOOL PAAbsoluteCanonicalSpelling(id value) {
  if (![value isKindOfClass:[NSString class]] || ![value isAbsolutePath]
      || [value length] < 1U || [value length] > 4096U) return NO;
  NSData *bytes = [value dataUsingEncoding:NSUTF8StringEncoding allowLossyConversion:NO];
  if (bytes == nil || bytes.length >= PATH_MAX) return NO;
  const uint8_t *units = bytes.bytes;
  for (NSUInteger index = 0U; index < bytes.length; index += 1U) {
    if (units[index] < 0x20U || units[index] == 0x7fU) return NO;
  }
  // Foundation standardization can rewrite a canonical system temporary path.
  // Check spelling lexically; realpath equality is a separate ownership gate.
  NSUInteger start = 1U;
  for (NSUInteger index = 1U; index <= bytes.length; index += 1U) {
    if (index != bytes.length && units[index] != '/') continue;
    NSUInteger length = index - start;
    if (length == 0U && bytes.length != 1U) return NO;
    if ((length == 1U && units[start] == '.')
        || (length == 2U && units[start] == '.' && units[start + 1U] == '.')) return NO;
    start = index + 1U;
  }
  return YES;
}

static BOOL PAPinnedImageShape(id value) {
  return PAExactDictionary(value, @[ @"path", @"sha256" ])
    && PAAbsoluteCanonicalSpelling(value[@"path"]) && PADigest(value[@"sha256"]);
}

static NSDictionary *PAReadPlan(void) {
  NSData *bytes = PAReadPipeToEOF(3, PAMaximumPlanBytes);
  close(3);
  if (bytes.length == 0U || !PADigest(@PA_DEV_PROVISION_PLAN_SHA256)
      || ![PARawDigest(bytes) isEqualToString:@PA_DEV_PROVISION_PLAN_SHA256]) return nil;
  id plan = PAParseCanonicalJSONData(bytes, PAMaximumPlanBytes, NULL);
  uint64_t version = 0U;
  uint64_t validity = 0U;
  NSArray *templateKeys = @[
    @"authorityRecordVersion", @"authorityProfileId", @"authorityProfileVersion",
    @"verifierVersion", @"providerAuthorityId", @"generationId", @"generationVersion",
    @"keyId", @"algorithm", @"network", @"chainProfile", @"observerPolicy",
    @"confirmationPolicy", @"bootstrapCheckpoint", @"sourcePolicyCommitment",
    @"maximumAttestationBytes", @"maximumCanonicalBytes", @"maximumInitialAgeSeconds",
    @"maximumFutureSkewSeconds", @"maximumValiditySeconds",
  ];
  if (!PAExactDictionary(plan, @[ @"planVersion", @"purpose", @"authorityRecordTemplate",
        @"bootstrapExecutable", @"module", @"validitySeconds" ])
      || !PAUnsignedInteger(plan[@"planVersion"], &version) || version != 1U
      || ![plan[@"purpose"] isEqualToString:
        @"zenon-x402-development-testnet-disposable-provider-attestor"]
      || !PAExactDictionary(plan[@"authorityRecordTemplate"], templateKeys)
      || !PAPinnedImageShape(plan[@"bootstrapExecutable"])
      || !PAPinnedImageShape(plan[@"module"])
      || [plan[@"bootstrapExecutable"][@"path"] isEqualToString:plan[@"module"][@"path"]]
      || !PAUnsignedInteger(plan[@"validitySeconds"], &validity) || validity == 0U) return nil;
  // Matches the existing JS preflight's parser-only key. It never becomes a
  // generated record, metadata value, or child pin.
  uint8_t parserKey[32];
  for (NSUInteger index = 0U; index < sizeof(parserKey); index += 1U) parserKey[index] = (uint8_t)(index + 1U);
  NSMutableDictionary *template = [plan[@"authorityRecordTemplate"] mutableCopy];
  template[@"publicKey"] = PABase64URLString([NSData dataWithBytes:parserKey length:sizeof(parserKey)]);
  NSData *record = PACanonicalJSONData(template, PAMaximumPlanBytes, NULL);
  PAAuthority *authority = record == nil ? nil : PAParseAuthorityRecord(
    [[NSString alloc] initWithData:record encoding:NSUTF8StringEncoding], NULL);
  PAWipe(parserKey, sizeof(parserKey));
  if (authority == nil || ![authority.fields[@"network"] isEqualToString:@"zenon:testnet"]
      || validity > authority.maximumValiditySeconds) return nil;
  return @{ @"value": plan, @"bytes": bytes };
}

static BOOL PASameDirectory(const struct stat *left, const struct stat *right) {
  return S_ISDIR(left->st_mode) && S_ISDIR(right->st_mode)
    && left->st_dev == right->st_dev && left->st_ino == right->st_ino
    && left->st_uid == right->st_uid && left->st_gid == right->st_gid
    && left->st_mode == right->st_mode;
}

// This predicate is used only for the three source-derived support ancestors.
// Rebuild from visited entries instead of duplicating the original ACL: an
// incomplete enumeration must not compare equal by leaving entries untouched.
static BOOL PAEqualAncestorACL(acl_t original, acl_t expected) {
  ssize_t length = acl_size(original);
  ssize_t expectedLength = acl_size(expected);
  if (length <= 0 || length != expectedLength || length > 64 * 1024) return NO;
  void *left = calloc((size_t)length, 1U);
  void *right = calloc((size_t)length, 1U);
  BOOL valid = left != NULL && right != NULL
    && acl_copy_ext_native(left, original, length) == length
    && acl_copy_ext_native(right, expected, length) == length
    && memcmp(left, right, (size_t)length) == 0;
  free(left);
  free(right);
  return valid;
}

static BOOL PAHasOnlyDevelopmentDeleteDenyACL(int descriptor) {
  errno = 0;
  acl_t original = acl_get_fd_np(descriptor, ACL_TYPE_EXTENDED);
  if (original == NULL) return errno == ENOENT;
  acl_t expected = acl_init(0);
  BOOL valid = expected != NULL && acl_valid(original) == 0;
  BOOL complete = NO;
  int cursor = ACL_FIRST_ENTRY;
  for (unsigned int count = 0U; valid && count <= ACL_MAX_ENTRIES; count += 1U) {
    acl_entry_t entry;
    errno = 0;
    int found = acl_get_entry(original, cursor, &entry);
    if (found == -1 && errno == EINVAL) { complete = YES; break; }
    if (found != 0 || count == ACL_MAX_ENTRIES) { valid = NO; break; }
    acl_tag_t tag;
    acl_permset_mask_t permissions = 0U;
    acl_entry_t normalized;
    acl_flagset_t flags;
    valid = acl_get_tag_type(entry, &tag) == 0 && tag == ACL_EXTENDED_DENY
      && acl_get_permset_mask_np(entry, &permissions) == 0
      && permissions == (acl_permset_mask_t)ACL_DELETE
      && acl_create_entry(&expected, &normalized) == 0
      && acl_copy_entry(normalized, entry) == 0
      && acl_get_flagset_np(normalized, &flags) == 0
      && acl_clear_flags_np(flags) == 0
      && acl_set_flagset_np(normalized, flags) == 0;
    cursor = ACL_NEXT_ENTRY;
  }
  valid = valid && complete && acl_valid(expected) == 0
    && PAEqualAncestorACL(original, expected);
  if (expected != NULL && acl_free(expected) != 0) valid = NO;
  if (acl_free(original) != 0) valid = NO;
  return valid;
}

static BOOL PAValidateAncestors(NSString *path) {
  if (!PAAbsoluteCanonicalSpelling(path)) return NO;
  const char *name = path.fileSystemRepresentation;
  char current[PATH_MAX] = { 0 };
  size_t length = strlen(name);
  for (size_t index = 1U; index < length; index += 1U) {
    if (index != 1U && name[index] != '/') continue;
    if (index == 1U) strcpy(current, "/");
    else { memcpy(current, name, index); current[index] = '\0'; }
    struct stat before;
    if (lstat(current, &before) != 0 || !S_ISDIR(before.st_mode)
        || (before.st_uid != 0 && before.st_uid != geteuid())) return NO;
    BOOL temporary = strcmp(current, "/private/tmp") == 0 && before.st_uid == 0
      && (before.st_mode & 07777U) == 01777U;
    if (!temporary && ((before.st_mode & 0022U) != 0U
        || (before.st_mode & 07000U) != 0U)) return NO;
    int descriptor = open(current, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    struct stat opened;
    struct stat after;
    NSString *ancestor = [NSString stringWithUTF8String:current];
    BOOL eligible = [PADevelopmentAncestorPaths containsObject:ancestor];
    BOOL valid = descriptor >= 0 && fstat(descriptor, &opened) == 0
      && PASameDirectory(&before, &opened)
      && (eligible ? PAHasOnlyDevelopmentDeleteDenyACL(descriptor) : PAHasNoExtendedACL(descriptor))
      && lstat(current, &after) == 0 && PASameDirectory(&opened, &after);
    if (descriptor >= 0 && close(descriptor) != 0) valid = NO;
    if (!valid) return NO;
  }
  return YES;
}

static BOOL PAValidatePinnedImage(NSString *path, NSString *digest, BOOL executable) {
  if (!PAAbsoluteCanonicalSpelling(path) || !PADigest(digest)) return NO;
  char canonical[PATH_MAX];
  const char *name = path.fileSystemRepresentation;
  struct stat before;
  if (realpath(name, canonical) == NULL || strcmp(canonical, name) != 0
      || !PAValidateAncestors(path) || lstat(name, &before) != 0
      || !S_ISREG(before.st_mode) || before.st_nlink != 1
      || (before.st_uid != 0 && before.st_uid != geteuid())
      || (before.st_mode & 0022U) != 0U || (before.st_mode & 07000U) != 0U
      || (executable && (before.st_mode & S_IXUSR) == 0U)) return NO;
  int descriptor = open(name, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  struct stat opened;
  BOOL valid = descriptor >= 0 && fstat(descriptor, &opened) == 0
    && PADisposableSameFile(&before, &opened) && PAHasNoExtendedACL(descriptor);
  if (descriptor >= 0 && close(descriptor) != 0) valid = NO;
  return valid && PAValidateDisposableModuleBytes(path, digest);
}

static BOOL PAImagesMatch(NSDictionary *plan) {
  return PAValidatePinnedImage(plan[@"bootstrapExecutable"][@"path"],
      plan[@"bootstrapExecutable"][@"sha256"], YES)
    && PAValidatePinnedImage(plan[@"module"][@"path"], plan[@"module"][@"sha256"], NO)
    && PAValidatePinnedImage(@PA_DEV_PROVISION_VERIFIER_PATH,
      @PA_DEV_PROVISION_VERIFIER_SHA256, YES);
}

static NSString *PABasePath(void) {
#if defined(PA_DEV_PROVISION_OFFLINE_TEST)
  const char *tag = PA_DEV_PROVISION_TEST_TAG;
  for (NSUInteger index = 0U; index < 16U; index += 1U) {
    if (!((tag[index] >= '0' && tag[index] <= '9')
        || (tag[index] >= 'a' && tag[index] <= 'f'))) return nil;
  }
  if (tag[16] != '\0') return nil;
  // This branch has no account-root lookup and cannot select the real root.
  NSString *container = [NSString stringWithFormat:
    @"/private/tmp/ProviderAttestorDevelopmentProvisionTest-%s", tag];
  return [container stringByAppendingPathComponent:@"Home/Library/Application Support/ZenonX402"];
#else
  long suggested = sysconf(_SC_GETPW_R_SIZE_MAX);
  size_t size = suggested > 0 && suggested < 1024L * 1024L ? (size_t)suggested : 16384U;
  char *buffer = calloc(size, 1U);
  if (buffer == NULL) return nil;
  struct passwd record;
  struct passwd *result = NULL;
  NSString *base = nil;
  if (getpwuid_r(geteuid(), &record, buffer, size, &result) == 0
      && result != NULL && record.pw_dir != NULL && record.pw_dir[0] == '/') {
    NSString *home = [NSString stringWithUTF8String:record.pw_dir];
    base = [[home stringByAppendingPathComponent:@"Library/Application Support"]
      stringByAppendingPathComponent:@"ZenonX402"];
  }
  free(buffer);
  return base;
#endif
}

static BOOL PACaptureDevelopmentAncestorScope(NSString *base) {
  if (PADevelopmentAncestorPaths != nil || !PAAbsoluteCanonicalSpelling(base)
      || ![base.lastPathComponent isEqualToString:@"ZenonX402"]) return NO;
  NSString *support = [base stringByDeletingLastPathComponent];
  NSString *library = [support stringByDeletingLastPathComponent];
  NSString *home = [library stringByDeletingLastPathComponent];
  if (![support.lastPathComponent isEqualToString:@"Application Support"]
      || ![library.lastPathComponent isEqualToString:@"Library"]
      || !PAAbsoluteCanonicalSpelling(home)) return NO;
  PADevelopmentAncestorPaths = @[ home, library, support ];
  return YES;
}

static int PAOpenPrivateDirectory(NSString *path) {
  char canonical[PATH_MAX];
  struct stat before;
  if (!PAAbsoluteCanonicalSpelling(path) || !PAValidateAncestors(path)
      || realpath(path.fileSystemRepresentation, canonical) == NULL
      || strcmp(canonical, path.fileSystemRepresentation) != 0
      || lstat(path.fileSystemRepresentation, &before) != 0
      || !S_ISDIR(before.st_mode) || before.st_uid != geteuid()
      || (before.st_mode & 07777U) != 0700U || before.st_nlink < 1) return -1;
  int descriptor = open(path.fileSystemRepresentation,
    O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  struct stat opened;
  struct stat after;
  BOOL valid = descriptor >= 0 && fstat(descriptor, &opened) == 0
    && PASameDirectory(&before, &opened) && PAHasNoExtendedACL(descriptor)
    && lstat(path.fileSystemRepresentation, &after) == 0
    && PASameDirectory(&opened, &after);
  if (!valid) { if (descriptor >= 0) close(descriptor); return -1; }
  return descriptor;
}

static BOOL PADirectoryStillOwned(NSString *path, int descriptor) {
  int checked = PAOpenPrivateDirectory(path);
  struct stat left;
  struct stat right;
  BOOL valid = checked >= 0 && fstat(checked, &left) == 0
    && fstat(descriptor, &right) == 0 && PASameDirectory(&left, &right);
  if (checked >= 0 && close(checked) != 0) valid = NO;
  return valid;
}

static BOOL PAAbsentAt(int parent, NSString *leaf) {
  struct stat status;
  errno = 0;
  return fstatat(parent, leaf.fileSystemRepresentation, &status, AT_SYMLINK_NOFOLLOW) != 0
    && errno == ENOENT;
}

typedef enum { PAPINCancel, PAPINValid, PAPINInvalid } PAPINResult;

static PAPINResult PACollectPIN(NSDictionary *plan, uint8_t pin[16]) {
#if defined(PA_DEV_PROVISION_FAKE_UI)
  (void)plan;
  NSData *input = PAReadPipeToEOF(6, 17U);
  close(6);
  if (input == nil) return PAPINInvalid;
  if (input.length == 0U) return PAPINCancel;
  if (input.length != 16U) return PAPINInvalid;
  const uint8_t *bytes = input.bytes;
  for (NSUInteger index = 0U; index < 16U; index += 1U) {
    if (bytes[index] < '0' || bytes[index] > '9') return PAPINInvalid;
  }
  memcpy(pin, bytes, 16U);
  return PAPINValid;
#else
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
    NSDate *foregroundDeadline = [NSDate dateWithTimeIntervalSinceNow:3.0];
    while (!app.active && foregroundDeadline.timeIntervalSinceNow > 0.0) {
      [[NSRunLoop mainRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
    }
    if (!app.active) return PAPINInvalid;
    NSData *review = PACanonicalJSONData(plan, PAMaximumPlanBytes, NULL);
    if (review == nil) return PAPINInvalid;
    NSTextView *text = [[NSTextView alloc] initWithFrame:NSMakeRect(0, 0, 720, 400)];
    text.string = [[NSString alloc] initWithData:review encoding:NSUTF8StringEncoding];
    text.editable = NO;
    text.selectable = YES;
    text.richText = NO;
    text.textContainer.widthTracksTextView = YES;
    NSScrollView *scroll = [[NSScrollView alloc] initWithFrame:NSMakeRect(0, 36, 740, 420)];
    scroll.hasVerticalScroller = YES;
    scroll.documentView = text;
    NSSecureTextField *field = [[NSSecureTextField alloc]
      initWithFrame:NSMakeRect(0, 0, 340, 28)];
    NSView *accessory = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 740, 456)];
    [accessory addSubview:scroll];
    [accessory addSubview:field];
    NSAlert *alert = [[NSAlert alloc] init];
    alert.alertStyle = NSAlertStyleWarning;
    alert.messageText = @"DEVELOPMENT/TESTNET SOFTWARE TOKEN PROVISIONING";
    alert.informativeText = @"Review the independently approved public plan. Create one dedicated copyable development token at the fixed private root and choose its 16-digit private PIN. This is provisioning consent only, not attestation approval, signing, READY, hardware custody, or live funding. Partial state is preserved without retry.";
    alert.accessoryView = accessory;
    [alert addButtonWithTitle:@"Cancel"];
    NSButton *create = [alert addButtonWithTitle:@"Prepare development token once"];
    create.keyEquivalent = @"";
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
      field.stringValue = @"";
      return response == NSAlertFirstButtonReturn && !timedOut ? PAPINCancel : PAPINInvalid;
    }
    NSString *value = field.stringValue;
    PAPINResult result = value.length == 16U ? PAPINValid : PAPINInvalid;
    if (result == PAPINValid) {
      unichar characters[16];
      [value getCharacters:characters range:NSMakeRange(0, 16)];
      for (NSUInteger index = 0U; index < 16U; index += 1U) {
        if (characters[index] < '0' || characters[index] > '9') result = PAPINInvalid;
        else pin[index] = (uint8_t)characters[index];
      }
      PAWipe(characters, sizeof(characters));
    }
    field.stringValue = @"";
    return result;
  } @catch (__unused NSException *exception) { return PAPINInvalid; }
#endif
}

static BOOL PAEstablishWaitableSIGCHLD(void) {
  struct sigaction action;
  memset(&action, 0, sizeof(action));
  action.sa_handler = SIG_DFL;
  return sigemptyset(&action.sa_mask) == 0 && sigaction(SIGCHLD, &action, NULL) == 0;
}

static void PAStopOwnedChildBounded(pid_t child) {
  if (child <= 0) return;
  pid_t waited;
  do { waited = waitpid(child, NULL, WNOHANG); } while (waited < 0 && errno == EINTR);
  // Only a proven, still-unreaped exact child can be signaled. ECHILD or other
  // uncertainty is not permission to signal a potentially reused PID.
  if (waited != 0) return;
  if (kill(child, SIGKILL) != 0 && errno != ESRCH) return;
  uint64_t now = PANowMilliseconds();
  if (now == 0U || now > UINT64_MAX - 2000U) return;
  uint64_t deadline = now + 2000U;
  while ((now = PANowMilliseconds()) != 0U && now < deadline) {
    waited = waitpid(child, NULL, WNOHANG);
    if (waited == child || (waited < 0 && errno == ECHILD)) return;
    if (waited < 0 && errno != EINTR) return;
    struct timespec pause = { .tv_sec = 0, .tv_nsec = 25000000 };
    nanosleep(&pause, NULL);
  }
}

static BOOL PAReceiveMetadata(int descriptor, pid_t child, uint8_t metadata[64], BOOL *reaped) {
  *reaped = NO;
  if (!PANonblocking(descriptor)) return NO;
  uint64_t now = PANowMilliseconds();
#if defined(PA_DEV_PROVISION_OFFLINE_TEST)
  const uint64_t allowance = 1200U;
#else
  const uint64_t allowance = 45000U;
#endif
  if (now == 0U || now > UINT64_MAX - allowance) return NO;
  uint64_t deadline = now + allowance;
  uint8_t received[65] = { 0 };
  size_t used = 0U;
  BOOL eof = NO;
  int status = 0;
  BOOL valid = NO;
  while ((now = PANowMilliseconds()) != 0U && now < deadline) {
    if (!*reaped) {
      pid_t waited = waitpid(child, &status, WNOHANG);
      if (waited == child) *reaped = YES;
      else if (waited < 0 && errno != EINTR) break;
    }
    if (eof && *reaped) {
      valid = used == 64U && WIFEXITED(status) && WEXITSTATUS(status) == 0;
      break;
    }
    if (eof) {
      struct timespec pause = { .tv_sec = 0, .tv_nsec = 25000000 };
      nanosleep(&pause, NULL);
      continue;
    }
    struct pollfd item = { .fd = descriptor, .events = POLLIN | POLLHUP };
    int ready = poll(&item, 1U, 25);
    if (ready < 0 && errno == EINTR) continue;
    if (ready < 0 || (item.revents & (POLLERR | POLLNVAL)) != 0) break;
    if (ready == 0) continue;
    ssize_t count = read(descriptor, received + used, sizeof(received) - used);
    if (count < 0 && (errno == EINTR || errno == EAGAIN)) continue;
    if (count < 0) break;
    if (count == 0) eof = YES;
    else used += (size_t)count;
    if (used > 64U) break;
  }
  if (valid) memcpy(metadata, received, 64U);
  PAWipe(received, sizeof(received));
  return valid;
}

static BOOL PASpawnBootstrap(NSDictionary *plan, NSString *basePath, int base,
                             NSString *rootPath, int root, uint8_t pin[16], uint8_t metadata[64]) {
  int pinPipe[2] = { -1, -1 };
  int metadataPipe[2] = { -1, -1 };
  if (pipe(pinPipe) != 0) return NO;
  if (pipe(metadataPipe) != 0) { close(pinPipe[0]); close(pinPipe[1]); return NO; }
  int pinRead = fcntl(pinPipe[0], F_DUPFD_CLOEXEC, 10);
  int metadataWrite = fcntl(metadataPipe[1], F_DUPFD_CLOEXEC, 10);
  close(pinPipe[0]);
  close(metadataPipe[1]);
  posix_spawn_file_actions_t actions;
  posix_spawnattr_t attributes;
  BOOL actionsReady = NO;
  BOOL attributesReady = NO;
  BOOL valid = pinRead >= 0 && metadataWrite >= 0;
  if (valid) actionsReady = posix_spawn_file_actions_init(&actions) == 0;
  if (actionsReady) attributesReady = posix_spawnattr_init(&attributes) == 0;
  valid = valid && attributesReady
    && posix_spawnattr_setflags(&attributes, POSIX_SPAWN_CLOEXEC_DEFAULT) == 0
    && posix_spawn_file_actions_addopen(&actions, 0, "/dev/null", O_RDONLY, 0) == 0
    && posix_spawn_file_actions_addopen(&actions, 1, "/dev/null", O_WRONLY, 0) == 0
    && posix_spawn_file_actions_addopen(&actions, 2, "/dev/null", O_WRONLY, 0) == 0
    && posix_spawn_file_actions_adddup2(&actions, metadataWrite, 4) == 0
    && posix_spawn_file_actions_adddup2(&actions, pinRead, 5) == 0;
  NSString *executable = plan[@"bootstrapExecutable"][@"path"];
  NSString *module = plan[@"module"][@"path"];
  NSString *moduleDigest = plan[@"module"][@"sha256"];
  char *argv[] = { (char *)executable.fileSystemRepresentation,
    (char *)rootPath.fileSystemRepresentation, (char *)module.fileSystemRepresentation,
    (char *)moduleDigest.UTF8String, NULL };
  char *emptyEnvironment[] = { NULL };
  pid_t child = -1;
  if (valid) valid = PAEstablishWaitableSIGCHLD()
    && PADirectoryStillOwned(basePath, base) && PADirectoryStillOwned(rootPath, root)
    && PAAbsentAt(base, PAStagingLeaf) && PAImagesMatch(plan);
  if (valid) valid = posix_spawn(&child, executable.fileSystemRepresentation,
    &actions, &attributes, argv, emptyEnvironment) == 0;
  if (attributesReady) posix_spawnattr_destroy(&attributes);
  if (actionsReady) posix_spawn_file_actions_destroy(&actions);
  if (pinRead >= 0) close(pinRead);
  if (metadataWrite >= 0) close(metadataWrite);
  if (!valid) { close(pinPipe[1]); close(metadataPipe[0]); return NO; }
  // Recheck after spawn and before dispatching any credential bytes. These
  // checks still cannot prove the already mapped image against same-UID swaps.
  BOOL reaped = NO;
  BOOL received = NO;
  @try {
    BOOL sent = PADirectoryStillOwned(basePath, base) && PADirectoryStillOwned(rootPath, root)
      && PAImagesMatch(plan) && PANonblocking(pinPipe[1])
      && PAWriteExact(pinPipe[1], pin, 16U);
    if (close(pinPipe[1]) != 0) sent = NO;
    pinPipe[1] = -1;
    PAWipe(pin, 16U);
    received = sent && PAReceiveMetadata(metadataPipe[0], child, metadata, &reaped);
  } @catch (__unused NSException *exception) {
    received = NO;
  } @finally {
    if (pinPipe[1] >= 0) close(pinPipe[1]);
    PAWipe(pin, 16U);
    if (close(metadataPipe[0]) != 0) received = NO;
    if (!received && !reaped) PAStopOwnedChildBounded(child);
  }
  return received && PAImagesMatch(plan);
}

static NSData *PAReadPrivateFile(int parent, NSString *leaf, NSUInteger maximum) {
  int descriptor = openat(parent, leaf.fileSystemRepresentation, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  struct stat before;
  BOOL valid = descriptor >= 0 && fstat(descriptor, &before) == 0
    && S_ISREG(before.st_mode) && before.st_uid == geteuid() && before.st_nlink == 1
    && (before.st_mode & 07777U) == 0600U && before.st_size > 0
    && (uint64_t)before.st_size <= maximum && PAHasNoExtendedACL(descriptor);
  NSMutableData *data = valid ? [NSMutableData dataWithLength:(NSUInteger)before.st_size] : nil;
  size_t used = 0U;
  while (valid && used < data.length) {
    ssize_t count = read(descriptor, (uint8_t *)data.mutableBytes + used, data.length - used);
    if (count < 0 && errno == EINTR) continue;
    valid = count > 0;
    if (valid) used += (size_t)count;
  }
  uint8_t extra;
  ssize_t trailing = -1;
  if (valid) do { trailing = read(descriptor, &extra, 1U); } while (trailing < 0 && errno == EINTR);
  struct stat after;
  struct stat name;
  valid = valid && trailing == 0 && fstat(descriptor, &after) == 0
    && fstatat(parent, leaf.fileSystemRepresentation, &name, AT_SYMLINK_NOFOLLOW) == 0
    && PADisposableSameFile(&before, &after) && PADisposableSameFile(&after, &name)
    && PAHasNoExtendedACL(descriptor);
  if (descriptor >= 0 && close(descriptor) != 0) valid = NO;
  return valid ? [data copy] : nil;
}

static BOOL PAWritePrivateFile(int parent, NSString *leaf, NSData *bytes) {
  if (bytes.length == 0U) return NO;
  int descriptor = openat(parent, leaf.fileSystemRepresentation,
    O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
  struct stat status;
  BOOL valid = descriptor >= 0 && fstat(descriptor, &status) == 0
    && S_ISREG(status.st_mode) && status.st_uid == geteuid() && status.st_nlink == 1
    && (status.st_mode & 07777U) == 0600U && PAHasNoExtendedACL(descriptor)
    && PAWriteExact(descriptor, bytes.bytes, bytes.length) && fsync(descriptor) == 0;
  if (descriptor >= 0 && close(descriptor) != 0) valid = NO;
  return valid && fsync(parent) == 0
    && [PAReadPrivateFile(parent, leaf, bytes.length) isEqualToData:bytes];
}

static BOOL PAMakePrivateDirectory(int parent, NSString *leaf) {
  if (mkdirat(parent, leaf.fileSystemRepresentation, 0700) != 0) return NO;
  int descriptor = openat(parent, leaf.fileSystemRepresentation,
    O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  struct stat status;
  BOOL valid = descriptor >= 0 && fstat(descriptor, &status) == 0
    && S_ISDIR(status.st_mode) && status.st_uid == geteuid()
    && (status.st_mode & 07777U) == 0700U && PAHasNoExtendedACL(descriptor)
    && fsync(descriptor) == 0 && fsync(parent) == 0;
  if (descriptor >= 0 && close(descriptor) != 0) valid = NO;
  return valid;
}

static NSString *PAHeaderString(NSString *value) {
  NSData *bytes = PACanonicalJSONData(@[ value ], 16384U, NULL);
  NSString *array = bytes == nil ? nil : [[NSString alloc] initWithData:bytes encoding:NSUTF8StringEncoding];
  return array.length > 2U ? [array substringWithRange:NSMakeRange(1U, array.length - 2U)] : nil;
}

static BOOL PAPrepareArtifacts(NSDictionary *plan, NSString *rootPath, int root,
                               const uint8_t metadata[64]) {
  NSData *publicBytes = [NSData dataWithBytes:metadata length:32U];
  NSData *objectBytes = [NSData dataWithBytes:metadata + 32U length:16U];
  NSString *serial = [[NSString alloc] initWithBytes:metadata + 48U length:16U
    encoding:NSASCIIStringEncoding];
  if (serial == nil) return NO;
  for (NSUInteger index = 0U; index < serial.length; index += 1U) {
    unichar unit = [serial characterAtIndex:index];
    if (unit < 0x20U || unit > 0x7eU) return NO;
  }
  serial = [serial stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@" "]];
  if (serial.length == 0U) return NO;
  NSMutableDictionary *record = [plan[@"authorityRecordTemplate"] mutableCopy];
  record[@"publicKey"] = PABase64URLString(publicBytes);
  NSData *authorityBytes = PACanonicalJSONData(record, PAMaximumPlanBytes, NULL);
  NSString *authorityText = authorityBytes == nil ? nil
    : [[NSString alloc] initWithData:authorityBytes encoding:NSUTF8StringEncoding];
  PAAuthority *authority = authorityText == nil ? nil : PAParseAuthorityRecord(authorityText, NULL);
  if (authority == nil) return NO;
  NSString *tokensPath = [rootPath stringByAppendingPathComponent:@"tokens"];
  int tokens = PAOpenPrivateDirectory(tokensPath);
  if (tokens < 0) return NO;
  BOOL tokenDirectoryValid = close(tokens) == 0;
  NSData *tokenConfiguration = PAReadPrivateFile(root, @"softhsm2.conf", PAMaximumPlanBytes);
  NSData *expectedTokenConfiguration = [[NSString stringWithFormat:
    @"directories.tokendir = %@\nobjectstore.backend = file\nlog.level = ERROR\n", tokensPath]
    dataUsingEncoding:NSUTF8StringEncoding];
  if (!tokenDirectoryValid || ![tokenConfiguration isEqualToData:expectedTokenConfiguration]) return NO;
  NSDictionary *configuration = @{
    @"authorityRecord": authorityText,
    @"authorityRecordDigest": authority.recordDigest,
    @"configurationVersion": @1,
    @"developmentMode": @"Development/Testnet Software Attestor",
    @"generationCommitment": authority.generationCommitment,
    @"journalSchemaVersion": @1,
    @"keyId": authority.keyIdentifier,
    // Required dormant schema slots, not actual Keychain service/account choices.
    @"keychain": @{ @"account": @"development-software-token-unused",
                    @"service": @"development-software-token-unused" },
    // Independently pinned configuration slot. This preparer never executes it;
    // the development signer self-verifies through its pinned software module.
    @"opensslVerifier": @{ @"path": @PA_DEV_PROVISION_VERIFIER_PATH,
                          @"sha256": @PA_DEV_PROVISION_VERIFIER_SHA256 },
    @"pkcs11": @{ @"modulePath": plan[@"module"][@"path"],
                  @"moduleSha256": plan[@"module"][@"sha256"],
                  @"objectId": PABase64URLString(objectBytes), @"tokenSerial": serial },
    @"publicKey": record[@"publicKey"],
    @"validitySeconds": plan[@"validitySeconds"],
  };
  NSData *configurationBytes = PACanonicalJSONData(configuration, PAMaximumPlanBytes, NULL);
  if (configurationBytes == nil) return NO;
  NSString *configurationDigest = PASHA256Commitment(
    @"zenon-x402:provider-attestor-configuration-v1", configurationBytes);
  NSString *tokenDigest = PARawDigest(tokenConfiguration);
  NSDictionary *pins = @{
    @"PA_TEST_AUTHORITY_RECORD_DIGEST": authority.recordDigest,
    @"PA_TEST_PUBLIC_KEY": record[@"publicKey"],
    @"PA_TEST_CONFIGURATION_DIGEST": configurationDigest,
    @"PA_DEV_MODULE_PATH": plan[@"module"][@"path"],
    @"PA_DEV_MODULE_SHA256": plan[@"module"][@"sha256"],
    @"PA_DEV_TOKEN_SERIAL": serial,
    @"PA_DEV_OBJECT_ID_BASE64URL": PABase64URLString(objectBytes),
    @"PA_DEV_TOKEN_CONFIGURATION_SHA256": tokenDigest,
  };
  NSMutableString *header = [NSMutableString stringWithString:
    @"// Development-only generated nonsecret bindings; not installed-image qualification.\n#define PA_TEST_FIXTURE_ONLY 1\n"];
  for (NSString *key in [[pins allKeys] sortedArrayUsingSelector:@selector(compare:)]) {
    NSString *quoted = PAHeaderString(pins[key]);
    if (quoted == nil) return NO;
    [header appendFormat:@"#define %@ %@\n", key, quoted];
  }
  if (!PAMakePrivateDirectory(root, @"generations")) return NO;
  int generations = openat(root, "generations", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  BOOL directoriesValid = generations >= 0
    && PAMakePrivateDirectory(generations, authority.fields[@"generationId"]);
  if (generations >= 0 && close(generations) != 0) directoriesValid = NO;
  if (!directoriesValid || !PAWritePrivateFile(root, @"bootstrap-metadata.bin",
        [NSData dataWithBytes:metadata length:64U])
      || !PAWritePrivateFile(root, @"configuration.json", configurationBytes)
      || !PAWritePrivateFile(root, @"development-testnet-pins.h",
        [header dataUsingEncoding:NSUTF8StringEncoding])) return NO;
  NSDictionary *manifest = @{
    @"manifestVersion": @1, @"status": @"PREREQUISITES_ONLY",
    @"planSha256": @PA_DEV_PROVISION_PLAN_SHA256,
    @"authorityRecordDigest": authority.recordDigest,
    @"configurationDigest": configurationDigest,
    @"tokenConfigurationSha256": tokenDigest,
    @"bootstrapSha256": plan[@"bootstrapExecutable"][@"sha256"],
    @"moduleSha256": plan[@"module"][@"sha256"],
    @"verifierSha256": @PA_DEV_PROVISION_VERIFIER_SHA256,
  };
  NSData *manifestBytes = PACanonicalJSONData(manifest, PAMaximumPlanBytes, NULL);
  return manifestBytes != nil && PAWritePrivateFile(root, @"provision-manifest.json", manifestBytes);
}

int main(int argc, const char *argv[]) {
  (void)argv;
  @autoreleasepool {
    int output = fcntl(STDOUT_FILENO, F_DUPFD_CLOEXEC, 10);
    int nullOutput = open("/dev/null", O_WRONLY | O_CLOEXEC);
    if (output < 0 || nullOutput < 0) return 3;
    BOOL suppressed = dup2(nullOutput, STDOUT_FILENO) == STDOUT_FILENO
      && dup2(nullOutput, STDERR_FILENO) == STDERR_FILENO;
    if (nullOutput != STDOUT_FILENO && nullOutput != STDERR_FILENO) close(nullOutput);
    if (!suppressed || signal(SIGPIPE, SIG_IGN) == SIG_ERR) { close(output); return 3; }
    const char *result = "DEVELOPMENT_PROVISION=REFUSED\n";
    int base = -1;
    int root = -1;
    uint8_t pin[16] = { 0 };
    uint8_t metadata[64] = { 0 };
    @try {
      do {
        if (argc != 1 || !PAEstablishWaitableSIGCHLD()) break;
        NSDictionary *captured = PAReadPlan();
        NSDictionary *plan = captured[@"value"];
        NSString *basePath = PABasePath();
        NSString *rootPath = [basePath stringByAppendingPathComponent:PARootLeaf];
        if (plan == nil || basePath == nil || !PACaptureDevelopmentAncestorScope(basePath)
            || (base = PAOpenPrivateDirectory(basePath)) < 0
            || !PAAbsentAt(base, PARootLeaf) || !PAAbsentAt(base, PAStagingLeaf)
            || !PAImagesMatch(plan)) break;
        PAPINResult input = PACollectPIN(plan, pin);
        if (input == PAPINCancel) { result = "DEVELOPMENT_PROVISION=CANCELLED\n"; break; }
        if (input != PAPINValid || !PADirectoryStillOwned(basePath, base)
            || !PAAbsentAt(base, PARootLeaf) || !PAAbsentAt(base, PAStagingLeaf)
            || !PAImagesMatch(plan)) break;
        // From the first creation attempt onward, never erase state or retry.
        result = "DEVELOPMENT_PROVISION=UNKNOWN\n";
        if (mkdirat(base, PARootLeaf.fileSystemRepresentation, 0700) != 0
            || (root = PAOpenPrivateDirectory(rootPath)) < 0
            || fsync(root) != 0 || fsync(base) != 0
            || !PAWritePrivateFile(root, @"provision-plan.json", captured[@"bytes"])
            || !PASpawnBootstrap(plan, basePath, base, rootPath, root, pin, metadata)
            || !PADirectoryStillOwned(basePath, base) || !PADirectoryStillOwned(rootPath, root)
            || !PAPrepareArtifacts(plan, rootPath, root, metadata)
            || !PADirectoryStillOwned(basePath, base) || !PADirectoryStillOwned(rootPath, root)
            || !PAAbsentAt(base, PAStagingLeaf) || !PAImagesMatch(plan)
            || fsync(root) != 0 || fsync(base) != 0) break;
        result = "DEVELOPMENT_PROVISION=PREPARED\n";
      } while (NO);
    } @catch (__unused NSException *exception) {
      // Keep the last conservative fixed result and every created artifact.
    }
    PAWipe(pin, sizeof(pin));
    PAWipe(metadata, sizeof(metadata));
    if (root >= 0 && close(root) != 0) result = "DEVELOPMENT_PROVISION=UNKNOWN\n";
    if (base >= 0 && close(base) != 0) result = "DEVELOPMENT_PROVISION=UNKNOWN\n";
    BOOL written = PAWriteExact(output, result, strlen(result));
    if (close(output) != 0) written = NO;
    return written && strcmp(result, "DEVELOPMENT_PROVISION=PREPARED\n") == 0 ? 0 : 3;
  }
}
