#import "test_grant_adapter.h"

#include <sqlite3.h>
#include <errno.h>
#include <poll.h>
#include <string.h>
#include <unistd.h>

@interface PATestGrantAdapter ()
@property(nonatomic) NSString *mode;
@property(nonatomic) NSString *journalPath;
@property(nonatomic, readwrite) NSUInteger clockCalls;
@property(nonatomic, readwrite) NSUInteger contextCalls;
@property(nonatomic, readwrite) NSUInteger displayCalls;
@property(nonatomic, readwrite) NSUInteger authenticationCalls;
@property(nonatomic, readwrite) NSUInteger signCalls;
@end

@implementation PATestGrantAdapter

- (instancetype)initWithMode:(NSString *)mode journalPath:(NSString *)journalPath {
  self = [super init];
  if (self != nil) {
    _mode = [mode copy];
    _journalPath = [journalPath copy];
  }
  return self;
}

- (BOOL)committedState:(NSString *)state
       approvalStarted:(int)approval
                 field:(NSString *)field
                 value:(NSData *)value {
  sqlite3 *database = NULL;
  if (sqlite3_open_v2(self.journalPath.fileSystemRepresentation, &database,
        SQLITE_OPEN_READONLY, NULL) != SQLITE_OK) {
    if (database != NULL) sqlite3_close_v2(database);
    return NO;
  }
  sqlite3_stmt *statement = NULL;
  BOOL valid = sqlite3_prepare_v2(database,
    "SELECT state,approval_started,display_text,signing_bytes FROM operations",
    -1, &statement, NULL) == SQLITE_OK
    && sqlite3_step(statement) == SQLITE_ROW;
  if (valid) {
    const unsigned char *observedState = sqlite3_column_text(statement, 0);
    NSString *text = observedState == NULL ? nil
      : [NSString stringWithUTF8String:(const char *)observedState];
    int column = [field isEqualToString:@"display"] ? 2 : 3;
    const void *bytes = sqlite3_column_blob(statement, column);
    int length = sqlite3_column_bytes(statement, column);
    NSData *stored = bytes == NULL ? nil : [NSData dataWithBytes:bytes length:(NSUInteger)length];
    valid = [text isEqualToString:state]
      && sqlite3_column_int(statement, 1) == approval
      && [stored isEqualToData:value]
      && sqlite3_step(statement) == SQLITE_DONE;
  }
  sqlite3_finalize(statement);
  sqlite3_close_v2(database);
  return valid;
}

- (BOOL)validateBeforeEmission:(NSData *)frame {
  sqlite3 *database = NULL;
  if (sqlite3_open_v2(self.journalPath.fileSystemRepresentation, &database,
        SQLITE_OPEN_READONLY, NULL) != SQLITE_OK) {
    if (database != NULL) sqlite3_close_v2(database);
    return NO;
  }
  sqlite3_stmt *statement = NULL;
  BOOL valid = sqlite3_prepare_v2(database,
    "SELECT state,approval_started,response_frame FROM operations",
    -1, &statement, NULL) == SQLITE_OK && sqlite3_step(statement) == SQLITE_ROW;
  if (valid) {
    const unsigned char *stateBytes = sqlite3_column_text(statement, 0);
    NSString *state = stateBytes == NULL ? nil
      : [NSString stringWithUTF8String:(const char *)stateBytes];
    BOOL unavailable = [self.mode isEqualToString:@"unavailable"];
    BOOL rejected = [self.mode isEqualToString:@"deny"]
      || [self.mode isEqualToString:@"post_expired"];
    const void *storedBytes = sqlite3_column_blob(statement, 2);
    int length = sqlite3_column_bytes(statement, 2);
    NSData *stored = storedBytes == NULL ? nil
      : [NSData dataWithBytes:storedBytes length:(NSUInteger)length];
    valid = unavailable
      ? ([state isEqualToString:@"RESERVED"]
        && sqlite3_column_int(statement, 1) == 0
        && sqlite3_column_type(statement, 2) == SQLITE_NULL)
      : (rejected
        ? ([state isEqualToString:@"REJECTED"]
          && sqlite3_column_int(statement, 1) == 1
          && [stored isEqualToData:frame])
        : ([state isEqualToString:@"READY"]
          && sqlite3_column_int(statement, 1) == 1
          && [stored isEqualToData:frame]));
    valid = valid && sqlite3_step(statement) == SQLITE_DONE;
  }
  sqlite3_finalize(statement);
  sqlite3_close_v2(database);
  if ([self.mode isEqualToString:@"drop_ready_output"]) {
    // This test-only fault occurs after READY and its response frame are durable.
    // Never simulate output loss unless the persisted frame was verified above.
    if (!valid) _exit(34);
    return NO;
  }
  return valid;
}

- (BOOL)copyEpochSeconds:(uint64_t *)epochSeconds {
  self.clockCalls += 1U;
  if ([self.mode isEqualToString:@"replay"]) return NO;
  *epochSeconds = ([self.mode isEqualToString:@"post_expired"]
      && self.clockCalls == 3U) ? 2000000500U : 2000000000U;
  return YES;
}

- (id)createAuthenticationContext {
  self.contextCalls += 1U;
  return [self.mode isEqualToString:@"unavailable"] ? nil : [[NSObject alloc] init];
}

- (PAApprovalAvailability)approvalAvailabilityForContext:(id)context {
  (void)context;
  return PAApprovalAvailabilityAvailable;
}

- (PAOperatorDisplayOutcome)displayCommittedOperation:(NSString *)displayText {
  self.displayCalls += 1U;
  NSData *display = [displayText dataUsingEncoding:NSUTF8StringEncoding];
  if (![self committedState:@"RESERVED" approvalStarted:1 field:@"display" value:display]) {
    _exit(30);
  }
  if ([self.mode isEqualToString:@"interrupt_display"]) _exit(23);
  if ([self.mode isEqualToString:@"slow_grant"]) {
    // FD 3 is a test-only rendezvous: the approval latch stays committed until
    // the parent has observed it and started the competing process.
    char signal = 'L';
    ssize_t count;
    do { count = write(3, &signal, 1U); } while (count < 0 && errno == EINTR);
    if (count != 1) _exit(33);
    struct pollfd release = { .fd = 3, .events = POLLIN, .revents = 0 };
    int ready;
    do { ready = poll(&release, 1U, 30000); } while (ready < 0 && errno == EINTR);
    if (ready != 1 || (release.revents & POLLIN) == 0) _exit(33);
    do { count = read(3, &signal, 1U); } while (count < 0 && errno == EINTR);
    if (count != 1 || signal != 'R') _exit(33);
  }
  return [self.mode isEqualToString:@"deny"]
    ? PAOperatorDisplayOutcomeCancelled : PAOperatorDisplayOutcomeContinued;
}

- (PAAuthenticationOutcome)authenticateContext:(id)context {
  (void)context;
  self.authenticationCalls += 1U;
  return PAAuthenticationOutcomeApproved;
}

- (NSMutableData *)copyCredentialForService:(NSString *)service
                                    account:(NSString *)account
                                    context:(id)context {
  (void)service;
  (void)account;
  (void)context;
  _exit(31);
}

- (void)invalidateAuthenticationContext:(id)context { (void)context; }

- (NSData *)signFrozenMessage:(NSData *)message
          operationIdentifier:(NSString *)operationIdentifier {
  (void)operationIdentifier;
  self.signCalls += 1U;
  if (![self committedState:@"SIGN_ATTEMPTED" approvalStarted:1
                     field:@"signing" value:message]) _exit(32);
  if ([self.mode isEqualToString:@"interrupt_sign"]) _exit(24);
  if ([self.mode isEqualToString:@"fail_sign"]) return nil;
  uint8_t synthetic[64];
  memset(synthetic, 0xa5, sizeof(synthetic));
  return [NSData dataWithBytes:synthetic length:sizeof(synthetic)];
}

@end
