#import "provider_attestor_macos_approval.h"

#import <LocalAuthentication/LocalAuthentication.h>
#import <Security/Security.h>
#include <stdio.h>

static unsigned int PACheckCount = 0U;

static void PACheck(BOOL passed) {
  PACheckCount += 1U;
  if (!passed) {
    fputs("macOS approval mock check failed\n", stderr);
    _Exit(1);
  }
}

@interface PAFakeApprovalContext : NSObject <PAMacOSApprovalContext>
@property(nonatomic) BOOL available;
@property(nonatomic) NSInteger errorCode;
@property(nonatomic) BOOL suspendCallback;
@property(nonatomic) BOOL duplicateCallback;
@property(nonatomic) NSUInteger preflightCalls;
@property(nonatomic) NSUInteger evaluationCalls;
@property(nonatomic) NSUInteger invalidationCalls;
@property(nonatomic) NSTimeInterval reuseDuration;
@property(nonatomic, copy) void (^lateReply)(BOOL, NSError * _Nullable);
@end

@implementation PAFakeApprovalContext

- (BOOL)canEvaluateDeviceOwnerAuthentication {
  self.preflightCalls += 1U;
  return self.available;
}

- (void)setAuthenticationReuseDuration:(NSTimeInterval)duration {
  self.reuseDuration = duration;
}

- (void)evaluateDeviceOwnerAuthenticationWithReply:
  (void (^)(BOOL, NSError * _Nullable))reply {
  self.evaluationCalls += 1U;
  if (self.suspendCallback) {
    self.lateReply = reply;
    return;
  }
  NSError *error = self.errorCode == 0 ? nil
    : [NSError errorWithDomain:LAErrorDomain code:self.errorCode userInfo:@{}];
  reply(self.errorCode == 0, error);
  if (self.duplicateCallback) {
    reply(NO, [NSError errorWithDomain:LAErrorDomain
                                 code:LAErrorAuthenticationFailed userInfo:@{}]);
  }
}

- (void)invalidate { self.invalidationCalls += 1U; }

@end

@interface PAFakeApprovalSystem : NSObject <PAMacOSApprovalSystem>
@property(nonatomic) BOOL available;
@property(nonatomic) NSInteger errorCode;
@property(nonatomic) BOOL suspendCallback;
@property(nonatomic) BOOL duplicateCallback;
@property(nonatomic) PAOperatorDisplayOutcome displayResult;
@property(nonatomic) BOOL failCredential;
@property(nonatomic) NSUInteger contextCalls;
@property(nonatomic) NSUInteger displayCalls;
@property(nonatomic) NSUInteger keychainCalls;
@property(nonatomic) NSUInteger clockCalls;
@property(nonatomic) uint64_t now;
@property(nonatomic) PAFakeApprovalContext *lastContext;
@property(nonatomic) id<PAMacOSApprovalContext> keychainContext;
@property(nonatomic) NSString *lastDisplay;
@end

@implementation PAFakeApprovalSystem

- (id<PAMacOSApprovalContext>)newContext {
  self.contextCalls += 1U;
  PAFakeApprovalContext *context = [[PAFakeApprovalContext alloc] init];
  context.available = self.available;
  context.errorCode = self.errorCode;
  context.suspendCallback = self.suspendCallback;
  context.duplicateCallback = self.duplicateCallback;
  self.lastContext = context;
  return context;
}

- (BOOL)copyEpochSeconds:(uint64_t *)epochSeconds {
  self.clockCalls += 1U;
  *epochSeconds = self.now;
  return YES;
}

- (PAOperatorDisplayOutcome)displayCommittedOperation:(NSString *)displayText {
  self.displayCalls += 1U;
  self.lastDisplay = displayText;
  return self.displayResult;
}

- (NSMutableData *)copyCredentialForService:(NSString *)service
                                    account:(NSString *)account
                                    context:(id<PAMacOSApprovalContext>)context {
  PACheck([service isEqualToString:@"fixed.service"]);
  PACheck([account isEqualToString:@"fixed.account"]);
  self.keychainCalls += 1U;
  self.keychainContext = context;
  if (self.failCredential) return nil;
  static const uint8_t syntheticCredential[] = { 0x50, 0x41, 0x2d, 0x54, 0x45, 0x53, 0x54 };
  return [NSMutableData dataWithBytes:syntheticCredential
                              length:sizeof(syntheticCredential)];
}

@end

static PAFakeApprovalSystem *PANewSystem(void) {
  PAFakeApprovalSystem *system = [[PAFakeApprovalSystem alloc] init];
  system.available = YES;
  system.displayResult = PAOperatorDisplayOutcomeContinued;
  system.now = 2000000000ULL;
  return system;
}

static void PATestUnavailable(void) {
  PAFakeApprovalSystem *system = PANewSystem();
  system.available = NO;
  id<PAPlatformAdapter> adapter = PATestMacOSApprovalAdapter(system, 1000000U);
  id context = [adapter createAuthenticationContext];
  PACheck(context != nil);
  PACheck([adapter approvalAvailabilityForContext:context] == PAApprovalAvailabilityUnavailable);
  [adapter invalidateAuthenticationContext:context];
  PACheck(system.lastContext.preflightCalls == 1U);
  PACheck(system.lastContext.evaluationCalls == 0U);
  PACheck(system.lastContext.invalidationCalls == 1U);
  PACheck(system.displayCalls == 0U && system.keychainCalls == 0U);
}

static void PATestDisplayCancellation(void) {
  PAFakeApprovalSystem *system = PANewSystem();
  system.displayResult = PAOperatorDisplayOutcomeCancelled;
  id<PAPlatformAdapter> adapter = PATestMacOSApprovalAdapter(system, 1000000U);
  id context = [adapter createAuthenticationContext];
  PACheck([adapter approvalAvailabilityForContext:context] == PAApprovalAvailabilityAvailable);
  NSString *frozen = @"DEVELOPMENT/TESTNET SOFTWARE ATTESTOR\nissuedAt=1\nvalidUntil=2\ncomplete effectful field";
  PACheck([adapter displayCommittedOperation:frozen] == PAOperatorDisplayOutcomeCancelled);
  PACheck([system.lastDisplay isEqualToString:frozen]);
  [adapter invalidateAuthenticationContext:context];
  PACheck(system.lastContext.evaluationCalls == 0U && system.keychainCalls == 0U);
  PACheck(system.lastContext.invalidationCalls == 1U);
}

static void PATestDenial(NSInteger errorCode) {
  PAFakeApprovalSystem *system = PANewSystem();
  system.errorCode = errorCode;
  id<PAPlatformAdapter> adapter = PATestMacOSApprovalAdapter(system, 1000000U);
  id context = [adapter createAuthenticationContext];
  PACheck([adapter approvalAvailabilityForContext:context] == PAApprovalAvailabilityAvailable);
  PACheck([adapter authenticateContext:context] == PAAuthenticationOutcomeDenied);
  PACheck([adapter copyCredentialForService:@"fixed.service" account:@"fixed.account"
                                   context:context] == nil);
  [adapter invalidateAuthenticationContext:context];
  PACheck(system.lastContext.invalidationCalls == 1U);
  PACheck(system.keychainCalls == 0U);
}

static void PATestAmbiguousInterruption(void) {
  PAFakeApprovalSystem *system = PANewSystem();
  system.errorCode = LAErrorSystemCancel;
  id<PAPlatformAdapter> adapter = PATestMacOSApprovalAdapter(system, 1000000U);
  id context = [adapter createAuthenticationContext];
  PACheck([adapter authenticateContext:context] == PAAuthenticationOutcomeAmbiguous);
  PACheck(system.lastContext.invalidationCalls == 1U && system.keychainCalls == 0U);
}

static void PATestTimeoutAndLateReply(void) {
  PAFakeApprovalSystem *system = PANewSystem();
  system.suspendCallback = YES;
  id<PAPlatformAdapter> adapter = PATestMacOSApprovalAdapter(system, 1000000U);
  id context = [adapter createAuthenticationContext];
  PACheck([adapter authenticateContext:context] == PAAuthenticationOutcomeAmbiguous);
  PACheck(system.lastContext.invalidationCalls == 1U);
  PACheck(system.lastContext.lateReply != nil);
  system.lastContext.lateReply(YES, nil);
  PACheck([adapter copyCredentialForService:@"fixed.service" account:@"fixed.account"
                                   context:context] == nil);
  PACheck(system.keychainCalls == 0U);
}

static void PATestFreshNoReplayAndKeychainFailure(void) {
  PAFakeApprovalSystem *system = PANewSystem();
  system.duplicateCallback = YES;
  id<PAPlatformAdapter> adapter = PATestMacOSApprovalAdapter(system, 1000000U);
  id first = [adapter createAuthenticationContext];
  PAFakeApprovalContext *firstDriver = system.lastContext;
  PACheck(firstDriver.reuseDuration == 0.0);
  PACheck([adapter copyCredentialForService:@"fixed.service" account:@"fixed.account"
                                   context:first] == nil);
  PACheck(system.keychainCalls == 0U);
  PACheck([adapter authenticateContext:first] == PAAuthenticationOutcomeApproved);
  PACheck(firstDriver.evaluationCalls == 1U);
  NSMutableData *credential = [adapter copyCredentialForService:@"fixed.service"
                                                       account:@"fixed.account" context:first];
  PACheck(credential.length == 7U && system.keychainContext == firstDriver);
  PACheck([adapter copyCredentialForService:@"fixed.service" account:@"fixed.account"
                                   context:first] == nil);
  PACheck(system.keychainCalls == 1U);
  volatile uint8_t *bytes = credential.mutableBytes;
  for (NSUInteger index = 0U; index < credential.length; index += 1U) bytes[index] = 0U;
  credential.length = 0U;
  [adapter invalidateAuthenticationContext:first];
  PACheck(firstDriver.invalidationCalls == 1U);
  id second = [adapter createAuthenticationContext];
  PACheck(system.contextCalls == 2U && system.lastContext != firstDriver);
  PACheck(system.lastContext.reuseDuration == 0.0);
  PACheck([adapter copyCredentialForService:@"fixed.service" account:@"fixed.account"
                                   context:second] == nil);
  system.failCredential = YES;
  PACheck([adapter authenticateContext:second] == PAAuthenticationOutcomeApproved);
  PACheck([adapter copyCredentialForService:@"fixed.service" account:@"fixed.account"
                                   context:second] == nil);
  PACheck(system.keychainCalls == 2U);
  [adapter invalidateAuthenticationContext:second];
  PACheck(system.lastContext.invalidationCalls == 1U);
}

static void PATestClock(void) {
  PAFakeApprovalSystem *system = PANewSystem();
  id<PAPlatformAdapter> adapter = PATestMacOSApprovalAdapter(system, 1000000U);
  uint64_t now = 0U;
  PACheck([adapter copyEpochSeconds:&now] && now == 2000000000ULL);
  system.now = 2000000500ULL;
  PACheck([adapter copyEpochSeconds:&now] && now == 2000000500ULL);
  PACheck(system.clockCalls == 2U);
}

static void PATestKeychainMetadata(void) {
  static const uint8_t syntheticCredential[] = { 0x51 };
  NSMutableDictionary<NSString *, id> *attributes = [@{
    (__bridge id)kSecAttrService: @"fixed.service",
    (__bridge id)kSecAttrAccount: @"fixed.account",
    (__bridge id)kSecAttrAccessible: (__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    (__bridge id)kSecAttrSynchronizable: @NO,
    (__bridge id)kSecValueData: [NSData dataWithBytes:syntheticCredential
                                              length:sizeof(syntheticCredential)],
  } mutableCopy];
  PACheck(PATestKeychainAttributesEligible(attributes, @"fixed.service", @"fixed.account"));
  [attributes removeObjectForKey:(__bridge id)kSecAttrSynchronizable];
  PACheck(!PATestKeychainAttributesEligible(attributes, @"fixed.service", @"fixed.account"));
  attributes[(__bridge id)kSecAttrSynchronizable] = @"false";
  PACheck(!PATestKeychainAttributesEligible(attributes, @"fixed.service", @"fixed.account"));
  attributes[(__bridge id)kSecAttrSynchronizable] = @(0);
  PACheck(!PATestKeychainAttributesEligible(attributes, @"fixed.service", @"fixed.account"));
  attributes[(__bridge id)kSecAttrSynchronizable] = @YES;
  PACheck(!PATestKeychainAttributesEligible(attributes, @"fixed.service", @"fixed.account"));
  attributes[(__bridge id)kSecAttrSynchronizable] = @NO;
  PACheck(PATestKeychainAttributesEligible(attributes, @"fixed.service", @"fixed.account"));
}

int main(void) {
  @autoreleasepool {
    PATestUnavailable();
    PATestDisplayCancellation();
    PATestDenial(LAErrorUserCancel);
    PATestDenial(LAErrorAuthenticationFailed);
    PATestAmbiguousInterruption();
    PATestTimeoutAndLateReply();
    PATestFreshNoReplayAndKeychainFailure();
    PATestClock();
    PATestKeychainMetadata();
    printf("macOS approval mock PASS %u checks\n", PACheckCount);
    return 0;
  }
}
