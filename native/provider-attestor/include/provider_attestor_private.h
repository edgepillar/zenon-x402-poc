#import "provider_attestor_runtime.h"
#if defined(PA_SIGNER_PROFILE_TESTING) && !defined(PA_RELEASE_BUILD)
#import "pkcs11_minimal.h"
#endif

#import <Foundation/Foundation.h>
#include <sys/types.h>

NS_ASSUME_NONNULL_BEGIN

@interface PASignerSession : NSObject
@end

FOUNDATION_EXPORT BOOL PAValidatePinnedRegularFile(
  NSString *path,
  NSString *expectedDigest,
  uid_t effectiveUser,
  NSError **error
);

FOUNDATION_EXPORT PASignerSession * _Nullable PAPreflightSigner(
  NSDictionary<NSString *, id> *configuration,
  PAAuthority *authority,
  NSMutableData *credential,
  uid_t effectiveUser,
  NSError **error
);

FOUNDATION_EXPORT NSData * _Nullable PASignExactlyOnce(
  PASignerSession *session,
  NSData *message,
  NSError **error
);

FOUNDATION_EXPORT BOOL PAVerifyWithPinnedOpenSSL(
  NSDictionary<NSString *, id> *configuration,
  NSData *publicKey,
  NSData *message,
  NSData *signature,
  uid_t effectiveUser,
  NSError **error
);

FOUNDATION_EXPORT void PACloseSigner(PASignerSession * _Nullable session);
FOUNDATION_EXPORT void PAZeroMutableData(NSMutableData * _Nullable data);

#if defined(PA_SIGNER_LOADER_TESTING) && !defined(PA_RELEASE_BUILD)
// Only the isolated loader-policy test binary can inject a non-root owner and
// temporary image directory. Runtime and release builds have no such seam.
FOUNDATION_EXPORT BOOL PAValidatePinnedImageForTesting(
  NSString *path,
  NSString *expectedDigest,
  NSString *trustedDirectory,
  uid_t mockedRootOwner,
  void (^ _Nullable betweenChecks)(void)
);
#endif

#if defined(PA_SIGNER_PROFILE_TESTING) && !defined(PA_RELEASE_BUILD)
// Available only in a dedicated profile-test binary, not the runtime test or release.
FOUNDATION_EXPORT BOOL PAValidateSignerKeyProfileForTesting(
  CK_FUNCTION_LIST_PTR functions,
  CK_SESSION_HANDLE session,
  NSData *objectIdentifier,
  NSData *pinnedPublicKey
);
FOUNDATION_EXPORT BOOL PAPureEdDSAMechanismForTesting(const CK_MECHANISM *mechanism);
#endif

NS_ASSUME_NONNULL_END
