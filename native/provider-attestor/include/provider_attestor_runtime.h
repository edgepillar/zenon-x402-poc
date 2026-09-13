#import "provider_attestor.h"

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, PAApprovalAvailability) {
  PAApprovalAvailabilityUnavailable = 0,
  PAApprovalAvailabilityAvailable = 1,
  PAApprovalAvailabilityAmbiguous = 2,
};

typedef NS_ENUM(NSInteger, PAOperatorDisplayOutcome) {
  PAOperatorDisplayOutcomeCancelled = 0,
  PAOperatorDisplayOutcomeContinued = 1,
  PAOperatorDisplayOutcomeAmbiguous = 2,
};

typedef NS_ENUM(NSInteger, PAAuthenticationOutcome) {
  PAAuthenticationOutcomeDenied = 0,
  PAAuthenticationOutcomeApproved = 1,
  PAAuthenticationOutcomeAmbiguous = 2,
};

@protocol PAPlatformAdapter <NSObject>

- (BOOL)copyEpochSeconds:(uint64_t *)epochSeconds;
- (nullable id)createAuthenticationContext;
- (PAApprovalAvailability)approvalAvailabilityForContext:(id)context;
- (PAOperatorDisplayOutcome)displayCommittedOperation:(NSString *)displayText;
- (PAAuthenticationOutcome)authenticateContext:(id)context;
- (nullable NSMutableData *)copyCredentialForService:(NSString *)service
                                              account:(NSString *)account
                                              context:(id)context;
- (void)invalidateAuthenticationContext:(id)context;

@end

FOUNDATION_EXPORT NSString * _Nullable PAEffectiveUserApplicationSupportRoot(
  NSError **error
);

#if defined(PA_RELEASE_BUILD)
FOUNDATION_EXPORT int PARunProviderAttestorChild(void);
#endif

#if defined(PA_TESTING)
typedef BOOL (^PATestResponseEmitter)(NSData *responseFrame);
@protocol PATestSigner <NSObject>
- (nullable NSData *)signFrozenMessage:(NSData *)message
                  operationIdentifier:(NSString *)operationIdentifier;
@end
FOUNDATION_EXPORT int PATestExecuteProviderAttestorFrame(
  NSData *requestFrame,
  NSString *applicationSupportRoot,
  id<PAPlatformAdapter> platform,
  id<PATestSigner> _Nullable testSigner,
  PATestResponseEmitter emitter
);
#endif

NS_ASSUME_NONNULL_END
