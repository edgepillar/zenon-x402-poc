#import "provider_attestor_runtime.h"

#import <Foundation/Foundation.h>
#include <stdint.h>

#if !defined(PA_TESTING) || !defined(PA_DISPOSABLE_TOKEN_SIGNING_TEST) \
  || !defined(PA_SIGNER_PROFILE_TESTING) || defined(PA_RELEASE_BUILD)
#error Disposable token signing is test/development-only
#endif

@protocol PADisposablePINProvider <NSObject>
- (BOOL)copyOneShotPIN:(uint8_t [16])pin
   operationIdentifier:(NSString *)operationIdentifier;
@end

@interface PADisposableSigner : NSObject <PATestSigner>
- (instancetype)initWithModulePath:(NSString *)modulePath
                     moduleDigest:(NSString *)moduleDigest
                      tokenSerial:(NSString *)tokenSerial
                 objectIdentifier:(NSData *)objectIdentifier
                        publicKey:(NSData *)publicKey
               tokenConfiguration:(NSString *)tokenConfiguration
                      pinProvider:(id<PADisposablePINProvider>)pinProvider;
#if defined(PA_DISPOSABLE_SIGNER_TEST_FAULTS)
@property(nonatomic) BOOL failSignForTesting;
@property(nonatomic) BOOL corruptSignatureForTesting;
#endif
@end
