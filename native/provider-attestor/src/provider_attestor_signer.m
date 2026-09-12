#import "provider_attestor_private.h"
#import "pkcs11_minimal.h"

#import <CommonCrypto/CommonDigest.h>
#import <Foundation/Foundation.h>
#include <crt_externs.h>
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <mach/machine.h>
#include <mach-o/loader.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/acl.h>
#include <sys/stat.h>
#include <unistd.h>

#if defined(PA_SIGNER_LOADER_TESTING) && defined(PA_RELEASE_BUILD)
#error The mocked loader owner policy cannot compile in a release build
#endif

static NSString *const PASignerErrorDomain = @"org.zenon-x402.provider-attestor.signer";
static const CK_RV CKR_CRYPTOKI_ALREADY_INITIALIZED_VALUE = 0x00000191UL;
// Development-only SoftHSM 2.7.0 key profile v1: RFC 8032 curveName encoded
// as the exact DER PrintableString "edwards25519". Both objects must use this
// same representation. RFC 8410 OID DER and mixed/alternate encodings are not
// aliases for this pinned profile; a different policy needs separate review.
static const uint8_t PADevSoftHSM27CurveNameV1[] = {
  0x13U, 0x0cU, 'e', 'd', 'w', 'a', 'r', 'd', 's', '2', '5', '5', '1', '9'
};

// Fixed at build time; generation configuration cannot choose a release root.
// The directory is not provisioned by this source tree or its test targets.
static NSString *const PATrustedImageDirectory =
  @"/Library/Application Support/ZenonX402/ProviderAttestor/images";

// Static checks do not establish dyld's mapped-image identity, hardened-runtime
// state, or a provider's runtime plugin behavior. Holding a descriptor does not
// bind dyld to it. Release signing stays denied pending independent review.
static BOOL PADynamicLoaderQualified(void) {
  return NO;
}

@interface PASignerSession ()

@property(nonatomic) void *moduleHandle;
@property(nonatomic) CK_FUNCTION_LIST_PTR functions;
@property(nonatomic) CK_SESSION_HANDLE sessionHandle;
@property(nonatomic) CK_OBJECT_HANDLE privateKeyHandle;
@property(nonatomic) BOOL initialized;
@property(nonatomic) BOOL sessionOpen;
@property(nonatomic) BOOL loggedIn;
@property(nonatomic) BOOL signAttempted;
@property(nonatomic) NSString *modulePath;
@property(nonatomic) NSString *moduleDigest;
@property(nonatomic) uid_t effectiveUser;

@end

@implementation PASignerSession
@end

static BOOL PASignerFail(NSError **error, NSInteger code) {
  if (error != NULL) {
    *error = [NSError errorWithDomain:PASignerErrorDomain code:code userInfo:@{}];
  }
  return NO;
}

static BOOL PALoadFunction(void *library, const char *name, void *output, size_t outputSize) {
  if (outputSize != sizeof(void *)) return NO;
  void *symbol = dlsym(library, name);
  if (symbol == NULL) return NO;
  memcpy(output, &symbol, sizeof(symbol));
  return YES;
}

static void PAZeroMemory(void *memory, size_t length) {
  volatile uint8_t *bytes = memory;
  while (length > 0U) {
    *bytes = 0U;
    bytes += 1;
    length -= 1U;
  }
}

void PAZeroMutableData(NSMutableData *data) {
  if (data == nil || data.length == 0U) return;
  PAZeroMemory(data.mutableBytes, data.length);
  data.length = 0U;
}

static NSString *PAFileSHA256(int descriptor, off_t expectedSize) {
  if (lseek(descriptor, 0, SEEK_SET) < 0) return nil;
  CC_SHA256_CTX context;
  if (CC_SHA256_Init(&context) != 1) return nil;
  uint8_t buffer[16384];
  off_t observed = 0;
  while (observed < expectedSize) {
    size_t wanted = sizeof(buffer);
    if ((off_t)wanted > expectedSize - observed) wanted = (size_t)(expectedSize - observed);
    ssize_t count = read(descriptor, buffer, wanted);
    if (count <= 0) {
      PAZeroMemory(buffer, sizeof(buffer));
      return nil;
    }
    if (CC_SHA256_Update(&context, buffer, (CC_LONG)count) != 1) {
      PAZeroMemory(buffer, sizeof(buffer));
      return nil;
    }
    observed += count;
  }
  PAZeroMemory(buffer, sizeof(buffer));
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  if (CC_SHA256_Final(digest, &context) != 1) return nil;
  static const char hex[] = "0123456789abcdef";
  char rendered[(CC_SHA256_DIGEST_LENGTH * 2U) + 1U];
  for (size_t index = 0U; index < CC_SHA256_DIGEST_LENGTH; index += 1U) {
    rendered[index * 2U] = hex[digest[index] >> 4U];
    rendered[(index * 2U) + 1U] = hex[digest[index] & 0x0fU];
  }
  PAZeroMemory(digest, sizeof(digest));
  rendered[CC_SHA256_DIGEST_LENGTH * 2U] = '\0';
  return [@"sha256:" stringByAppendingString:[NSString stringWithUTF8String:rendered]];
}

static BOOL PAEqualFileStatus(const struct stat *a, const struct stat *b) {
  return a->st_dev == b->st_dev && a->st_ino == b->st_ino
    && a->st_mode == b->st_mode && a->st_uid == b->st_uid
    && a->st_gid == b->st_gid && a->st_nlink == b->st_nlink
    && a->st_size == b->st_size
    && a->st_mtimespec.tv_sec == b->st_mtimespec.tv_sec
    && a->st_mtimespec.tv_nsec == b->st_mtimespec.tv_nsec
    && a->st_ctimespec.tv_sec == b->st_ctimespec.tv_sec
    && a->st_ctimespec.tv_nsec == b->st_ctimespec.tv_nsec;
}

// POSIX mode bits alone do not rule out a macOS ACL granting a non-root
// principal write access. Require an absent/empty extended ACL for every
// directory and image; ACL inspection failure is not a permissive fallback.
static BOOL PANoExtendedACL(int descriptor) {
  errno = 0;
  acl_t acl = acl_get_fd_np(descriptor, ACL_TYPE_EXTENDED);
  if (acl == NULL) return errno == ENOENT;
  acl_entry_t first;
  errno = 0;
  int found = acl_get_entry(acl, ACL_FIRST_ENTRY, &first);
  BOOL empty = found == -1 && errno == EINVAL;
  acl_free(acl);
  return empty;
}

static BOOL PAOwnerDirectory(int descriptor, uid_t trustedOwner) {
  struct stat status;
  return fstat(descriptor, &status) == 0 && S_ISDIR(status.st_mode)
    && (status.st_uid == 0U || status.st_uid == trustedOwner)
    && (status.st_mode & 0022U) == 0U
    && (status.st_mode & 07000U) == 0U
    && PANoExtendedACL(descriptor);
}

// Walk from /, never following a symlink in any component. In a release
// trustedOwner is always root; a non-root owner is injectable only by a
// separately compiled test entry point below.
static int PAOpenTrustedDirectory(NSString *directory, uid_t trustedOwner) {
  if (![directory isKindOfClass:[NSString class]] || !directory.isAbsolutePath
      || directory.length < 2U || directory.length >= PATH_MAX) return -1;
  const char *path = directory.fileSystemRepresentation;
  if (path == NULL || path[0] != '/' || path[1] == '\0') return -1;
  int current = open("/", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (current < 0 || !PAOwnerDirectory(current, trustedOwner)) {
    if (current >= 0) close(current);
    return -1;
  }
  const char *cursor = path + 1;
  while (*cursor != '\0') {
    const char *end = strchr(cursor, '/');
    size_t length = end == NULL ? strlen(cursor) : (size_t)(end - cursor);
    if (length == 0U || length > NAME_MAX
        || (length == 1U && cursor[0] == '.')
        || (length == 2U && cursor[0] == '.' && cursor[1] == '.')) {
      close(current);
      return -1;
    }
    char component[NAME_MAX + 1U];
    memcpy(component, cursor, length);
    component[length] = '\0';
    int next = openat(current, component,
                      O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    close(current);
    if (next < 0 || !PAOwnerDirectory(next, trustedOwner)) {
      if (next >= 0) close(next);
      return -1;
    }
    current = next;
    if (end == NULL) break;
    cursor = end + 1;
  }
  return current;
}

static BOOL PAExpectedDigest(NSString *digest) {
  if (![digest isKindOfClass:[NSString class]] || digest.length != 71U
      || ![digest hasPrefix:@"sha256:"]) return NO;
  for (NSUInteger index = 7U; index < 71U; index += 1U) {
    unichar value = [digest characterAtIndex:index];
    if (!((value >= '0' && value <= '9') || (value >= 'a' && value <= 'f'))) return NO;
  }
  return YES;
}

static BOOL PAReadAt(int descriptor, void *buffer, size_t length, off_t offset) {
  uint8_t *cursor = buffer;
  while (length > 0U) {
    ssize_t count = pread(descriptor, cursor, length, offset);
    if (count <= 0) return NO;
    cursor += (size_t)count;
    offset += count;
    length -= (size_t)count;
  }
  return YES;
}

static BOOL PASystemDylibName(const char *name) {
  if (strncmp(name, "/usr/lib/", 9U) != 0
      && strncmp(name, "/System/Library/", 16U) != 0) return NO;
  const char *component = name + 1;
  while (*component != '\0') {
    const char *end = strchr(component, '/');
    size_t length = end == NULL ? strlen(component) : (size_t)(end - component);
    if (length == 0U || (length == 1U && component[0] == '.')
        || (length == 2U && component[0] == '.' && component[1] == '.')) return NO;
    if (end == NULL) return YES;
    component = end + 1;
  }
  return NO;
}

static BOOL PAMachOName(const uint8_t *command, uint32_t size,
                        uint32_t nameOffset, const char *expectedImage) {
  if (nameOffset < sizeof(struct dylib_command) || nameOffset >= size) return NO;
  const char *name = (const char *)command + nameOffset;
  const char *end = memchr(name, '\0', size - nameOffset);
  if (end == NULL || end == name) return NO;
  return expectedImage == NULL ? PASystemDylibName(name)
    : strcmp(name, expectedImage) == 0;
}

// Thin, host-architecture Mach-O only. No @rpath, relative dependencies,
// non-system imports, weak/reexport/upward/lazy imports, or unknown commands.
// Runtime dlopen/plugin calls inside an image are a separate release blocker.
static BOOL PAStaticMachOClosure(int descriptor, off_t imageSize,
                                 const char *expectedImage) {
  struct mach_header_64 header;
  if (imageSize < (off_t)sizeof(header)
      || !PAReadAt(descriptor, &header, sizeof(header), 0)
      || header.magic != MH_MAGIC_64
#if defined(__arm64__)
      || header.cputype != CPU_TYPE_ARM64
#elif defined(__x86_64__)
      || header.cputype != CPU_TYPE_X86_64
#else
      || YES
#endif
      || (header.filetype != MH_BUNDLE && header.filetype != MH_DYLIB)
      || header.ncmds == 0U || header.ncmds > 1024U
      || header.sizeofcmds < header.ncmds * sizeof(struct load_command)
      || header.sizeofcmds > 1024U * 1024U
      || (off_t)header.sizeofcmds > imageSize - (off_t)sizeof(header)
      || (header.flags & (MH_ALLOW_STACK_EXECUTION | MH_FORCE_FLAT)) != 0U) return NO;
  uint8_t *commands = malloc(header.sizeofcmds);
  if (commands == NULL) return NO;
  BOOL valid = PAReadAt(descriptor, commands, header.sizeofcmds,
                        (off_t)sizeof(header));
  size_t offset = 0U;
  for (uint32_t index = 0U; valid && index < header.ncmds; index += 1U) {
    if (offset > header.sizeofcmds - sizeof(struct load_command)) {
      valid = NO;
      break;
    }
    const struct load_command *command =
      (const struct load_command *)(const void *)(commands + offset);
    uint32_t size = command->cmdsize;
    if (size < sizeof(*command) || size % 8U != 0U
        || size > header.sizeofcmds - offset) {
      valid = NO;
      break;
    }
    switch (command->cmd) {
      case LC_SEGMENT_64: case LC_SYMTAB: case LC_DYSYMTAB:
      case LC_UUID: case LC_BUILD_VERSION: case LC_SOURCE_VERSION:
      case LC_FUNCTION_STARTS: case LC_DATA_IN_CODE: case LC_CODE_SIGNATURE:
      case LC_DYLD_INFO_ONLY: case LC_DYLD_CHAINED_FIXUPS:
      case LC_DYLD_EXPORTS_TRIE: case LC_VERSION_MIN_MACOSX:
        break;
      case LC_LOAD_DYLIB: case LC_ID_DYLIB: {
        if (size < sizeof(struct dylib_command)) {
          valid = NO;
          break;
        }
        const struct dylib_command *dependency =
          (const struct dylib_command *)(const void *)command;
        valid = PAMachOName(commands + offset, size, dependency->dylib.name.offset,
                            command->cmd == LC_ID_DYLIB ? expectedImage : NULL);
        break;
      }
      default:
        valid = NO;
        break;
    }
    offset += size;
  }
  valid = valid && offset == header.sizeofcmds;
  free(commands);
  return valid;
}

static BOOL PALoaderEnvironmentEmpty(void) {
  char ***environmentPointer = _NSGetEnviron();
  if (environmentPointer == NULL || *environmentPointer == NULL) return NO;
  for (char **entry = *environmentPointer; *entry != NULL; entry += 1) {
    const char *name = *entry;
    if (strncmp(name, "DYLD_", 5U) == 0 || strncmp(name, "LD_", 3U) == 0
        || strncmp(name, "OPENSSL_", 8U) == 0
        || strncmp(name, "SOFTHSM2_", 9U) == 0
        || strncmp(name, "PKCS11_", 7U) == 0) return NO;
  }
  return YES;
}

static int PAOpenPinnedTrustedImage(NSString *path, NSString *expectedDigest,
                                    NSString *trustedDirectory, uid_t trustedOwner,
                                    struct stat *identity) {
  if (![path isKindOfClass:[NSString class]] || !path.isAbsolutePath
      || path.length >= PATH_MAX || !PAExpectedDigest(expectedDigest)) return -1;
  const char *filePath = path.fileSystemRepresentation;
  const char *directoryPath = trustedDirectory.fileSystemRepresentation;
  if (filePath == NULL || directoryPath == NULL) return -1;
  size_t rootLength = strlen(directoryPath);
  if (rootLength == 0U || directoryPath[rootLength - 1U] == '/'
      || strlen(filePath) <= rootLength + 1U
      || strncmp(filePath, directoryPath, rootLength) != 0
      || filePath[rootLength] != '/') return -1;
  const char *basename = filePath + rootLength + 1U;
  size_t basenameLength = strlen(basename);
  if (basenameLength == 0U || basenameLength > NAME_MAX
      || strchr(basename, '/') != NULL || strcmp(basename, ".") == 0
      || strcmp(basename, "..") == 0) return -1;
  int directory = PAOpenTrustedDirectory(trustedDirectory, trustedOwner);
  if (directory < 0) return -1;
  int descriptor = openat(directory, basename,
                          O_RDONLY | O_NONBLOCK | O_NOFOLLOW | O_CLOEXEC);
  close(directory);
  if (descriptor < 0) return -1;
  struct stat before;
  struct stat after;
  BOOL valid = fstat(descriptor, &before) == 0 && S_ISREG(before.st_mode)
    && before.st_uid == trustedOwner && before.st_nlink == 1
    && (before.st_mode & 0022U) == 0U
    && (before.st_mode & 07000U) == 0U
    && PANoExtendedACL(descriptor)
    && before.st_size >= (off_t)sizeof(struct mach_header_64)
    && before.st_size <= (off_t)(128U * 1024U * 1024U)
    && PAStaticMachOClosure(descriptor, before.st_size, filePath)
    && [PAFileSHA256(descriptor, before.st_size) isEqualToString:expectedDigest]
    && fstat(descriptor, &after) == 0 && PAEqualFileStatus(&before, &after);
  if (!valid) {
    close(descriptor);
    return -1;
  }
  *identity = before;
  return descriptor;
}

static BOOL PARecheckPinnedTrustedImage(int descriptor, const struct stat *identity,
                                        NSString *path, NSString *expectedDigest,
                                        NSString *trustedDirectory, uid_t trustedOwner) {
  struct stat held;
  if (fstat(descriptor, &held) != 0 || !PAEqualFileStatus(identity, &held)
      || ![PAFileSHA256(descriptor, held.st_size) isEqualToString:expectedDigest]) return NO;
  struct stat byPath;
  int current = PAOpenPinnedTrustedImage(path, expectedDigest, trustedDirectory,
                                          trustedOwner, &byPath);
  if (current < 0) return NO;
  close(current);
  return PAEqualFileStatus(identity, &byPath);
}

BOOL PAValidatePinnedRegularFile(NSString *path, NSString *expectedDigest,
                                 uid_t effectiveUser, NSError **error) {
  (void)effectiveUser; // A release never trusts the effective user's files.
  struct stat identity;
  int descriptor = PAOpenPinnedTrustedImage(path, expectedDigest,
                                             PATrustedImageDirectory, 0U, &identity);
  if (descriptor < 0) return PASignerFail(error, 1);
  BOOL valid = PARecheckPinnedTrustedImage(descriptor, &identity, path,
                                           expectedDigest, PATrustedImageDirectory, 0U);
  close(descriptor);
  return valid ? YES : PASignerFail(error, 1);
}

#if defined(PA_SIGNER_LOADER_TESTING) && !defined(PA_RELEASE_BUILD)
BOOL PAValidatePinnedImageForTesting(NSString *path, NSString *expectedDigest,
                                     NSString *trustedDirectory, uid_t mockedRootOwner,
                                     void (^betweenChecks)(void)) {
  struct stat identity;
  int descriptor = PAOpenPinnedTrustedImage(path, expectedDigest, trustedDirectory,
                                             mockedRootOwner, &identity);
  if (descriptor < 0) return NO;
  if (betweenChecks != nil) betweenChecks();
  BOOL valid = PARecheckPinnedTrustedImage(descriptor, &identity, path,
                                           expectedDigest, trustedDirectory,
                                           mockedRootOwner);
  close(descriptor);
  return valid;
}
#endif

static NSString *PATokenSerial(CK_TOKEN_INFO *info) {
  size_t start = 0U;
  size_t end = sizeof(info->serialNumber);
  while (start < end && info->serialNumber[start] == ' ') start += 1U;
  while (end > start && info->serialNumber[end - 1U] == ' ') end -= 1U;
  if (start == end) return nil;
  for (size_t index = start; index < end; index += 1U) {
    unsigned char value = (unsigned char)info->serialNumber[index];
    if (value < 0x21U || value > 0x7eU) return nil;
  }
  return [[NSString alloc] initWithBytes:&info->serialNumber[start]
                                  length:end - start
                                encoding:NSASCIIStringEncoding];
}

static BOOL PAMechanismAvailable(
  CK_FUNCTION_LIST_PTR functions,
  CK_SLOT_ID slot
) {
  CK_ULONG count = 0U;
  if (functions->C_GetMechanismList == NULL
      || functions->C_GetMechanismList(slot, NULL, &count) != CKR_OK
      || count == 0U || count > 4096U) return NO;
  CK_MECHANISM_TYPE *mechanisms = calloc((size_t)count, sizeof(*mechanisms));
  if (mechanisms == NULL) return NO;
  CK_ULONG observed = count;
  CK_RV result = functions->C_GetMechanismList(slot, mechanisms, &observed);
  BOOL found = NO;
  if (result == CKR_OK && observed <= count) {
    for (CK_ULONG index = 0U; index < observed; index += 1U) {
      if (mechanisms[index] == CKM_EDDSA) found = YES;
    }
  }
  PAZeroMemory(mechanisms, (size_t)count * sizeof(*mechanisms));
  free(mechanisms);
  return found;
}

static BOOL PAFindUniqueObject(
  CK_FUNCTION_LIST_PTR functions,
  CK_SESSION_HANDLE session,
  CK_OBJECT_CLASS objectClass,
  NSData *objectIdentifier,
  CK_OBJECT_HANDLE *output
) {
  CK_ATTRIBUTE attributes[2] = {
    { CKA_CLASS, &objectClass, sizeof(objectClass) },
    { CKA_ID, (void *)objectIdentifier.bytes, (CK_ULONG)objectIdentifier.length },
  };
  if (functions->C_FindObjectsInit == NULL || functions->C_FindObjects == NULL
      || functions->C_FindObjectsFinal == NULL
      || functions->C_FindObjectsInit(session, attributes, 2U) != CKR_OK) return NO;
  CK_OBJECT_HANDLE handles[2] = { CK_INVALID_HANDLE, CK_INVALID_HANDLE };
  CK_ULONG count = 0U;
  CK_RV findResult = functions->C_FindObjects(session, handles, 2U, &count);
  CK_RV finalResult = functions->C_FindObjectsFinal(session);
  if (findResult != CKR_OK || finalResult != CKR_OK || count != 1U
      || handles[0] == CK_INVALID_HANDLE) return NO;
  *output = handles[0];
  return YES;
}

static BOOL PAReadExactAttribute(
  CK_FUNCTION_LIST_PTR functions,
  CK_SESSION_HANDLE session,
  CK_OBJECT_HANDLE object,
  CK_ATTRIBUTE_TYPE type,
  const void *expected,
  size_t expectedLength
) {
  if (functions == NULL || functions->C_GetAttributeValue == NULL
      || expected == NULL || expectedLength == 0U || expectedLength > 1024U) return NO;
  CK_ATTRIBUTE attribute = { type, NULL, 0U };
  if (functions->C_GetAttributeValue(session, object, &attribute, 1U) != CKR_OK
      || attribute.ulValueLen != (CK_ULONG)expectedLength) return NO;
  uint8_t observed[1024];
  attribute.pValue = observed;
  attribute.ulValueLen = (CK_ULONG)expectedLength;
  BOOL valid = functions->C_GetAttributeValue(session, object, &attribute, 1U) == CKR_OK
    && attribute.ulValueLen == (CK_ULONG)expectedLength
    && memcmp(observed, expected, expectedLength) == 0;
  PAZeroMemory(observed, sizeof(observed));
  return valid;
}

static BOOL PAPureEdDSAMechanism(const CK_MECHANISM *mechanism) {
  return mechanism != NULL && mechanism->mechanism == CKM_EDDSA
    && mechanism->pParameter == NULL && mechanism->ulParameterLen == 0U;
}

static BOOL PAValidateSignerKeyProfile(
  CK_FUNCTION_LIST_PTR functions,
  CK_SESSION_HANDLE session,
  CK_OBJECT_HANDLE publicObject,
  CK_OBJECT_HANDLE privateObject,
  NSData *objectIdentifier,
  NSData *pinnedPublicKey
) {
  if (publicObject == CK_INVALID_HANDLE || privateObject == CK_INVALID_HANDLE
      || publicObject == privateObject || objectIdentifier.length != 16U
      || pinnedPublicKey.length != 32U) return NO;
  CK_KEY_TYPE keyType = CKK_EC_EDWARDS;
  CK_BBOOL token = CK_TRUE;
  CK_BBOOL publicVisibility = CK_FALSE;
  CK_BBOOL privateVisibility = CK_TRUE;
  CK_BBOOL enabled = CK_TRUE;
  CK_OBJECT_CLASS publicClass = CKO_PUBLIC_KEY;
  CK_OBJECT_CLASS privateClass = CKO_PRIVATE_KEY;
  uint8_t encodedPoint[34] = { 0x04U, 0x20U };
  memcpy(&encodedPoint[2], pinnedPublicKey.bytes, pinnedPublicKey.length);
  BOOL valid = PAReadExactAttribute(functions, session, publicObject,
                                   CKA_CLASS, &publicClass, sizeof(publicClass))
    && PAReadExactAttribute(functions, session, privateObject,
                            CKA_CLASS, &privateClass, sizeof(privateClass))
    && PAReadExactAttribute(functions, session, publicObject,
                            CKA_ID, objectIdentifier.bytes, objectIdentifier.length)
    && PAReadExactAttribute(functions, session, privateObject,
                            CKA_ID, objectIdentifier.bytes, objectIdentifier.length)
    && PAReadExactAttribute(functions, session, publicObject,
                            CKA_KEY_TYPE, &keyType, sizeof(keyType))
    && PAReadExactAttribute(functions, session, privateObject,
                            CKA_KEY_TYPE, &keyType, sizeof(keyType))
    && PAReadExactAttribute(functions, session, publicObject,
                            CKA_EC_PARAMS, PADevSoftHSM27CurveNameV1,
                            sizeof(PADevSoftHSM27CurveNameV1))
    && PAReadExactAttribute(functions, session, privateObject,
                            CKA_EC_PARAMS, PADevSoftHSM27CurveNameV1,
                            sizeof(PADevSoftHSM27CurveNameV1))
    && PAReadExactAttribute(functions, session, publicObject,
                            CKA_TOKEN, &token, sizeof(token))
    && PAReadExactAttribute(functions, session, privateObject,
                            CKA_TOKEN, &token, sizeof(token))
    && PAReadExactAttribute(functions, session, publicObject,
                            CKA_PRIVATE, &publicVisibility, sizeof(publicVisibility))
    && PAReadExactAttribute(functions, session, privateObject,
                            CKA_PRIVATE, &privateVisibility, sizeof(privateVisibility))
    && PAReadExactAttribute(functions, session, publicObject,
                            CKA_VERIFY, &enabled, sizeof(enabled))
    && PAReadExactAttribute(functions, session, privateObject,
                            CKA_SIGN, &enabled, sizeof(enabled))
    && PAReadExactAttribute(functions, session, publicObject,
                            CKA_EC_POINT, encodedPoint, sizeof(encodedPoint));
  PAZeroMemory(encodedPoint, sizeof(encodedPoint));
  return valid;
}

static BOOL PAFindAndValidateSignerKeyProfile(
  CK_FUNCTION_LIST_PTR functions,
  CK_SESSION_HANDLE session,
  NSData *objectIdentifier,
  NSData *pinnedPublicKey,
  CK_OBJECT_HANDLE *privateOutput
) {
  CK_OBJECT_HANDLE publicObject = CK_INVALID_HANDLE;
  CK_OBJECT_HANDLE privateObject = CK_INVALID_HANDLE;
  if (objectIdentifier.length != 16U
      || !PAFindUniqueObject(functions, session, CKO_PRIVATE_KEY,
                             objectIdentifier, &privateObject)
      || !PAFindUniqueObject(functions, session, CKO_PUBLIC_KEY,
                             objectIdentifier, &publicObject)
      || !PAValidateSignerKeyProfile(functions, session, publicObject, privateObject,
                                     objectIdentifier, pinnedPublicKey)) return NO;
  *privateOutput = privateObject;
  return YES;
}

#if defined(PA_SIGNER_PROFILE_TESTING) && !defined(PA_RELEASE_BUILD)
BOOL PAValidateSignerKeyProfileForTesting(
  CK_FUNCTION_LIST_PTR functions,
  CK_SESSION_HANDLE session,
  NSData *objectIdentifier,
  NSData *pinnedPublicKey
) {
  CK_OBJECT_HANDLE privateObject = CK_INVALID_HANDLE;
  return PAFindAndValidateSignerKeyProfile(functions, session, objectIdentifier,
                                          pinnedPublicKey, &privateObject);
}

BOOL PAPureEdDSAMechanismForTesting(const CK_MECHANISM *mechanism) {
  return PAPureEdDSAMechanism(mechanism);
}
#endif

PASignerSession *PAPreflightSigner(
  NSDictionary<NSString *, id> *configuration,
  PAAuthority *authority,
  NSMutableData *credential,
  uid_t effectiveUser,
  NSError **error
) {
  if (!PADynamicLoaderQualified()) {
    PASignerFail(error, 2);
    return nil;
  }
  NSDictionary *pkcs11 = configuration[@"pkcs11"];
  NSString *modulePath = pkcs11[@"modulePath"];
  NSString *moduleDigest = pkcs11[@"moduleSha256"];
  if (!PAValidatePinnedRegularFile(modulePath, moduleDigest, effectiveUser, error)
      || credential.length < 1U || credential.length > 255U) return nil;
  const uint8_t *pin = credential.bytes;
  for (NSUInteger index = 0U; index < credential.length; index += 1U) {
    if (pin[index] < 0x20U || pin[index] > 0x7eU) {
      PASignerFail(error, 2);
      return nil;
    }
  }
  NSData *objectIdentifier = PADecodeBase64URL(pkcs11[@"objectId"], 16U, NULL);
  if (objectIdentifier == nil) {
    PASignerFail(error, 2);
    return nil;
  }
  PASignerSession *session = [[PASignerSession alloc] init];
  session.sessionHandle = CK_INVALID_HANDLE;
  session.privateKeyHandle = CK_INVALID_HANDLE;
  session.modulePath = modulePath;
  session.moduleDigest = moduleDigest;
  session.effectiveUser = effectiveUser;
  struct stat moduleIdentity;
  int moduleDescriptor = PALoaderEnvironmentEmpty()
    ? PAOpenPinnedTrustedImage(modulePath, moduleDigest, PATrustedImageDirectory,
                               0U, &moduleIdentity) : -1;
  if (moduleDescriptor < 0) {
    PASignerFail(error, 2);
    return nil;
  }
  session.moduleHandle = dlopen(modulePath.fileSystemRepresentation, RTLD_NOW | RTLD_LOCAL);
  BOOL moduleUnchanged = session.moduleHandle != NULL
    && PARecheckPinnedTrustedImage(moduleDescriptor, &moduleIdentity, modulePath,
                                   moduleDigest, PATrustedImageDirectory, 0U);
  close(moduleDescriptor);
  if (!moduleUnchanged) {
    PACloseSigner(session);
    PASignerFail(error, 2);
    return nil;
  }
  CK_RV (*getFunctionList)(CK_FUNCTION_LIST_PTR_PTR) = NULL;
  CK_FUNCTION_LIST_PTR functions = NULL;
  if (!PALoadFunction(
      session.moduleHandle,
      "C_GetFunctionList",
      &getFunctionList,
      sizeof(getFunctionList)
    )
      || getFunctionList(&functions) != CKR_OK
      || functions == NULL || functions->C_Initialize == NULL
      || (session.functions = functions) == NULL
      || session.functions->C_Initialize == NULL
      || session.functions->C_Finalize == NULL
      || session.functions->C_GetSlotList == NULL
      || session.functions->C_GetTokenInfo == NULL
      || session.functions->C_OpenSession == NULL
      || session.functions->C_CloseSession == NULL
      || session.functions->C_GetSessionInfo == NULL
      || session.functions->C_Login == NULL
      || session.functions->C_Logout == NULL
      || session.functions->C_SignInit == NULL
      || session.functions->C_Sign == NULL) {
    PACloseSigner(session);
    PASignerFail(error, 2);
    return nil;
  }
  CK_RV initialized = session.functions->C_Initialize(NULL);
  if (initialized != CKR_OK && initialized != CKR_CRYPTOKI_ALREADY_INITIALIZED_VALUE) {
    PACloseSigner(session);
    PASignerFail(error, 2);
    return nil;
  }
  session.initialized = YES;
  CK_ULONG slotCount = 0U;
  if (session.functions->C_GetSlotList(CK_TRUE, NULL, &slotCount) != CKR_OK
      || slotCount == 0U || slotCount > 1024U) {
    PACloseSigner(session);
    PASignerFail(error, 2);
    return nil;
  }
  CK_SLOT_ID *slots = calloc((size_t)slotCount, sizeof(*slots));
  if (slots == NULL) {
    PACloseSigner(session);
    PASignerFail(error, 2);
    return nil;
  }
  CK_ULONG observedSlots = slotCount;
  CK_RV slotsResult = session.functions->C_GetSlotList(CK_TRUE, slots, &observedSlots);
  NSString *expectedSerial = pkcs11[@"tokenSerial"];
  CK_SLOT_ID matchingSlot = 0U;
  NSUInteger matches = 0U;
  if (slotsResult == CKR_OK && observedSlots <= slotCount) {
    for (CK_ULONG index = 0U; index < observedSlots; index += 1U) {
      CK_TOKEN_INFO info;
      memset(&info, 0, sizeof(info));
      if (session.functions->C_GetTokenInfo(slots[index], &info) == CKR_OK
          && [PATokenSerial(&info) isEqualToString:expectedSerial]) {
        matchingSlot = slots[index];
        matches += 1U;
      }
    }
  }
  PAZeroMemory(slots, (size_t)slotCount * sizeof(*slots));
  free(slots);
  CK_SESSION_HANDLE openedSession = CK_INVALID_HANDLE;
  if (matches != 1U || !PAMechanismAvailable(session.functions, matchingSlot)
      || session.functions->C_OpenSession(
        matchingSlot,
        CKF_SERIAL_SESSION | CKF_RW_SESSION,
        NULL,
        NULL,
        &openedSession
      ) != CKR_OK) {
    PACloseSigner(session);
    PASignerFail(error, 2);
    return nil;
  }
  session.sessionHandle = openedSession;
  session.sessionOpen = YES;
  if (session.functions->C_Login(
      session.sessionHandle,
      CKU_USER,
      (CK_UTF8CHAR_PTR)credential.mutableBytes,
      (CK_ULONG)credential.length
    ) != CKR_OK) {
    PACloseSigner(session);
    PASignerFail(error, 2);
    return nil;
  }
  session.loggedIn = YES;
  CK_OBJECT_HANDLE privateObject = CK_INVALID_HANDLE;
  CK_SESSION_INFO sessionInfo;
  CK_TOKEN_INFO currentTokenInfo;
  memset(&sessionInfo, 0, sizeof(sessionInfo));
  memset(&currentTokenInfo, 0, sizeof(currentTokenInfo));
  if (session.functions->C_GetSessionInfo(session.sessionHandle, &sessionInfo) != CKR_OK
      || sessionInfo.slotID != matchingSlot
      || session.functions->C_GetTokenInfo(matchingSlot, &currentTokenInfo) != CKR_OK
      || ![PATokenSerial(&currentTokenInfo) isEqualToString:expectedSerial]
      || !PAFindAndValidateSignerKeyProfile(session.functions, session.sessionHandle,
                                            objectIdentifier, authority.publicKey,
                                            &privateObject)
      || !PAValidatePinnedRegularFile(modulePath, moduleDigest, effectiveUser, NULL)) {
    PACloseSigner(session);
    PASignerFail(error, 2);
    return nil;
  }
  session.privateKeyHandle = privateObject;
  return session;
}

NSData *PASignExactlyOnce(PASignerSession *session, NSData *message, NSError **error) {
  if (!PADynamicLoaderQualified() || session == nil || session.signAttempted || !session.loggedIn
      || message.length == 0U || message.length > 1024U * 1024U) {
    PASignerFail(error, 3);
    return nil;
  }
  session.signAttempted = YES;
  CK_MECHANISM mechanism = { CKM_EDDSA, NULL, 0U };
  if (!PAPureEdDSAMechanism(&mechanism) || session.functions->C_SignInit(
      session.sessionHandle,
      &mechanism,
      session.privateKeyHandle
    ) != CKR_OK) {
    PASignerFail(error, 3);
    return nil;
  }
  NSMutableData *signature = [NSMutableData dataWithLength:64U];
  CK_ULONG signatureLength = 64U;
  CK_RV result = session.functions->C_Sign(
    session.sessionHandle,
    (CK_BYTE_PTR)message.bytes,
    (CK_ULONG)message.length,
    signature.mutableBytes,
    &signatureLength
  );
  if (result != CKR_OK || signatureLength != 64U
      || !PAValidatePinnedRegularFile(
        session.modulePath,
        session.moduleDigest,
        session.effectiveUser,
        NULL
      )) {
    PAZeroMutableData(signature);
    PASignerFail(error, 3);
    return nil;
  }
  return [signature copy];
}

BOOL PAVerifyWithPinnedOpenSSL(
  NSDictionary<NSString *, id> *configuration,
  NSData *publicKey,
  NSData *message,
  NSData *signature,
  uid_t effectiveUser,
  NSError **error
) {
  if (!PADynamicLoaderQualified()) return PASignerFail(error, 4);
  NSDictionary *openssl = configuration[@"opensslVerifier"];
  NSString *path = openssl[@"path"];
  NSString *digest = openssl[@"sha256"];
  if (publicKey.length != 32U || signature.length != 64U || message.length == 0U
      || !PAValidatePinnedRegularFile(path, digest, effectiveUser, error)) return NO;
  struct stat imageIdentity;
  int imageDescriptor = PALoaderEnvironmentEmpty()
    ? PAOpenPinnedTrustedImage(path, digest, PATrustedImageDirectory,
                               0U, &imageIdentity) : -1;
  if (imageDescriptor < 0) return PASignerFail(error, 4);
  void *library = dlopen(path.fileSystemRepresentation, RTLD_NOW | RTLD_LOCAL);
  BOOL imageUnchanged = library != NULL
    && PARecheckPinnedTrustedImage(imageDescriptor, &imageIdentity, path, digest,
                                   PATrustedImageDirectory, 0U);
  close(imageDescriptor);
  if (!imageUnchanged) {
    if (library != NULL) dlclose(library);
    return PASignerFail(error, 4);
  }
  typedef void *(*PANewRawPublicKey)(void *, const char *, const char *, const unsigned char *, size_t);
  typedef void *(*PANewDigestContext)(void);
  typedef int (*PADigestVerifyInit)(void *, void **, const void *, void *, void *);
  typedef int (*PADigestVerify)(void *, const unsigned char *, size_t, const unsigned char *, size_t);
  typedef void (*PAFreeValue)(void *);
  PANewRawPublicKey newKey = NULL;
  PANewDigestContext newContext = NULL;
  PADigestVerifyInit verifyInit = NULL;
  PADigestVerify verify = NULL;
  PAFreeValue freeKey = NULL;
  PAFreeValue freeContext = NULL;
  PALoadFunction(library, "EVP_PKEY_new_raw_public_key_ex", &newKey, sizeof(newKey));
  PALoadFunction(library, "EVP_MD_CTX_new", &newContext, sizeof(newContext));
  PALoadFunction(library, "EVP_DigestVerifyInit", &verifyInit, sizeof(verifyInit));
  PALoadFunction(library, "EVP_DigestVerify", &verify, sizeof(verify));
  PALoadFunction(library, "EVP_PKEY_free", &freeKey, sizeof(freeKey));
  PALoadFunction(library, "EVP_MD_CTX_free", &freeContext, sizeof(freeContext));
  BOOL valid = NO;
  void *key = NULL;
  void *context = NULL;
  if (newKey != NULL && newContext != NULL && verifyInit != NULL && verify != NULL
      && freeKey != NULL && freeContext != NULL) {
    key = newKey(NULL, "ED25519", NULL, publicKey.bytes, publicKey.length);
    context = newContext();
    if (key != NULL && context != NULL
        && verifyInit(context, NULL, NULL, NULL, key) == 1
        && verify(context, signature.bytes, signature.length, message.bytes, message.length) == 1
        && PAValidatePinnedRegularFile(path, digest, effectiveUser, NULL)) valid = YES;
  }
  if (context != NULL && freeContext != NULL) freeContext(context);
  if (key != NULL && freeKey != NULL) freeKey(key);
  dlclose(library);
  return valid ? YES : PASignerFail(error, 4);
}

void PACloseSigner(PASignerSession *session) {
  if (session == nil) return;
  if (session.loggedIn && session.functions != NULL && session.functions->C_Logout != NULL) {
    session.functions->C_Logout(session.sessionHandle);
    session.loggedIn = NO;
  }
  if (session.sessionOpen && session.functions != NULL
      && session.functions->C_CloseSession != NULL) {
    session.functions->C_CloseSession(session.sessionHandle);
    session.sessionOpen = NO;
  }
  if (session.initialized && session.functions != NULL
      && session.functions->C_Finalize != NULL) {
    session.functions->C_Finalize(NULL);
    session.initialized = NO;
  }
  if (session.moduleHandle != NULL) {
    dlclose(session.moduleHandle);
    session.moduleHandle = NULL;
  }
  session.functions = NULL;
  session.sessionHandle = CK_INVALID_HANDLE;
  session.privateKeyHandle = CK_INVALID_HANDLE;
}
