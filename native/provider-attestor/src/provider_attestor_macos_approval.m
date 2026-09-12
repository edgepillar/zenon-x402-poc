#import "provider_attestor_macos_approval.h"

#import <AppKit/AppKit.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <Security/Security.h>
#include <dispatch/dispatch.h>
#include <time.h>

#if defined(PA_MACOS_APPROVAL_TESTING) && defined(PA_RELEASE_BUILD)
#error Approval test injection must never be compiled into a release child
#endif

static const uint64_t PAAuthenticationTimeoutNanoseconds = 45ULL * NSEC_PER_SEC;

static void PAWipeCredential(NSMutableData *credential) {
  if (credential == nil) return;
  volatile uint8_t *bytes = credential.mutableBytes;
  for (NSUInteger index = 0U; index < credential.length; index += 1U) bytes[index] = 0U;
  credential.length = 0U;
}

static BOOL PAKeychainAttributesEligible(
  NSDictionary<NSString *, id> *attributes,
  NSString *service,
  NSString *account
) {
  if (![attributes isKindOfClass:[NSDictionary class]]) return NO;
  id synchronization = attributes[(__bridge id)kSecAttrSynchronizable];
  NSData *secret = attributes[(__bridge id)kSecValueData];
  return [attributes[(__bridge id)kSecAttrService] isEqualToString:service]
    && [attributes[(__bridge id)kSecAttrAccount] isEqualToString:account]
    && [attributes[(__bridge id)kSecAttrAccessible]
      isEqual:(__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
    && [synchronization isKindOfClass:[NSNumber class]]
    && CFGetTypeID((__bridge CFTypeRef)synchronization) == CFBooleanGetTypeID()
    && !CFBooleanGetValue((__bridge CFBooleanRef)synchronization)
    && [secret isKindOfClass:[NSData class]]
    && secret.length >= 1U && secret.length <= 255U;
}

@interface PAAppleAuthenticationContext : NSObject <PAMacOSApprovalContext>
@property(nonatomic) LAContext *context;
@end

@implementation PAAppleAuthenticationContext

- (instancetype)init {
  self = [super init];
  if (self != nil) _context = [[LAContext alloc] init];
  return self;
}

- (BOOL)canEvaluateDeviceOwnerAuthentication {
  return [self.context canEvaluatePolicy:LAPolicyDeviceOwnerAuthentication error:NULL];
}

- (void)evaluateDeviceOwnerAuthenticationWithReply:
  (void (^)(BOOL success, NSError * _Nullable error))reply {
  [self.context evaluatePolicy:LAPolicyDeviceOwnerAuthentication
               localizedReason:@"authorize this frozen development/testnet attestation"
                         reply:reply];
}

- (void)setAuthenticationReuseDuration:(NSTimeInterval)duration {
  self.context.touchIDAuthenticationAllowableReuseDuration = duration;
}

- (void)invalidate { [self.context invalidate]; }

@end

@interface PAAppleApprovalSystem : NSObject <PAMacOSApprovalSystem>
@end

@implementation PAAppleApprovalSystem

- (id<PAMacOSApprovalContext>)newContext {
  return [[PAAppleAuthenticationContext alloc] init];
}

- (BOOL)copyEpochSeconds:(uint64_t *)epochSeconds {
  if (epochSeconds == NULL) return NO;
  struct timespec now;
  if (clock_gettime(CLOCK_REALTIME, &now) != 0 || now.tv_sec < 0
      || (uint64_t)now.tv_sec > 9007199254740991ULL) return NO;
  *epochSeconds = (uint64_t)now.tv_sec;
  return YES;
}

- (PAOperatorDisplayOutcome)displayCommittedOperation:(NSString *)displayText {
  if (![NSThread isMainThread] || displayText.length == 0U) {
    return PAOperatorDisplayOutcomeAmbiguous;
  }
  @try {
    // The complete frozen canonical request and times live in a selectable,
    // vertically scrollable text view. Alert informativeText is not used for
    // effectful data because AppKit may shorten it to fit a dialog.
    NSTextView *details = [[NSTextView alloc] initWithFrame:NSMakeRect(0, 0, 760, 440)];
    details.string = displayText;
    details.editable = NO;
    details.selectable = YES;
    details.richText = NO;
    details.verticallyResizable = YES;
    details.horizontallyResizable = NO;
    details.textContainer.widthTracksTextView = YES;
    details.textContainer.containerSize = NSMakeSize(760, CGFLOAT_MAX);
    details.minSize = NSMakeSize(760, 440);
    details.maxSize = NSMakeSize(760, CGFLOAT_MAX);
    NSScrollView *scroll = [[NSScrollView alloc] initWithFrame:NSMakeRect(0, 0, 780, 460)];
    scroll.hasVerticalScroller = YES;
    scroll.hasHorizontalScroller = NO;
    scroll.documentView = details;
    NSAlert *alert = [[NSAlert alloc] init];
    alert.alertStyle = NSAlertStyleWarning;
    alert.messageText = @"DEVELOPMENT/TESTNET SOFTWARE ATTESTOR";
    alert.informativeText = @"Review every field below before continuing. The subsequent system prompt is not cryptographically bound to this display.";
    alert.accessoryView = scroll;
    [alert addButtonWithTitle:@"Continue to system authentication"];
    [alert addButtonWithTitle:@"Cancel"];
    NSModalResponse response = [alert runModal];
    if (response == NSAlertFirstButtonReturn) return PAOperatorDisplayOutcomeContinued;
    if (response == NSAlertSecondButtonReturn) return PAOperatorDisplayOutcomeCancelled;
  } @catch (__unused NSException *exception) {
    return PAOperatorDisplayOutcomeAmbiguous;
  }
  return PAOperatorDisplayOutcomeAmbiguous;
}

- (NSMutableData *)copyCredentialForService:(NSString *)service
                                    account:(NSString *)account
                                    context:(id<PAMacOSApprovalContext>)context {
  if (![context isKindOfClass:[PAAppleAuthenticationContext class]]
      || service.length == 0U || account.length == 0U) return nil;
  LAContext *laContext = ((PAAppleAuthenticationContext *)context).context;
  // Never allow a second, unreviewed Keychain UI. The authenticated context
  // is reused solely for this one lookup; a missing item fails closed.
  laContext.interactionNotAllowed = YES;
  NSDictionary *query = @{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: service,
    (__bridge id)kSecAttrAccount: account,
    (__bridge id)kSecAttrSynchronizable: @NO,
    (__bridge id)kSecAttrAccessible: (__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    (__bridge id)kSecUseDataProtectionKeychain: @YES,
    (__bridge id)kSecUseAuthenticationContext: laContext,
    (__bridge id)kSecMatchLimit: (__bridge id)kSecMatchLimitOne,
    (__bridge id)kSecReturnAttributes: @YES,
    (__bridge id)kSecReturnData: @YES,
  };
  CFTypeRef result = NULL;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
  if (status != errSecSuccess || result == NULL) {
    if (result != NULL) CFRelease(result);
    return nil;
  }
  NSDictionary *attributes = CFGetTypeID(result) == CFDictionaryGetTypeID()
    ? (__bridge NSDictionary *)result : nil;
  NSData *secret = attributes[(__bridge id)kSecValueData];
  // The selector is pinned by the exact generation-configuration digest. The
  // returned attributes must independently confirm this device-only class;
  // absent attributes or legacy Keychain items are rejected. Provisioning
  // and migration are deliberately outside this slice.
  BOOL valid = PAKeychainAttributesEligible(attributes, service, account);
  NSMutableData *owned = valid ? [NSMutableData dataWithData:secret] : nil;
  CFRelease(result);
  return owned;
}

@end

@interface PAOperationApprovalContext : NSObject
@property(nonatomic) id<PAMacOSApprovalContext> driver;
@property(nonatomic) id owner;
@property(nonatomic) BOOL approved;
@property(nonatomic) BOOL invalidated;
@end
@implementation PAOperationApprovalContext
@end

@interface PAMacOSApprovalAdapter : NSObject <PAPlatformAdapter>
@property(nonatomic) id<PAMacOSApprovalSystem> system;
@property(nonatomic) uint64_t timeoutNanoseconds;
@end

@implementation PAMacOSApprovalAdapter

- (BOOL)copyEpochSeconds:(uint64_t *)epochSeconds {
  return [self.system copyEpochSeconds:epochSeconds];
}

- (id)createAuthenticationContext {
  id<PAMacOSApprovalContext> driver = [self.system newContext];
  if (driver == nil) return nil;
  @try {
    [driver setAuthenticationReuseDuration:0.0];
  } @catch (__unused NSException *exception) {
    [driver invalidate];
    return nil;
  }
  PAOperationApprovalContext *context = [[PAOperationApprovalContext alloc] init];
  context.driver = driver;
  context.owner = self;
  return context;
}

- (PAApprovalAvailability)approvalAvailabilityForContext:(id)candidate {
  if (![candidate isKindOfClass:[PAOperationApprovalContext class]]) {
    return PAApprovalAvailabilityAmbiguous;
  }
  PAOperationApprovalContext *context = candidate;
  if (context.owner != self || context.invalidated) return PAApprovalAvailabilityAmbiguous;
  @try {
    return [context.driver canEvaluateDeviceOwnerAuthentication]
      ? PAApprovalAvailabilityAvailable : PAApprovalAvailabilityUnavailable;
  } @catch (__unused NSException *exception) {
    return PAApprovalAvailabilityAmbiguous;
  }
}

- (PAOperatorDisplayOutcome)displayCommittedOperation:(NSString *)displayText {
  @try {
    return [self.system displayCommittedOperation:displayText];
  } @catch (__unused NSException *exception) {
    return PAOperatorDisplayOutcomeAmbiguous;
  }
}

- (PAAuthenticationOutcome)authenticateContext:(id)candidate {
  if (![candidate isKindOfClass:[PAOperationApprovalContext class]]) {
    return PAAuthenticationOutcomeAmbiguous;
  }
  PAOperationApprovalContext *context = candidate;
  if (context.owner != self || context.invalidated || context.approved
      || self.timeoutNanoseconds == 0U || self.timeoutNanoseconds > INT64_MAX) {
    return PAAuthenticationOutcomeAmbiguous;
  }
  NSObject *callbackState = [[NSObject alloc] init];
  dispatch_semaphore_t completion = dispatch_semaphore_create(0);
  __block BOOL callbackSeen = NO;
  __block BOOL finished = NO;
  __block PAAuthenticationOutcome outcome = PAAuthenticationOutcomeAmbiguous;
  @try {
    [context.driver evaluateDeviceOwnerAuthenticationWithReply:
      ^(BOOL success, NSError *error) {
        @synchronized (callbackState) {
          if (finished || callbackSeen) return;
          callbackSeen = YES;
          if (success && error == nil) outcome = PAAuthenticationOutcomeApproved;
          else if (!success && [error.domain isEqualToString:LAErrorDomain]
                   && (error.code == LAErrorUserCancel
                       || error.code == LAErrorAuthenticationFailed
                       || error.code == LAErrorUserFallback)) {
            outcome = PAAuthenticationOutcomeDenied;
          }
          dispatch_semaphore_signal(completion);
        }
      }];
  } @catch (__unused NSException *exception) {
    [self invalidateAuthenticationContext:context];
    return PAAuthenticationOutcomeAmbiguous;
  }
  long waited = dispatch_semaphore_wait(completion,
    dispatch_time(DISPATCH_TIME_NOW, (int64_t)self.timeoutNanoseconds));
  @synchronized (callbackState) {
    finished = YES;
    if (waited != 0) outcome = PAAuthenticationOutcomeAmbiguous;
  }
  if (outcome == PAAuthenticationOutcomeApproved) context.approved = YES;
  else [self invalidateAuthenticationContext:context];
  return outcome;
}

- (NSMutableData *)copyCredentialForService:(NSString *)service
                                    account:(NSString *)account
                                    context:(id)candidate {
  if (![candidate isKindOfClass:[PAOperationApprovalContext class]]) return nil;
  PAOperationApprovalContext *context = candidate;
  if (context.owner != self || context.invalidated || !context.approved) return nil;
  context.approved = NO; // At most one lookup per freshly approved context.
  NSMutableData *credential = nil;
  @try {
    credential = [self.system copyCredentialForService:service
                                              account:account
                                              context:context.driver];
  } @catch (__unused NSException *exception) {
    [self invalidateAuthenticationContext:context];
    return nil;
  }
  if (credential != nil && (credential.length < 1U || credential.length > 255U)) {
    PAWipeCredential(credential);
    credential = nil;
  }
  [self invalidateAuthenticationContext:context];
  return credential;
}

- (void)invalidateAuthenticationContext:(id)candidate {
  if (![candidate isKindOfClass:[PAOperationApprovalContext class]]) return;
  PAOperationApprovalContext *context = candidate;
  if (context.owner != self || context.invalidated) return;
  context.approved = NO;
  context.invalidated = YES;
  [context.driver invalidate];
}

@end

id<PAPlatformAdapter> PAProductionPlatformAdapter(void) {
  PAMacOSApprovalAdapter *adapter = [[PAMacOSApprovalAdapter alloc] init];
  adapter.system = [[PAAppleApprovalSystem alloc] init];
  adapter.timeoutNanoseconds = PAAuthenticationTimeoutNanoseconds;
  return adapter;
}

#if defined(PA_MACOS_APPROVAL_TESTING) && !defined(PA_RELEASE_BUILD)
BOOL PATestKeychainAttributesEligible(
  NSDictionary<NSString *, id> *attributes,
  NSString *service,
  NSString *account
) {
  return PAKeychainAttributesEligible(attributes, service, account);
}

id<PAPlatformAdapter> PATestMacOSApprovalAdapter(
  id<PAMacOSApprovalSystem> system,
  uint64_t timeoutNanoseconds
) {
  PAMacOSApprovalAdapter *adapter = [[PAMacOSApprovalAdapter alloc] init];
  adapter.system = system;
  adapter.timeoutNanoseconds = timeoutNanoseconds;
  return adapter;
}
#endif
