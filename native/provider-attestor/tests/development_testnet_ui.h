#import "disposable_token_signer.h"

#if !defined(PA_TESTING) || !defined(PA_DEVELOPMENT_TESTNET_CHILD) \
  || defined(PA_RELEASE_BUILD)
#error Development/testnet operator UI cannot enter a release build
#endif

FOUNDATION_EXPORT id<PAPlatformAdapter> PADevelopmentTestnetApprovalAdapter(void);
FOUNDATION_EXPORT id<PADisposablePINProvider> PADevelopmentTestnetPINProvider(void);
