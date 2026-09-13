#import "provider_attestor_private.h"
#import "provider_attestor_private_acl.h"
#if defined(PA_RELEASE_BUILD)
#import "provider_attestor_macos_approval.h"
#endif

#import <Foundation/Foundation.h>
#include <errno.h>
#include <fcntl.h>
#include <pwd.h>
#include <sqlite3.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>

static NSString *const PARuntimeErrorDomain = @"org.zenon-x402.provider-attestor.runtime";
static NSString *const PAConfigurationDomain = @"zenon-x402:provider-attestor-configuration-v1";
static NSString *const PAMetadataDomain = @"zenon-x402:provider-attestor-journal-metadata-v1";
static NSString *const PAOperationDomain = @"zenon-x402:provider-attestor-journal-operation-v1";
static NSString *const PADevelopmentMode = @"Development/Testnet Software Attestor";
static const NSUInteger PAResponseMaximumPayloadBytes = 512U * 1024U;

// The test fixture is a distinct binary. There is no runtime switch to select
// its pins in a release build, and a production build without reviewed pins is
// deliberately a compilation failure.
#if defined(PA_TESTING) && defined(PA_RELEASE_BUILD)
#error Test fixture and release build must never be combined
#elif defined(PA_TESTING)
#if !defined(PA_TEST_FIXTURE_ONLY) || !defined(PA_TEST_AUTHORITY_RECORD_DIGEST) \
  || !defined(PA_TEST_PUBLIC_KEY) || !defined(PA_TEST_CONFIGURATION_DIGEST)
#error The synthetic runtime requires independently compiled fixture pins
#endif
#define PA_AUTHORITY_PIN PA_TEST_AUTHORITY_RECORD_DIGEST
#define PA_PUBLIC_KEY_PIN PA_TEST_PUBLIC_KEY
#define PA_CONFIGURATION_PIN PA_TEST_CONFIGURATION_DIGEST
#elif defined(PA_RELEASE_BUILD)
#if !defined(PA_RELEASE_AUTHORITY_RECORD_DIGEST) || !defined(PA_RELEASE_PUBLIC_KEY) \
  || !defined(PA_RELEASE_CONFIGURATION_DIGEST)
#error A release runtime requires reviewed authority, public key, and configuration pins
#endif
#if defined(PA_TEST_FIXTURE_ONLY)
#error Synthetic fixture pins cannot be used in a release runtime
#endif
#define PA_AUTHORITY_PIN PA_RELEASE_AUTHORITY_RECORD_DIGEST
#define PA_PUBLIC_KEY_PIN PA_RELEASE_PUBLIC_KEY
#define PA_CONFIGURATION_PIN PA_RELEASE_CONFIGURATION_DIGEST
#else
#error The native runtime must be explicitly built as a test fixture or a pinned release
#endif

static const char PACompiledAuthorityRecordDigest[] __attribute__((used)) = PA_AUTHORITY_PIN;
static const char PACompiledPublicKey[] __attribute__((used)) = PA_PUBLIC_KEY_PIN;
static const char PACompiledConfigurationDigest[] __attribute__((used)) = PA_CONFIGURATION_PIN;

@interface PAConfiguration : NSObject

@property(nonatomic) NSDictionary<NSString *, id> *value;
@property(nonatomic) PAAuthority *authority;
@property(nonatomic) NSString *commitment;
@property(nonatomic) NSString *rootPath;
@property(nonatomic) NSString *generationPath;
@property(nonatomic) uid_t effectiveUser;
@property(nonatomic) uint64_t validitySeconds;

@end

@implementation PAConfiguration
@end

@interface PAOperationRecord : NSObject

@property(nonatomic) NSString *operationIdentifier;
@property(nonatomic) NSData *requestPayload;
@property(nonatomic) uint64_t issuedAt;
@property(nonatomic) uint64_t validUntil;
@property(nonatomic) NSData *signingBytes;
@property(nonatomic) NSString *displayText;
@property(nonatomic) BOOL approvalStarted;
@property(nonatomic) NSString *state;
@property(nonatomic, nullable) NSString *reasonCode;
@property(nonatomic, nullable) NSData *responseFrame;
@property(nonatomic) NSString *checksum;

@end

@implementation PAOperationRecord
@end

@interface PAJournal : NSObject

@property(nonatomic) sqlite3 *database;
@property(nonatomic) int lockDescriptor;
@property(nonatomic) PAConfiguration *configuration;

@end

@implementation PAJournal
@end

static BOOL PARuntimeFail(NSError **error, NSInteger code) {
  if (error != NULL) {
    *error = [NSError errorWithDomain:PARuntimeErrorDomain code:code userInfo:@{}];
  }
  return NO;
}

static BOOL PAIsBooleanNumber(id value) {
  return [value isKindOfClass:[NSNumber class]]
    && CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID();
}

static BOOL PAUnsignedInteger(id value, BOOL positive, uint64_t *output) {
  if (![value isKindOfClass:[NSNumber class]]
      || PAIsBooleanNumber(value)
      || CFNumberIsFloatType((__bridge CFNumberRef)value)) return NO;
  long long number = [value longLongValue];
  if (number < (positive ? 1LL : 0LL) || number > 9007199254740991LL) return NO;
  *output = (uint64_t)number;
  return YES;
}

static BOOL PAExactDictionary(NSDictionary *value, NSArray<NSString *> *keys) {
  if (![value isKindOfClass:[NSDictionary class]] || value.count != keys.count) return NO;
  for (NSString *key in keys) if (value[key] == nil) return NO;
  return YES;
}

static BOOL PADigestString(id value) {
  if (![value isKindOfClass:[NSString class]]) return NO;
  NSString *text = value;
  if (text.length != 71U || ![text hasPrefix:@"sha256:"]) return NO;
  for (NSUInteger index = 7U; index < text.length; index += 1U) {
    unichar unit = [text characterAtIndex:index];
    if (!((unit >= '0' && unit <= '9') || (unit >= 'a' && unit <= 'f'))) return NO;
  }
  return YES;
}

static BOOL PAPrivateSelector(id value) {
  if (![value isKindOfClass:[NSString class]]) return NO;
  NSString *text = value;
  if (text.length < 1U || text.length > 128U) return NO;
  NSData *bytes = [text dataUsingEncoding:NSUTF8StringEncoding allowLossyConversion:NO];
  if (bytes == nil || bytes.length > 256U) return NO;
  for (NSUInteger index = 0U; index < text.length; index += 1U) {
    unichar unit = [text characterAtIndex:index];
    if (unit < 0x21U || unit > 0x7eU) return NO;
  }
  return YES;
}

static BOOL PATokenSerialValue(id value) {
  if (![value isKindOfClass:[NSString class]]) return NO;
  NSString *text = value;
  if (text.length < 1U || text.length > 16U
      || [text hasPrefix:@" "] || [text hasSuffix:@" "]) return NO;
  for (NSUInteger index = 0U; index < text.length; index += 1U) {
    unichar unit = [text characterAtIndex:index];
    if (unit < 0x21U || unit > 0x7eU) return NO;
  }
  return YES;
}

static BOOL PASamePrivateObject(const struct stat *left, const struct stat *right) {
  return left->st_dev == right->st_dev && left->st_ino == right->st_ino
    && left->st_mode == right->st_mode && left->st_uid == right->st_uid
    && left->st_gid == right->st_gid && left->st_nlink == right->st_nlink
    && left->st_size == right->st_size
    && left->st_mtimespec.tv_sec == right->st_mtimespec.tv_sec
    && left->st_mtimespec.tv_nsec == right->st_mtimespec.tv_nsec
    && left->st_ctimespec.tv_sec == right->st_ctimespec.tv_sec
    && left->st_ctimespec.tv_nsec == right->st_ctimespec.tv_nsec;
}

static BOOL PAValidatePrivateDirectory(NSString *path, uid_t owner) {
  if (![path isAbsolutePath] || path.length == 0U || path.length > 4096U) return NO;
  const char *filePath = path.fileSystemRepresentation;
  char canonical[PATH_MAX];
  struct stat before;
  if (filePath == NULL || realpath(filePath, canonical) == NULL
      || strcmp(filePath, canonical) != 0 || lstat(filePath, &before) != 0
      || !S_ISDIR(before.st_mode) || before.st_uid != owner
      || (before.st_mode & 07777U) != 0700U || before.st_nlink < 1) return NO;
  int descriptor = open(filePath, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (descriptor < 0) return NO;
  struct stat opened;
  struct stat after;
  struct stat pathAfter;
  BOOL valid = fstat(descriptor, &opened) == 0
    && PASamePrivateObject(&before, &opened)
    && PAHasNoExtendedACL(descriptor)
    && fstat(descriptor, &after) == 0
    && lstat(filePath, &pathAfter) == 0
    && PASamePrivateObject(&before, &after)
    && PASamePrivateObject(&after, &pathAfter);
  if (close(descriptor) != 0) valid = NO;
  return valid;
}

static int PAOpenOwnerPrivateFile(NSString *path, uid_t owner, BOOL create) {
  const char *filePath = path.fileSystemRepresentation;
  if (filePath == NULL) return -1;
  int descriptor = -1;
  BOOL created = NO;
  if (create) {
    descriptor = open(filePath, O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
    if (descriptor >= 0) created = YES;
    else if (errno == EEXIST) descriptor = open(filePath, O_RDWR | O_NOFOLLOW | O_CLOEXEC);
  } else {
    descriptor = open(filePath, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  }
  if (descriptor < 0) return -1;
  if (created && fchmod(descriptor, 0600) != 0) {
    close(descriptor);
    return -1;
  }
  struct stat status;
  if (fstat(descriptor, &status) != 0
      || !S_ISREG(status.st_mode)
      || status.st_uid != owner
      || status.st_nlink != 1
      || (status.st_mode & 0777U) != 0600U
      || (status.st_mode & 07000U) != 0U
      || !PAHasNoExtendedACL(descriptor)) {
    close(descriptor);
    return -1;
  }
  return descriptor;
}

static NSData *PAReadBoundedDescriptor(int descriptor, NSUInteger maximum) {
  struct stat status;
  if (fstat(descriptor, &status) != 0 || status.st_size < 1
      || status.st_size > (off_t)maximum || lseek(descriptor, 0, SEEK_SET) < 0) return nil;
  NSMutableData *data = [NSMutableData dataWithLength:(NSUInteger)status.st_size];
  NSUInteger offset = 0U;
  while (offset < data.length) {
    ssize_t count = read(descriptor, (uint8_t *)data.mutableBytes + offset, data.length - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return nil;
    offset += (NSUInteger)count;
  }
  uint8_t trailing = 0U;
  ssize_t extra;
  do { extra = read(descriptor, &trailing, 1U); } while (extra < 0 && errno == EINTR);
  return extra == 0 ? [data copy] : nil;
}

NSString *PAEffectiveUserApplicationSupportRoot(NSError **error) {
  uid_t effectiveUser = geteuid();
  long suggested = sysconf(_SC_GETPW_R_SIZE_MAX);
  size_t size = suggested > 0 && suggested < 1024L * 1024L ? (size_t)suggested : 16384U;
  char *buffer = calloc(size, 1U);
  if (buffer == NULL) {
    PARuntimeFail(error, 1);
    return nil;
  }
  struct passwd record;
  struct passwd *result = NULL;
  NSString *root = nil;
  if (getpwuid_r(effectiveUser, &record, buffer, size, &result) == 0
      && result != NULL && record.pw_dir != NULL && record.pw_dir[0] == '/') {
    NSString *home = [NSString stringWithUTF8String:record.pw_dir];
    root = [[[home stringByAppendingPathComponent:@"Library/Application Support"]
      stringByAppendingPathComponent:@"ZenonX402"]
      stringByAppendingPathComponent:@"ProviderAttestor"];
  }
  free(buffer);
  if (root == nil) PARuntimeFail(error, 1);
  return root;
}

static PAConfiguration *PAReadConfiguration(NSString *rootPath, NSError **error) {
  uid_t effectiveUser = geteuid();
  if (!PAValidatePrivateDirectory(rootPath, effectiveUser)) {
    PARuntimeFail(error, 2);
    return nil;
  }
  NSString *configurationPath = [rootPath stringByAppendingPathComponent:@"configuration.json"];
  int descriptor = PAOpenOwnerPrivateFile(configurationPath, effectiveUser, NO);
  if (descriptor < 0) {
    PARuntimeFail(error, 2);
    return nil;
  }
  NSData *data = PAReadBoundedDescriptor(descriptor, 64U * 1024U);
  BOOL privateAfterRead = PAHasNoExtendedACL(descriptor);
  if (close(descriptor) != 0) privateAfterRead = NO;
  if (!privateAfterRead) data = nil;
  // Pin the exact canonical generation bytes before parsing any configuration
  // fields. Nothing in this file can authorize its own replacement.
  NSString *configurationDigest = data == nil
    ? nil : PASHA256Commitment(PAConfigurationDomain, data);
  NSString *compiledConfiguration = [NSString stringWithUTF8String:PACompiledConfigurationDigest];
  NSString *compiledAuthority = [NSString stringWithUTF8String:PACompiledAuthorityRecordDigest];
  NSString *compiledPublicKey = [NSString stringWithUTF8String:PACompiledPublicKey];
  if (!PADigestString(compiledConfiguration) || !PADigestString(compiledAuthority)
      || PADecodeBase64URL(compiledPublicKey, 32U, NULL).length != 32U
      || ![configurationDigest isEqualToString:compiledConfiguration]) {
    PARuntimeFail(error, 2);
    return nil;
  }
  id parsed = PAParseCanonicalJSONData(data, 64U * 1024U, NULL);
  NSArray *keys = @[
    @"authorityRecord", @"authorityRecordDigest", @"configurationVersion",
    @"developmentMode", @"generationCommitment",
    @"journalSchemaVersion", @"keyId", @"keychain", @"opensslVerifier", @"pkcs11",
    @"publicKey", @"validitySeconds",
  ];
  if (![parsed isKindOfClass:[NSDictionary class]] || !PAExactDictionary(parsed, keys)) {
    PARuntimeFail(error, 2);
    return nil;
  }
  NSDictionary *value = parsed;
  uint64_t configurationVersion = 0U;
  uint64_t journalSchemaVersion = 0U;
  uint64_t validitySeconds = 0U;
  PAAuthority *authority = [value[@"authorityRecord"] isKindOfClass:[NSString class]]
    ? PAParseAuthorityRecord(value[@"authorityRecord"], NULL)
    : nil;
  NSDictionary *keychain = value[@"keychain"];
  NSDictionary *openssl = value[@"opensslVerifier"];
  NSDictionary *pkcs11 = value[@"pkcs11"];
  BOOL valid = authority != nil
    && PAUnsignedInteger(value[@"configurationVersion"], YES, &configurationVersion)
    && configurationVersion == 1U
    && [value[@"developmentMode"] isEqualToString:PADevelopmentMode]
    && PADigestString(value[@"authorityRecordDigest"])
    && [value[@"authorityRecordDigest"] isEqualToString:authority.recordDigest]
    && [authority.recordDigest isEqualToString:compiledAuthority]
    && PADigestString(value[@"generationCommitment"])
    && [value[@"generationCommitment"] isEqualToString:authority.generationCommitment]
    && [value[@"keyId"] isEqualToString:authority.keyIdentifier]
    && [value[@"publicKey"] isEqualToString:authority.fields[@"publicKey"]]
    && [value[@"publicKey"] isEqualToString:compiledPublicKey]
    && PAUnsignedInteger(value[@"journalSchemaVersion"], YES, &journalSchemaVersion)
    && journalSchemaVersion == 1U
    && PAUnsignedInteger(value[@"validitySeconds"], YES, &validitySeconds)
    && validitySeconds <= authority.maximumValiditySeconds
    && PAExactDictionary(keychain, @[ @"account", @"service" ])
    && PAPrivateSelector(keychain[@"account"])
    && PAPrivateSelector(keychain[@"service"])
    && PAExactDictionary(openssl, @[ @"path", @"sha256" ])
    && [openssl[@"path"] isKindOfClass:[NSString class]]
    && PADigestString(openssl[@"sha256"])
    && PAExactDictionary(pkcs11, @[
      @"modulePath", @"moduleSha256", @"objectId", @"tokenSerial",
    ])
    && [pkcs11[@"modulePath"] isKindOfClass:[NSString class]]
    && PADigestString(pkcs11[@"moduleSha256"])
    && PADecodeBase64URL(pkcs11[@"objectId"], 16U, NULL) != nil
    && PATokenSerialValue(pkcs11[@"tokenSerial"]);
  if (!valid) {
    PARuntimeFail(error, 2);
    return nil;
  }
  NSString *generationPath = [[rootPath stringByAppendingPathComponent:@"generations"]
    stringByAppendingPathComponent:authority.fields[@"generationId"]];
  if (!PAValidatePrivateDirectory([rootPath stringByAppendingPathComponent:@"generations"],
                                  effectiveUser)
      || !PAValidatePrivateDirectory(generationPath, effectiveUser)) {
    PARuntimeFail(error, 2);
    return nil;
  }
  PAConfiguration *configuration = [[PAConfiguration alloc] init];
  configuration.value = value;
  configuration.authority = authority;
  configuration.commitment = configurationDigest;
  configuration.rootPath = rootPath;
  configuration.generationPath = generationPath;
  configuration.effectiveUser = effectiveUser;
  configuration.validitySeconds = validitySeconds;
  return configuration;
}

static BOOL PASQL(sqlite3 *database, const char *sql) {
  return sqlite3_exec(database, sql, NULL, NULL, NULL) == SQLITE_OK;
}

static BOOL PAQueryInteger(sqlite3 *database, const char *sql, sqlite3_int64 expected) {
  sqlite3_stmt *statement = NULL;
  BOOL valid = sqlite3_prepare_v2(database, sql, -1, &statement, NULL) == SQLITE_OK
    && sqlite3_step(statement) == SQLITE_ROW
    && sqlite3_column_type(statement, 0) == SQLITE_INTEGER
    && sqlite3_column_int64(statement, 0) == expected
    && sqlite3_step(statement) == SQLITE_DONE;
  sqlite3_finalize(statement);
  return valid;
}

static BOOL PAQueryText(sqlite3 *database, const char *sql, NSString *expected) {
  sqlite3_stmt *statement = NULL;
  BOOL valid = sqlite3_prepare_v2(database, sql, -1, &statement, NULL) == SQLITE_OK
    && sqlite3_step(statement) == SQLITE_ROW
    && sqlite3_column_type(statement, 0) == SQLITE_TEXT;
  if (valid) {
    const unsigned char *text = sqlite3_column_text(statement, 0);
    NSString *observed = text == NULL ? nil : [NSString stringWithUTF8String:(const char *)text];
    valid = observed != nil && [observed caseInsensitiveCompare:expected] == NSOrderedSame
      && sqlite3_step(statement) == SQLITE_DONE;
  }
  sqlite3_finalize(statement);
  return valid;
}

static void PAAppendUint64(NSMutableData *output, uint64_t value) {
  uint64_t bigEndian = CFSwapInt64HostToBig(value);
  [output appendBytes:&bigEndian length:sizeof(bigEndian)];
}

static void PAAppendLengthData(NSMutableData *output, NSData *value) {
  PAAppendUint64(output, value.length);
  [output appendData:value];
}

static void PAAppendLengthString(NSMutableData *output, NSString *value) {
  NSData *encoded = [value dataUsingEncoding:NSUTF8StringEncoding];
  PAAppendLengthData(output, encoded != nil ? encoded : [NSData data]);
}

static NSString *PAMetadataChecksum(
  PAConfiguration *configuration,
  uint64_t lastIssuedAt,
  uint64_t operationCount
) {
  NSMutableData *payload = [NSMutableData data];
  PAAppendUint64(payload, 1U);
  PAAppendLengthString(payload, configuration.commitment);
  PAAppendLengthString(payload, configuration.authority.recordDigest);
  PAAppendLengthString(payload, configuration.authority.generationCommitment);
  PAAppendLengthString(payload, configuration.authority.keyIdentifier);
  PAAppendUint64(payload, lastIssuedAt);
  PAAppendUint64(payload, operationCount);
  return PASHA256Commitment(PAMetadataDomain, payload);
}

static NSString *PAOperationChecksum(PAConfiguration *configuration, PAOperationRecord *record) {
  NSMutableData *payload = [NSMutableData data];
  PAAppendUint64(payload, 1U);
  PAAppendLengthString(payload, configuration.commitment);
  PAAppendLengthString(payload, record.operationIdentifier);
  PAAppendLengthData(payload, record.requestPayload);
  PAAppendUint64(payload, record.issuedAt);
  PAAppendUint64(payload, record.validUntil);
  PAAppendLengthData(payload, record.signingBytes);
  PAAppendLengthString(payload, record.displayText);
  uint8_t approval = record.approvalStarted ? 1U : 0U;
  [payload appendBytes:&approval length:1U];
  PAAppendLengthString(payload, record.state);
  PAAppendLengthString(payload, record.reasonCode != nil ? record.reasonCode : @"");
  PAAppendLengthData(payload, record.responseFrame != nil ? record.responseFrame : [NSData data]);
  return PASHA256Commitment(PAOperationDomain, payload);
}

static BOOL PAValidateSidecarIfPresent(NSString *path, uid_t owner) {
  struct stat before;
  const char *filePath = path.fileSystemRepresentation;
  if (filePath == NULL) return NO;
  if (lstat(filePath, &before) != 0) return errno == ENOENT;
  if (!S_ISREG(before.st_mode) || before.st_uid != owner
      || before.st_nlink != 1 || (before.st_mode & 07777U) != 0600U) return NO;
  int descriptor = open(filePath, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  if (descriptor < 0) return NO;
  struct stat opened;
  struct stat after;
  BOOL valid = fstat(descriptor, &opened) == 0
    && PASamePrivateObject(&before, &opened)
    && PAHasNoExtendedACL(descriptor)
    && lstat(filePath, &after) == 0
    && PASamePrivateObject(&opened, &after);
  if (close(descriptor) != 0) valid = NO;
  return valid;
}

static BOOL PAExactTable(sqlite3 *database, NSString *name, const char *creation) {
  sqlite3_stmt *statement = NULL;
  BOOL valid = sqlite3_prepare_v2(database,
      "SELECT sql FROM sqlite_schema WHERE type='table' AND name=?",
      -1, &statement, NULL) == SQLITE_OK
    && sqlite3_bind_text(statement, 1, name.UTF8String, -1, SQLITE_TRANSIENT) == SQLITE_OK
    && sqlite3_step(statement) == SQLITE_ROW
    && sqlite3_column_type(statement, 0) == SQLITE_TEXT;
  if (valid) {
    const unsigned char *sql = sqlite3_column_text(statement, 0);
    NSString *observed = sql == NULL ? nil : [NSString stringWithUTF8String:(const char *)sql];
    NSString *expected = [[NSString stringWithUTF8String:creation]
      stringByReplacingOccurrencesOfString:@" IF NOT EXISTS" withString:@""];
    valid = observed != nil && [observed isEqualToString:expected]
      && sqlite3_step(statement) == SQLITE_DONE;
  }
  sqlite3_finalize(statement);
  return valid;
}

static BOOL PAJournalInitializeSchema(PAJournal *journal, BOOL freshDatabase) {
  sqlite3 *database = journal.database;
  const char *metadataTable =
    "CREATE TABLE IF NOT EXISTS metadata("
    "singleton INTEGER PRIMARY KEY CHECK(singleton=1),"
    "schema_version INTEGER NOT NULL,"
    "configuration_commitment TEXT NOT NULL,"
    "authority_record_digest TEXT NOT NULL,"
    "generation_commitment TEXT NOT NULL,"
    "key_id TEXT NOT NULL,"
    "last_issued_at INTEGER NOT NULL,"
    "operation_count INTEGER NOT NULL,"
    "checksum TEXT NOT NULL) STRICT";
  const char *operationsTable =
    "CREATE TABLE IF NOT EXISTS operations("
    "operation_id TEXT PRIMARY KEY,"
    "request_payload BLOB NOT NULL,"
    "issued_at INTEGER NOT NULL,"
    "valid_until INTEGER NOT NULL,"
    "signing_bytes BLOB NOT NULL,"
    "display_text TEXT NOT NULL,"
    "approval_started INTEGER NOT NULL CHECK(approval_started IN(0,1)),"
    "state TEXT NOT NULL CHECK(state IN('RESERVED','SIGN_ATTEMPTED','READY','REJECTED','QUARANTINED')),"
    "reason_code TEXT,"
    "response_frame BLOB,"
    "checksum TEXT NOT NULL) STRICT";
  int extensions = 1;
  int extensionResult = sqlite3_db_config(database, SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION,
    0, &extensions);
  BOOL setup = extensionResult == SQLITE_OK
    ? extensions == 0
    : sqlite3_compileoption_used("OMIT_LOAD_EXTENSION") != 0;
  setup = setup && PAQueryText(database, "PRAGMA journal_mode=DELETE", @"delete");
  setup = setup && PASQL(database, "PRAGMA synchronous=EXTRA")
    && PASQL(database, "PRAGMA fullfsync=ON")
    && PASQL(database, "PRAGMA foreign_keys=ON")
    && PASQL(database, "PRAGMA trusted_schema=OFF");
  setup = setup && PAQueryInteger(database, "PRAGMA synchronous", 3)
    && PAQueryInteger(database, "PRAGMA fullfsync", 1)
    && PAQueryInteger(database, "PRAGMA foreign_keys", 1)
    && PAQueryInteger(database, "PRAGMA trusted_schema", 0);
  BOOL schema = setup
      && (freshDatabase || PAQueryInteger(database,
        "SELECT COUNT(*) FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'", 2))
      && PASQL(database, "BEGIN IMMEDIATE")
      && (!freshDatabase || PASQL(database, metadataTable))
      && (!freshDatabase || PASQL(database, operationsTable));
  schema = schema && PAQueryInteger(database,
        "SELECT COUNT(*) FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'", 2)
      && PAExactTable(database, @"metadata", metadataTable)
      && PAExactTable(database, @"operations", operationsTable)
      && PAQueryText(database, "PRAGMA integrity_check", @"ok")
      && PAQueryInteger(database, "PRAGMA user_version", freshDatabase ? 0 : 1);
  if (!schema) {
    PASQL(database, "ROLLBACK");
    return NO;
  }
  sqlite3_stmt *count = NULL;
  BOOL valid = sqlite3_prepare_v2(
      database,
      "SELECT COUNT(*) FROM metadata",
      -1,
      &count,
      NULL
    ) == SQLITE_OK
    && sqlite3_step(count) == SQLITE_ROW
    && sqlite3_column_int64(count, 0) >= 0
    && sqlite3_column_int64(count, 0) <= 1;
  sqlite3_int64 rows = valid ? sqlite3_column_int64(count, 0) : -1;
  sqlite3_finalize(count);
  if (!valid) {
    PASQL(database, "ROLLBACK");
    return NO;
  }
  if (rows == 0 && freshDatabase) {
    sqlite3_stmt *insert = NULL;
    NSString *checksum = PAMetadataChecksum(journal.configuration, 0U, 0U);
    valid = sqlite3_prepare_v2(database,
      "INSERT INTO metadata VALUES(1,1,?,?,?,?,0,0,?)", -1, &insert, NULL) == SQLITE_OK
      && sqlite3_bind_text(insert, 1, journal.configuration.commitment.UTF8String, -1,
                           SQLITE_TRANSIENT) == SQLITE_OK
      && sqlite3_bind_text(insert, 2, journal.configuration.authority.recordDigest.UTF8String,
                           -1, SQLITE_TRANSIENT) == SQLITE_OK
      && sqlite3_bind_text(insert, 3,
                           journal.configuration.authority.generationCommitment.UTF8String,
                           -1, SQLITE_TRANSIENT) == SQLITE_OK
      && sqlite3_bind_text(insert, 4, journal.configuration.authority.keyIdentifier.UTF8String,
                           -1, SQLITE_TRANSIENT) == SQLITE_OK
      && sqlite3_bind_text(insert, 5, checksum.UTF8String, -1, SQLITE_TRANSIENT) == SQLITE_OK
      && sqlite3_step(insert) == SQLITE_DONE;
    sqlite3_finalize(insert);
  }
  if (rows != 1 && !(rows == 0 && freshDatabase)) valid = NO;
  if (!valid || (freshDatabase && !PASQL(database, "PRAGMA user_version=1"))
      || !PASQL(database, "COMMIT")) {
    PASQL(database, "ROLLBACK");
    return NO;
  }
  return PAQueryInteger(database, "PRAGMA user_version", 1)
    && PAQueryInteger(database, "SELECT COUNT(*) FROM metadata", 1);
}

static BOOL PAJournalValidateAllOperations(PAJournal *journal);

static BOOL PAInspectExistingFile(NSString *path, BOOL *exists) {
  struct stat status;
  if (lstat(path.fileSystemRepresentation, &status) == 0) {
    *exists = YES;
    return YES;
  }
  if (errno != ENOENT) return NO;
  *exists = NO;
  return YES;
}

static PAJournal *PAOpenJournal(PAConfiguration *configuration, NSError **error) {
  NSString *lockPath = [configuration.generationPath stringByAppendingPathComponent:@"attestor.lock"];
  BOOL existingLock = NO;
  if (!PAInspectExistingFile(lockPath, &existingLock)) {
    PARuntimeFail(error, 3);
    return nil;
  }
  int lockDescriptor = PAOpenOwnerPrivateFile(lockPath, configuration.effectiveUser, YES);
  if (lockDescriptor < 0 || flock(lockDescriptor, LOCK_EX) != 0) {
    if (lockDescriptor >= 0) close(lockDescriptor);
    PARuntimeFail(error, 3);
    return nil;
  }
  NSString *databasePath = [configuration.generationPath stringByAppendingPathComponent:@"journal.sqlite3"];
  BOOL existingDatabase = NO;
  if (!PAInspectExistingFile(databasePath, &existingDatabase)
      || existingLock != existingDatabase) {
    flock(lockDescriptor, LOCK_UN);
    close(lockDescriptor);
    PARuntimeFail(error, 3);
    return nil;
  }
  int databaseDescriptor = PAOpenOwnerPrivateFile(databasePath, configuration.effectiveUser, YES);
  if (databaseDescriptor < 0) {
    flock(lockDescriptor, LOCK_UN);
    close(lockDescriptor);
    PARuntimeFail(error, 3);
    return nil;
  }
  close(databaseDescriptor);
  if (!PAValidateSidecarIfPresent([databasePath stringByAppendingString:@"-journal"],
                                  configuration.effectiveUser)) {
    flock(lockDescriptor, LOCK_UN);
    close(lockDescriptor);
    PARuntimeFail(error, 3);
    return nil;
  }
  struct stat sidecar;
  if (lstat([databasePath stringByAppendingString:@"-wal"].fileSystemRepresentation, &sidecar) == 0
      || errno != ENOENT
      || lstat([databasePath stringByAppendingString:@"-shm"].fileSystemRepresentation,
               &sidecar) == 0
      || errno != ENOENT) {
    flock(lockDescriptor, LOCK_UN);
    close(lockDescriptor);
    PARuntimeFail(error, 3);
    return nil;
  }
  sqlite3 *database = NULL;
  int flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX;
  if (!existingDatabase) flags |= SQLITE_OPEN_CREATE;
#ifdef SQLITE_OPEN_NOFOLLOW
  flags |= SQLITE_OPEN_NOFOLLOW;
#endif
  if (sqlite3_open_v2(databasePath.fileSystemRepresentation, &database, flags, NULL) != SQLITE_OK
      || database == NULL) {
    if (database != NULL) sqlite3_close_v2(database);
    flock(lockDescriptor, LOCK_UN);
    close(lockDescriptor);
    PARuntimeFail(error, 3);
    return nil;
  }
  PAJournal *journal = [[PAJournal alloc] init];
  journal.database = database;
  journal.lockDescriptor = lockDescriptor;
  journal.configuration = configuration;
  BOOL schemaValid = PAJournalInitializeSchema(journal, !existingDatabase);
  if (!schemaValid || !PAJournalValidateAllOperations(journal)) {
    sqlite3_close_v2(database);
    flock(lockDescriptor, LOCK_UN);
    close(lockDescriptor);
    PARuntimeFail(error, 3);
    return nil;
  }
  return journal;
}

static void PACloseJournal(PAJournal *journal) {
  if (journal == nil) return;
  if (journal.database != NULL) {
    sqlite3_close_v2(journal.database);
    journal.database = NULL;
  }
  if (journal.lockDescriptor >= 0) {
    flock(journal.lockDescriptor, LOCK_UN);
    close(journal.lockDescriptor);
    journal.lockDescriptor = -1;
  }
}

static BOOL PAJournalLoadMetadata(
  PAJournal *journal,
  uint64_t *lastIssuedAt,
  uint64_t *count
) {
  sqlite3_stmt *statement = NULL;
  BOOL valid = sqlite3_prepare_v2(
      journal.database,
      "SELECT schema_version,configuration_commitment,authority_record_digest,"
      "generation_commitment,key_id,last_issued_at,operation_count,checksum "
      "FROM metadata WHERE singleton=1",
      -1,
      &statement,
      NULL
    ) == SQLITE_OK
    && sqlite3_step(statement) == SQLITE_ROW
    && sqlite3_column_type(statement, 0) == SQLITE_INTEGER
    && sqlite3_column_type(statement, 1) == SQLITE_TEXT
    && sqlite3_column_type(statement, 2) == SQLITE_TEXT
    && sqlite3_column_type(statement, 3) == SQLITE_TEXT
    && sqlite3_column_type(statement, 4) == SQLITE_TEXT
    && sqlite3_column_type(statement, 5) == SQLITE_INTEGER
    && sqlite3_column_type(statement, 6) == SQLITE_INTEGER
    && sqlite3_column_type(statement, 7) == SQLITE_TEXT;
  NSString *configurationCommitment = nil;
  NSString *authorityDigest = nil;
  NSString *generationCommitment = nil;
  NSString *keyIdentifier = nil;
  NSString *checksum = nil;
  sqlite3_int64 issued = -1;
  sqlite3_int64 operationCount = -1;
  if (valid) {
    const unsigned char *configurationText = sqlite3_column_text(statement, 1);
    const unsigned char *authorityText = sqlite3_column_text(statement, 2);
    const unsigned char *generationText = sqlite3_column_text(statement, 3);
    const unsigned char *keyText = sqlite3_column_text(statement, 4);
    const unsigned char *checksumText = sqlite3_column_text(statement, 7);
    configurationCommitment = configurationText == NULL ? nil
      : [NSString stringWithUTF8String:(const char *)configurationText];
    authorityDigest = authorityText == NULL ? nil
      : [NSString stringWithUTF8String:(const char *)authorityText];
    generationCommitment = generationText == NULL ? nil
      : [NSString stringWithUTF8String:(const char *)generationText];
    keyIdentifier = keyText == NULL ? nil
      : [NSString stringWithUTF8String:(const char *)keyText];
    checksum = checksumText == NULL ? nil
      : [NSString stringWithUTF8String:(const char *)checksumText];
    issued = sqlite3_column_int64(statement, 5);
    operationCount = sqlite3_column_int64(statement, 6);
    valid = sqlite3_column_int64(statement, 0) == 1
      && issued >= 0 && operationCount >= 0
      && configurationCommitment != nil
      && authorityDigest != nil
      && generationCommitment != nil
      && keyIdentifier != nil
      && checksum != nil
      && sqlite3_step(statement) == SQLITE_DONE;
  }
  sqlite3_finalize(statement);
  if (!valid) return NO;
  uint64_t observed = (uint64_t)issued;
  valid = [configurationCommitment isEqualToString:journal.configuration.commitment]
    && [authorityDigest isEqualToString:journal.configuration.authority.recordDigest]
    && [generationCommitment isEqualToString:
      journal.configuration.authority.generationCommitment]
    && [keyIdentifier isEqualToString:journal.configuration.authority.keyIdentifier]
    && [checksum isEqualToString:PAMetadataChecksum(
      journal.configuration, observed, (uint64_t)operationCount)]
    && PAQueryInteger(journal.database, "SELECT COUNT(*) FROM operations", operationCount);
  if (valid && lastIssuedAt != NULL) *lastIssuedAt = observed;
  if (valid && count != NULL) *count = (uint64_t)operationCount;
  return valid;
}

static NSData *PAFrameFromPayload(NSData *payload) {
  if (payload.length == 0U || payload.length > UINT32_MAX) return nil;
  uint32_t length = CFSwapInt32HostToBig((uint32_t)payload.length);
  NSMutableData *frame = [NSMutableData dataWithBytes:&length length:sizeof(length)];
  [frame appendData:payload];
  return [frame copy];
}

static NSDictionary *PAParseStoredResponse(NSData *frame, NSString *operationIdentifier) {
  if (frame.length < 5U || frame.length > PAResponseMaximumPayloadBytes + 4U) return nil;
  const uint8_t *bytes = frame.bytes;
  NSUInteger length = ((NSUInteger)bytes[0] << 24U)
    | ((NSUInteger)bytes[1] << 16U)
    | ((NSUInteger)bytes[2] << 8U)
    | (NSUInteger)bytes[3];
  if (length == 0U || length > PAResponseMaximumPayloadBytes || frame.length != length + 4U) {
    return nil;
  }
  NSData *payload = [frame subdataWithRange:NSMakeRange(4U, length)];
  id value = PAParseCanonicalJSONData(payload, PAResponseMaximumPayloadBytes, NULL);
  if (![value isKindOfClass:[NSDictionary class]]
      || ![value[@"operationId"] isEqualToString:operationIdentifier]) return nil;
  NSData *rebuilt = PAFrameSigningResponse(value, PAResponseMaximumPayloadBytes, NULL);
  return [rebuilt isEqualToData:frame] ? value : nil;
}

static NSString *PADisplayText(NSData *requestPayload, uint64_t issuedAt, uint64_t validUntil) {
  NSString *request = [[NSString alloc] initWithData:requestPayload
                                            encoding:NSUTF8StringEncoding];
  if (request == nil) return nil;
  return [NSString stringWithFormat:
    @"DEVELOPMENT/TESTNET SOFTWARE ATTESTOR\n\n"
    "This is a Development/Testnet Software Attestor. SoftHSM software-token files are "
    "copyable and remain inside one virtual machine trust boundary. Chain facts below are "
    "caller-supplied. The system authentication prompt is not content-bound and proves no "
    "biometric factor. This operation proves no chain canonicality, finality, settlement, "
    "hardware custody, nonexportability, or production readiness.\n\n"
    "Frozen issuedAt epoch seconds: %llu\n"
    "Frozen validUntil epoch seconds: %llu\n\n"
    "Complete committed signing request (canonical JSON; no truncation):\n%@",
    issuedAt,
    validUntil,
    request
  ];
}

static PAParsedSigningRequest *PAParseStoredRequest(
  PAConfiguration *configuration,
  NSData *payload
) {
  NSData *frame = PAFrameFromPayload(payload);
  return frame == nil ? nil : PAParseSigningRequestFrame(
    frame,
    configuration.authority,
    NULL
  );
}

static PAOperationRecord *PAJournalLoadOperation(
  PAJournal *journal,
  NSString *operationIdentifier
) {
  if (!PAJournalLoadMetadata(journal, NULL, NULL)) return nil;
  sqlite3_stmt *statement = NULL;
  BOOL valid = sqlite3_prepare_v2(
      journal.database,
      "SELECT operation_id,request_payload,issued_at,valid_until,signing_bytes,display_text,"
      "approval_started,state,reason_code,response_frame,checksum FROM operations "
      "WHERE operation_id=?",
      -1,
      &statement,
      NULL
    ) == SQLITE_OK
    && sqlite3_bind_text(statement, 1, operationIdentifier.UTF8String, -1,
                         SQLITE_TRANSIENT) == SQLITE_OK;
  int step = valid ? sqlite3_step(statement) : SQLITE_ERROR;
  if (step == SQLITE_DONE) {
    sqlite3_finalize(statement);
    return (PAOperationRecord *)[NSNull null];
  }
  valid = step == SQLITE_ROW
    && sqlite3_column_type(statement, 0) == SQLITE_TEXT
    && sqlite3_column_type(statement, 1) == SQLITE_BLOB
    && sqlite3_column_type(statement, 2) == SQLITE_INTEGER
    && sqlite3_column_type(statement, 3) == SQLITE_INTEGER
    && sqlite3_column_type(statement, 4) == SQLITE_BLOB
    && sqlite3_column_type(statement, 5) == SQLITE_TEXT
    && sqlite3_column_type(statement, 6) == SQLITE_INTEGER
    && sqlite3_column_type(statement, 7) == SQLITE_TEXT
    && (sqlite3_column_type(statement, 8) == SQLITE_NULL
      || sqlite3_column_type(statement, 8) == SQLITE_TEXT)
    && (sqlite3_column_type(statement, 9) == SQLITE_NULL
      || sqlite3_column_type(statement, 9) == SQLITE_BLOB)
    && sqlite3_column_type(statement, 10) == SQLITE_TEXT;
  PAOperationRecord *record = nil;
  if (valid) {
    const unsigned char *operationText = sqlite3_column_text(statement, 0);
    const void *requestBytes = sqlite3_column_blob(statement, 1);
    int requestLength = sqlite3_column_bytes(statement, 1);
    sqlite3_int64 issuedAt = sqlite3_column_int64(statement, 2);
    sqlite3_int64 validUntil = sqlite3_column_int64(statement, 3);
    const void *signingBytes = sqlite3_column_blob(statement, 4);
    int signingLength = sqlite3_column_bytes(statement, 4);
    const unsigned char *displayText = sqlite3_column_text(statement, 5);
    int displayLength = sqlite3_column_bytes(statement, 5);
    sqlite3_int64 approval = sqlite3_column_int64(statement, 6);
    const unsigned char *stateText = sqlite3_column_text(statement, 7);
    const unsigned char *reasonText = sqlite3_column_text(statement, 8);
    int reasonLength = sqlite3_column_bytes(statement, 8);
    const void *responseBytes = sqlite3_column_blob(statement, 9);
    int responseLength = sqlite3_column_bytes(statement, 9);
    const unsigned char *checksumText = sqlite3_column_text(statement, 10);
    if (operationText != NULL && requestBytes != NULL && requestLength > 0
        && issuedAt >= 0 && validUntil > issuedAt
        && signingBytes != NULL && signingLength > 0 && displayText != NULL
        && displayLength > 0 && (approval == 0 || approval == 1)
        && stateText != NULL && checksumText != NULL) {
      record = [[PAOperationRecord alloc] init];
      record.operationIdentifier = [NSString stringWithUTF8String:(const char *)operationText];
      record.requestPayload = [NSData dataWithBytes:requestBytes length:(NSUInteger)requestLength];
      record.issuedAt = (uint64_t)issuedAt;
      record.validUntil = (uint64_t)validUntil;
      record.signingBytes = [NSData dataWithBytes:signingBytes length:(NSUInteger)signingLength];
      record.displayText = [[NSString alloc] initWithBytes:displayText
                                                   length:(NSUInteger)displayLength
                                                 encoding:NSUTF8StringEncoding];
      record.approvalStarted = approval == 1;
      record.state = [NSString stringWithUTF8String:(const char *)stateText];
      record.reasonCode = reasonText == NULL ? nil
        : [[NSString alloc] initWithBytes:reasonText
                                  length:(NSUInteger)reasonLength
                                encoding:NSUTF8StringEncoding];
      record.responseFrame = responseBytes == NULL ? nil
        : [NSData dataWithBytes:responseBytes length:(NSUInteger)responseLength];
      record.checksum = [NSString stringWithUTF8String:(const char *)checksumText];
    }
    valid = record != nil && sqlite3_step(statement) == SQLITE_DONE;
  }
  sqlite3_finalize(statement);
  if (!valid || record == nil
      || ![record.operationIdentifier isEqualToString:operationIdentifier]
      || ![record.checksum isEqualToString:PAOperationChecksum(journal.configuration, record)]) {
    return nil;
  }
  PAParsedSigningRequest *request = PAParseStoredRequest(
    journal.configuration,
    record.requestPayload
  );
  NSData *signingBytes = request == nil ? nil : PACreateAttestationSigningBytes(
    request,
    record.issuedAt,
    record.validUntil,
    NULL
  );
  NSString *display = PADisplayText(record.requestPayload, record.issuedAt, record.validUntil);
  if (request == nil
      || ![request.operationIdentifier isEqualToString:operationIdentifier]
      || ![record.signingBytes isEqualToData:signingBytes]
      || ![record.displayText isEqualToString:display]) return nil;
  NSDictionary *response = record.responseFrame == nil ? nil
    : PAParseStoredResponse(record.responseFrame, operationIdentifier);
  BOOL stateValid = NO;
  if ([record.state isEqualToString:@"RESERVED"]) {
    stateValid = record.reasonCode == nil && record.responseFrame == nil;
  } else if ([record.state isEqualToString:@"SIGN_ATTEMPTED"]) {
    stateValid = record.approvalStarted && record.reasonCode == nil
      && record.responseFrame == nil;
  } else if ([record.state isEqualToString:@"READY"]) {
    NSDictionary *envelope = response[@"envelope"];
    stateValid = record.approvalStarted && record.reasonCode == nil
      && [response[@"status"] isEqualToString:@"READY"]
      && [envelope[@"attestationId"] isEqualToString:
        request.attestationRequest[@"attestationId"]]
      && [envelope[@"keyId"] isEqualToString:journal.configuration.authority.keyIdentifier]
      && [envelope[@"issuedAt"] isEqualToNumber:@(record.issuedAt)]
      && [envelope[@"validUntil"] isEqualToNumber:@(record.validUntil)];
  } else if ([record.state isEqualToString:@"REJECTED"]) {
    stateValid = record.reasonCode != nil
      && [response[@"status"] isEqualToString:@"REJECTED"]
      && [response[@"reasonCode"] isEqualToString:record.reasonCode];
  } else if ([record.state isEqualToString:@"QUARANTINED"]) {
    stateValid = record.reasonCode == nil
      && (record.responseFrame == nil || [response[@"status"] isEqualToString:@"READY"]);
  }
  if (!stateValid) return nil;
  return record;
}

static BOOL PAJournalValidateAllOperations(PAJournal *journal) {
  if (!PAJournalLoadMetadata(journal, NULL, NULL)) return NO;
  sqlite3_stmt *statement = NULL;
  BOOL valid = sqlite3_prepare_v2(journal.database,
    "SELECT operation_id FROM operations", -1, &statement, NULL) == SQLITE_OK;
  int step = valid ? sqlite3_step(statement) : SQLITE_ERROR;
  while (valid && step == SQLITE_ROW) {
    const unsigned char *text = sqlite3_column_type(statement, 0) == SQLITE_TEXT
      ? sqlite3_column_text(statement, 0) : NULL;
    NSString *identifier = text == NULL ? nil : [NSString stringWithUTF8String:(const char *)text];
    PAOperationRecord *record = identifier == nil ? nil
      : PAJournalLoadOperation(journal, identifier);
    valid = record != nil && record != (id)[NSNull null];
    if (valid) step = sqlite3_step(statement);
  }
  valid = valid && step == SQLITE_DONE;
  sqlite3_finalize(statement);
  return valid;
}

static PAOperationRecord *PACopyRecord(PAOperationRecord *source) {
  PAOperationRecord *copy = [[PAOperationRecord alloc] init];
  copy.operationIdentifier = source.operationIdentifier;
  copy.requestPayload = source.requestPayload;
  copy.issuedAt = source.issuedAt;
  copy.validUntil = source.validUntil;
  copy.signingBytes = source.signingBytes;
  copy.displayText = source.displayText;
  copy.approvalStarted = source.approvalStarted;
  copy.state = source.state;
  copy.reasonCode = source.reasonCode;
  copy.responseFrame = source.responseFrame;
  copy.checksum = source.checksum;
  return copy;
}

static BOOL PASameRecord(PAOperationRecord *left, PAOperationRecord *right) {
  return left != nil && right != nil
    && [left.operationIdentifier isEqualToString:right.operationIdentifier]
    && [left.requestPayload isEqualToData:right.requestPayload]
    && left.issuedAt == right.issuedAt
    && left.validUntil == right.validUntil
    && [left.signingBytes isEqualToData:right.signingBytes]
    && [left.displayText isEqualToString:right.displayText]
    && left.approvalStarted == right.approvalStarted
    && [left.state isEqualToString:right.state]
    && ((left.reasonCode == nil && right.reasonCode == nil)
      || [left.reasonCode isEqualToString:right.reasonCode])
    && ((left.responseFrame == nil && right.responseFrame == nil)
      || [left.responseFrame isEqualToData:right.responseFrame])
    && [left.checksum isEqualToString:right.checksum];
}

static BOOL PABindRecord(sqlite3_stmt *statement, PAOperationRecord *record) {
  return sqlite3_bind_blob(statement, 1, record.requestPayload.bytes,
                           (int)record.requestPayload.length, SQLITE_TRANSIENT) == SQLITE_OK
    && sqlite3_bind_int64(statement, 2, (sqlite3_int64)record.issuedAt) == SQLITE_OK
    && sqlite3_bind_int64(statement, 3, (sqlite3_int64)record.validUntil) == SQLITE_OK
    && sqlite3_bind_blob(statement, 4, record.signingBytes.bytes,
                         (int)record.signingBytes.length, SQLITE_TRANSIENT) == SQLITE_OK
    && sqlite3_bind_text(statement, 5, record.displayText.UTF8String, -1,
                         SQLITE_TRANSIENT) == SQLITE_OK
    && sqlite3_bind_int(statement, 6, record.approvalStarted ? 1 : 0) == SQLITE_OK
    && sqlite3_bind_text(statement, 7, record.state.UTF8String, -1,
                         SQLITE_TRANSIENT) == SQLITE_OK
    && (record.reasonCode == nil
      ? sqlite3_bind_null(statement, 8)
      : sqlite3_bind_text(statement, 8, record.reasonCode.UTF8String, -1, SQLITE_TRANSIENT))
        == SQLITE_OK
    && (record.responseFrame == nil
      ? sqlite3_bind_null(statement, 9)
      : sqlite3_bind_blob(statement, 9, record.responseFrame.bytes,
                          (int)record.responseFrame.length, SQLITE_TRANSIENT)) == SQLITE_OK
    && sqlite3_bind_text(statement, 10, record.checksum.UTF8String, -1,
                         SQLITE_TRANSIENT) == SQLITE_OK;
}

static BOOL PAJournalInsertReserved(
  PAJournal *journal,
  PAOperationRecord *record,
  uint64_t expectedHistory
) {
  record.checksum = PAOperationChecksum(journal.configuration, record);
  if (!PASQL(journal.database, "BEGIN IMMEDIATE")) return NO;
  uint64_t observedHistory = 0U;
  uint64_t observedCount = 0U;
  if (!PAJournalLoadMetadata(journal, &observedHistory, &observedCount)
      || observedHistory != expectedHistory || observedCount >= 9007199254740991ULL) {
    PASQL(journal.database, "ROLLBACK");
    return NO;
  }
  sqlite3_stmt *insert = NULL;
  BOOL valid = sqlite3_prepare_v2(
      journal.database,
      "INSERT INTO operations VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      -1,
      &insert,
      NULL
    ) == SQLITE_OK
    && sqlite3_bind_text(insert, 1, record.operationIdentifier.UTF8String, -1,
                         SQLITE_TRANSIENT) == SQLITE_OK;
  if (valid) {
    sqlite3_stmt *bindingTarget = insert;
    // PABindRecord expects the ten fields following operation_id.
    sqlite3_bind_parameter_index(bindingTarget, "unused");
    valid = sqlite3_bind_blob(insert, 2, record.requestPayload.bytes,
                              (int)record.requestPayload.length, SQLITE_TRANSIENT) == SQLITE_OK
      && sqlite3_bind_int64(insert, 3, (sqlite3_int64)record.issuedAt) == SQLITE_OK
      && sqlite3_bind_int64(insert, 4, (sqlite3_int64)record.validUntil) == SQLITE_OK
      && sqlite3_bind_blob(insert, 5, record.signingBytes.bytes,
                           (int)record.signingBytes.length, SQLITE_TRANSIENT) == SQLITE_OK
      && sqlite3_bind_text(insert, 6, record.displayText.UTF8String, -1,
                           SQLITE_TRANSIENT) == SQLITE_OK
      && sqlite3_bind_int(insert, 7, 0) == SQLITE_OK
      && sqlite3_bind_text(insert, 8, "RESERVED", -1, SQLITE_STATIC) == SQLITE_OK
      && sqlite3_bind_null(insert, 9) == SQLITE_OK
      && sqlite3_bind_null(insert, 10) == SQLITE_OK
      && sqlite3_bind_text(insert, 11, record.checksum.UTF8String, -1,
                           SQLITE_TRANSIENT) == SQLITE_OK
      && sqlite3_step(insert) == SQLITE_DONE;
  }
  sqlite3_finalize(insert);
  NSString *metadataChecksum = PAMetadataChecksum(
    journal.configuration, record.issuedAt, observedCount + 1U);
  sqlite3_stmt *metadata = NULL;
  valid = valid
    && sqlite3_prepare_v2(journal.database,
      "UPDATE metadata SET last_issued_at=?,operation_count=?,checksum=? "
      "WHERE singleton=1 AND last_issued_at=? AND operation_count=?",
      -1, &metadata, NULL) == SQLITE_OK
    && sqlite3_bind_int64(metadata, 1, (sqlite3_int64)record.issuedAt) == SQLITE_OK
    && sqlite3_bind_int64(metadata, 2, (sqlite3_int64)(observedCount + 1U)) == SQLITE_OK
    && sqlite3_bind_text(metadata, 3, metadataChecksum.UTF8String, -1, SQLITE_TRANSIENT)
      == SQLITE_OK
    && sqlite3_bind_int64(metadata, 4, (sqlite3_int64)expectedHistory) == SQLITE_OK
    && sqlite3_bind_int64(metadata, 5, (sqlite3_int64)observedCount) == SQLITE_OK
    && sqlite3_step(metadata) == SQLITE_DONE
    && sqlite3_changes(journal.database) == 1;
  sqlite3_finalize(metadata);
  if (!valid || !PASQL(journal.database, "COMMIT")) {
    PASQL(journal.database, "ROLLBACK");
    return NO;
  }
  uint64_t history = 0U;
  PAOperationRecord *persisted = PAJournalLoadOperation(journal, record.operationIdentifier);
  uint64_t count = 0U;
  return PAJournalLoadMetadata(journal, &history, &count)
    && history == record.issuedAt
    && count == observedCount + 1U
    && persisted != (id)[NSNull null]
    && PASameRecord(record, persisted);
}

static BOOL PAJournalCommitRecord(PAJournal *journal, PAOperationRecord *record) {
  record.checksum = PAOperationChecksum(journal.configuration, record);
  if (!PASQL(journal.database, "BEGIN IMMEDIATE")) return NO;
  sqlite3_stmt *update = NULL;
  BOOL valid = sqlite3_prepare_v2(
      journal.database,
      "UPDATE operations SET request_payload=?,issued_at=?,valid_until=?,signing_bytes=?,"
      "display_text=?,approval_started=?,state=?,reason_code=?,response_frame=?,checksum=? "
      "WHERE operation_id=?",
      -1,
      &update,
      NULL
    ) == SQLITE_OK
    && PABindRecord(update, record)
    && sqlite3_bind_text(update, 11, record.operationIdentifier.UTF8String, -1,
                         SQLITE_TRANSIENT) == SQLITE_OK
    && sqlite3_step(update) == SQLITE_DONE
    && sqlite3_changes(journal.database) == 1;
  sqlite3_finalize(update);
  if (!valid || !PASQL(journal.database, "COMMIT")) {
    PASQL(journal.database, "ROLLBACK");
    return NO;
  }
  PAOperationRecord *persisted = PAJournalLoadOperation(journal, record.operationIdentifier);
  return persisted != nil && persisted != (id)[NSNull null] && PASameRecord(record, persisted);
}

static NSData *PAResponseFrame(
  NSString *operationIdentifier,
  NSString *status,
  NSString *reasonCode,
  NSDictionary *envelope
) {
  NSDictionary *response = @{
    @"protocolVersion": @1,
    @"messageType": @"zenon-funding-provider-signing-response",
    @"operationId": operationIdentifier,
    @"status": status,
    @"reasonCode": reasonCode != nil ? reasonCode : [NSNull null],
    @"envelope": envelope != nil ? envelope : [NSNull null],
  };
  return PAFrameSigningResponse(response, PAResponseMaximumPayloadBytes, NULL);
}

static BOOL PAQuarantine(PAJournal *journal, PAOperationRecord *record) {
  PAOperationRecord *quarantined = PACopyRecord(record);
  quarantined.state = @"QUARANTINED";
  quarantined.reasonCode = nil;
  if (quarantined.responseFrame != nil) {
    NSDictionary *response = PAParseStoredResponse(
      quarantined.responseFrame,
      quarantined.operationIdentifier
    );
    if (![response[@"status"] isEqualToString:@"READY"]) quarantined.responseFrame = nil;
  }
  return PAJournalCommitRecord(journal, quarantined);
}

static NSData *PAReject(
  PAJournal *journal,
  PAOperationRecord *record,
  NSString *reasonCode
) {
  NSData *frame = PAResponseFrame(record.operationIdentifier, @"REJECTED", reasonCode, nil);
  if (frame == nil) return nil;
  PAOperationRecord *rejected = PACopyRecord(record);
  rejected.state = @"REJECTED";
  rejected.reasonCode = reasonCode;
  rejected.responseFrame = frame;
  return PAJournalCommitRecord(journal, rejected) ? frame : nil;
}

static NSData *PAExecuteFrame(
  NSData *frame,
  NSString *rootPath,
  id<PAPlatformAdapter> platform
#if defined(PA_TESTING)
  , id<PATestSigner> testSigner
#endif
) {
  PAConfiguration *configuration = PAReadConfiguration(rootPath, NULL);
  if (configuration == nil) return nil;
  PAJournal *journal = PAOpenJournal(configuration, NULL);
  if (journal == nil) return nil;
  NSData *result = nil;
  @try {
    PAParsedSigningRequest *request = PAParseSigningRequestFrame(
      frame, configuration.authority, NULL
    );
    if (request == nil) return nil;
    PAOperationRecord *record = PAJournalLoadOperation(journal, request.operationIdentifier);
    if (record == nil) return nil;
    if (record != (id)[NSNull null]) {
      if (![record.requestPayload isEqualToData:request.canonicalWirePayload]) {
        return PAResponseFrame(request.operationIdentifier, @"REJECTED",
                               @"OPERATION_CONFLICT", nil);
      }
      if ([record.state isEqualToString:@"READY"]
          || [record.state isEqualToString:@"REJECTED"]) return record.responseFrame;
      if (![record.state isEqualToString:@"RESERVED"] || record.approvalStarted) {
        PAQuarantine(journal, record);
        return nil;
      }
    } else {
      uint64_t history = 0U;
      uint64_t now = 0U;
      if (!PAJournalLoadMetadata(journal, &history, NULL)
          || ![platform copyEpochSeconds:&now]
          || now < history || now > 9007199254740991ULL
          || configuration.validitySeconds > 9007199254740991ULL - now) return nil;
      uint64_t expiry = 0U;
      if (!PAUnsignedInteger(request.attestationRequest[@"unsignedFundingEvidence"][@"expiresAt"],
                             YES, &expiry)) return nil;
      uint64_t validUntil = now + configuration.validitySeconds;
      if (validUntil > expiry) validUntil = expiry;
      if (validUntil <= now) return nil;
      record = [[PAOperationRecord alloc] init];
      record.operationIdentifier = request.operationIdentifier;
      record.requestPayload = request.canonicalWirePayload;
      record.issuedAt = now;
      record.validUntil = validUntil;
      record.signingBytes = PACreateAttestationSigningBytes(request, now, validUntil, NULL);
      record.displayText = PADisplayText(record.requestPayload, now, validUntil);
      record.approvalStarted = NO;
      record.state = @"RESERVED";
      if (record.signingBytes == nil || record.displayText == nil
          || !PAJournalInsertReserved(journal, record, history)) return nil;
    }
    uint64_t now = 0U;
    if (![platform copyEpochSeconds:&now]) return nil;
    if (now >= record.validUntil) return PAReject(journal, record, @"POLICY_REJECTED");
    id context = [platform createAuthenticationContext];
    PAApprovalAvailability availability = context == nil
      ? PAApprovalAvailabilityUnavailable
      : [platform approvalAvailabilityForContext:context];
    if (availability == PAApprovalAvailabilityUnavailable) {
      if (context != nil) [platform invalidateAuthenticationContext:context];
      result = PAResponseFrame(request.operationIdentifier, @"APPROVAL_REQUIRED",
                               @"OPERATOR_APPROVAL_REQUIRED", nil);
    } else if (availability != PAApprovalAvailabilityAvailable) {
      if (context != nil) [platform invalidateAuthenticationContext:context];
      PAQuarantine(journal, record);
    } else {
#if defined(PA_TESTING)
      if (testSigner == nil) {
        [platform invalidateAuthenticationContext:context];
        PAQuarantine(journal, record);
        return nil;
      }
      PAOperationRecord *latched = PACopyRecord(record);
      latched.approvalStarted = YES;
      if (!PAJournalCommitRecord(journal, latched)) {
        [platform invalidateAuthenticationContext:context];
        return nil;
      }
      record = latched;
      PAOperatorDisplayOutcome display = [platform displayCommittedOperation:record.displayText];
      PAAuthenticationOutcome authentication = display == PAOperatorDisplayOutcomeContinued
        ? [platform authenticateContext:context] : PAAuthenticationOutcomeAmbiguous;
      [platform invalidateAuthenticationContext:context];
      if (display == PAOperatorDisplayOutcomeCancelled
          || authentication == PAAuthenticationOutcomeDenied) {
        return PAReject(journal, record, @"POLICY_REJECTED");
      }
      if (display != PAOperatorDisplayOutcomeContinued
          || authentication != PAAuthenticationOutcomeApproved) {
        PAQuarantine(journal, record);
        return nil;
      }
      uint64_t afterApproval = 0U;
      if (![platform copyEpochSeconds:&afterApproval]) {
        PAQuarantine(journal, record);
        return nil;
      }
      if (afterApproval >= record.validUntil) {
        return PAReject(journal, record, @"POLICY_REJECTED");
      }
      PAOperationRecord *attempted = PACopyRecord(record);
      attempted.state = @"SIGN_ATTEMPTED";
      if (!PAJournalCommitRecord(journal, attempted)) return nil;
      record = attempted;
      NSData *signature = [testSigner signFrozenMessage:record.signingBytes
                                   operationIdentifier:record.operationIdentifier];
      if (signature.length != 64U) {
        PAQuarantine(journal, record);
        return nil;
      }
      NSDictionary *envelope = @{
        @"envelopeVersion": @1,
        @"attestationId": request.attestationRequest[@"attestationId"],
        @"keyId": configuration.authority.keyIdentifier,
        @"issuedAt": @(record.issuedAt),
        @"validUntil": @(record.validUntil),
        @"signature": PABase64URLString(signature),
      };
      NSData *readyFrame = PAResponseFrame(record.operationIdentifier, @"READY", nil, envelope);
      if (readyFrame == nil) {
        PAQuarantine(journal, record);
        return nil;
      }
      PAOperationRecord *ready = PACopyRecord(record);
      ready.state = @"READY";
      ready.responseFrame = readyFrame;
      result = PAJournalCommitRecord(journal, ready) ? readyFrame : nil;
#else
      [platform invalidateAuthenticationContext:context];
      PAQuarantine(journal, record);
#endif
    }
  } @finally {
    PACloseJournal(journal);
  }
  return result;
}

#if defined(PA_RELEASE_BUILD)
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

int PARunProviderAttestorChild(void) {
  id<PAPlatformAdapter> platform = PAProductionPlatformAdapter();
  NSData *frame = PAReadOneFrame(3);
  close(3);
  NSString *rootPath = PAEffectiveUserApplicationSupportRoot(NULL);
  if (frame == nil || rootPath == nil || platform == nil) return 2;
  NSData *response = PAExecuteFrame(frame, rootPath, platform
#if defined(PA_TESTING)
    , nil
#endif
  );
  if (response == nil) return 3;
  BOOL written = PAWriteOneFrame(4, response);
  close(4);
  return written ? 0 : 4;
}
#endif

#if defined(PA_TESTING)
int PATestExecuteProviderAttestorFrame(
  NSData *requestFrame,
  NSString *rootPath,
  id<PAPlatformAdapter> platform,
  id<PATestSigner> testSigner,
  PATestResponseEmitter emitter
) {
  if (requestFrame == nil || rootPath == nil || platform == nil || emitter == nil) return 2;
  NSData *response = PAExecuteFrame(requestFrame, rootPath, platform, testSigner);
  return response == nil ? 3 : (emitter(response) ? 0 : 4);
}
#endif
