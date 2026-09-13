#import "provider_attestor_runtime.h"

#if !defined(PA_TESTING)
#error Test grant adapter must not be compiled into a production target.
#endif

@interface PATestGrantAdapter : NSObject <PAPlatformAdapter, PATestSigner>

@property(nonatomic, readonly) NSUInteger clockCalls;
@property(nonatomic, readonly) NSUInteger contextCalls;
@property(nonatomic, readonly) NSUInteger displayCalls;
@property(nonatomic, readonly) NSUInteger authenticationCalls;
@property(nonatomic, readonly) NSUInteger signCalls;

- (instancetype)initWithMode:(NSString *)mode journalPath:(NSString *)journalPath;
- (BOOL)validateBeforeEmission:(NSData *)frame;

@end
