#import "provider_attestor_runtime.h"

NS_ASSUME_NONNULL_BEGIN

// The deployable child constructs this concrete system adapter internally.
// There is no runtime selector for a substitute approval implementation.
FOUNDATION_EXPORT id<PAPlatformAdapter> PAProductionPlatformAdapter(void);

@protocol PAMacOSApprovalContext <NSObject>
- (BOOL)canEvaluateDeviceOwnerAuthentication;
- (void)evaluateDeviceOwnerAuthenticationWithReply:
  (void (^)(BOOL success, NSError * _Nullable error))reply;
- (void)setAuthenticationReuseDuration:(NSTimeInterval)duration;
- (void)invalidate;
@end

@protocol PAMacOSApprovalSystem <NSObject>
- (nullable id<PAMacOSApprovalContext>)newContext;
- (BOOL)copyEpochSeconds:(uint64_t *)epochSeconds;
- (PAOperatorDisplayOutcome)displayCommittedOperation:(NSString *)displayText;
- (nullable NSMutableData *)copyCredentialForService:(NSString *)service
                                              account:(NSString *)account
                                              context:(id<PAMacOSApprovalContext>)context;
@end

#if defined(PA_MACOS_APPROVAL_TESTING) && !defined(PA_RELEASE_BUILD)
// Exists only in the isolated unit-test binary; excluded from release builds.
FOUNDATION_EXPORT id<PAPlatformAdapter> PATestMacOSApprovalAdapter(
  id<PAMacOSApprovalSystem> system,
  uint64_t timeoutNanoseconds
);
FOUNDATION_EXPORT BOOL PATestKeychainAttributesEligible(
  NSDictionary<NSString *, id> *attributes,
  NSString *service,
  NSString *account
);
#endif

NS_ASSUME_NONNULL_END
