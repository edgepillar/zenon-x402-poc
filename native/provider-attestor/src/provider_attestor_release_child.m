#import "provider_attestor_runtime.h"

#if !defined(PA_RELEASE_BUILD) || defined(PA_TESTING) || defined(PA_MACOS_APPROVAL_TESTING)
#error The production entrypoint is release-only and has no test adapter selection
#endif
#if defined(PA_SYNTHETIC_CHILD_TESTING) || defined(PA_TEST_AUTHORITY_RECORD) \
  || defined(PA_TEST_AUTHORITY_RECORD_DIGEST)
#error Synthetic authority pins cannot enter the production entrypoint
#endif

int main(int argc, const char *argv[]) {
  (void)argv;
  @autoreleasepool {
    return argc == 1 ? PARunProviderAttestorChild() : 2;
  }
}
