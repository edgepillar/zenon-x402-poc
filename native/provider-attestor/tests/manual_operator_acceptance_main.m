#import "provider_attestor_macos_approval.h"

#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <Security/Security.h>
#include <fcntl.h>
#include <string.h>
#include <unistd.h>

#if defined(PA_RELEASE_BUILD) || defined(PA_TESTING) || defined(PA_MACOS_APPROVAL_TESTING)
#error Manual operator acceptance is isolated from release and automated-test builds
#endif

#if !defined(PA_MANUAL_OPERATOR_ACCEPTANCE)
#error Manual operator acceptance requires its dedicated build target
#endif

// Fixed process statuses only; never surface framework errors or prompt details.
enum {
  PAManualExitPass = 0,
  PAManualExitFail = 1,
  PAManualExitUIActivation = 10,
  PAManualExitPolicyUnavailable = 11,
  PAManualExitPolicyAmbiguous = 12,
  PAManualExitDisplayCancelled = 13,
  PAManualExitDisplayAmbiguous = 14,
  PAManualExitAuthenticationDenied = 15,
  PAManualExitAuthenticationAmbiguous = 16,
};

typedef enum {
  PAUIActivationOther = 0,
  PAUIActivationWrongThread,
  PAUIActivationSharedAppNil,
  PAUIActivationPolicyRejected,
  PAUIActivationFinishLaunchingException,
  PAUIActivationInactiveTimeout,
} PAUIActivationSubstage;

// These literal diagnostics are emitted only by the no-TTY LA test bundle.
// Keep every framework error and all operator/prompt details suppressed.
static const char *PAFixedLAResult(int status, PAUIActivationSubstage uiSubstage) {
  switch (status) {
    case PAManualExitPass: return "PASS\nLA_STAGE=PASS\n";
    case PAManualExitUIActivation:
      switch (uiSubstage) {
        case PAUIActivationWrongThread:
          return "FAIL\nLA_STAGE=UI_ACTIVATION_FAILED\nUI_SUBSTAGE=MAIN_THREAD_REQUIRED\n";
        case PAUIActivationSharedAppNil:
          return "FAIL\nLA_STAGE=UI_ACTIVATION_FAILED\nUI_SUBSTAGE=SHARED_APP_NIL\n";
        case PAUIActivationPolicyRejected:
          return "FAIL\nLA_STAGE=UI_ACTIVATION_FAILED\nUI_SUBSTAGE=ACTIVATION_POLICY_REJECTED\n";
        case PAUIActivationFinishLaunchingException:
          return "FAIL\nLA_STAGE=UI_ACTIVATION_FAILED\nUI_SUBSTAGE=FINISH_LAUNCHING_EXCEPTION\n";
        case PAUIActivationInactiveTimeout:
          return "FAIL\nLA_STAGE=UI_ACTIVATION_FAILED\nUI_SUBSTAGE=INACTIVE_TIMEOUT\n";
        default:
          return "FAIL\nLA_STAGE=UI_ACTIVATION_FAILED\nUI_SUBSTAGE=OTHER_UI_FAILURE\n";
      }
    case PAManualExitPolicyUnavailable: return "FAIL\nLA_STAGE=POLICY_UNAVAILABLE\n";
    case PAManualExitPolicyAmbiguous: return "FAIL\nLA_STAGE=POLICY_AMBIGUOUS\n";
    case PAManualExitDisplayCancelled: return "FAIL\nLA_STAGE=DISPLAY_CANCELLED\n";
    case PAManualExitDisplayAmbiguous: return "FAIL\nLA_STAGE=DISPLAY_AMBIGUOUS\n";
    case PAManualExitAuthenticationDenied: return "FAIL\nLA_STAGE=AUTHENTICATION_DENIED\n";
    case PAManualExitAuthenticationAmbiguous: return "FAIL\nLA_STAGE=AUTHENTICATION_AMBIGUOUS\n";
    default: return "FAIL\nLA_STAGE=INTERNAL_FAILURE\n";
  }
}

static void PAWipeBytes(void *memory, size_t length) {
  volatile uint8_t *bytes = memory;
  for (size_t index = 0U; index < length; index += 1U) bytes[index] = 0U;
}

static void PAWipeData(NSMutableData *data) {
  if (data == nil) return;
  PAWipeBytes(data.mutableBytes, data.length);
  data.length = 0U;
}

// Bound the real adapter's one NSAlert without changing the production source.
// An unanswered LaunchServices display must fail closed and close its window.
static PAOperatorDisplayOutcome PABoundedManualDisplay(
  id<PAPlatformAdapter> adapter,
  NSString *displayText
) {
  if (![NSThread isMainThread] || adapter == nil || displayText.length == 0U) {
    return PAOperatorDisplayOutcomeAmbiguous;
  }
  __block BOOL timedOut = NO;
  NSTimer *timeout = [NSTimer timerWithTimeInterval:30.0 repeats:NO
    block:^(__unused NSTimer *timer) {
      timedOut = YES;
      NSWindow *modalWindow = [NSApp modalWindow];
      if (modalWindow != nil) {
        [NSApp abortModal];
        [modalWindow orderOut:nil];
      }
    }];
  if (timeout == nil) return PAOperatorDisplayOutcomeAmbiguous;
  @try {
    // The production adapter's runModal enters NSModalPanelRunLoopMode.
    [[NSRunLoop mainRunLoop] addTimer:timeout forMode:NSModalPanelRunLoopMode];
    PAOperatorDisplayOutcome outcome = [adapter displayCommittedOperation:displayText];
    return timedOut ? PAOperatorDisplayOutcomeAmbiguous : outcome;
  } @catch (__unused NSException *exception) {
    return PAOperatorDisplayOutcomeAmbiguous;
  } @finally {
    [timeout invalidate];
  }
}

static BOOL PAActivateManualUI(PAUIActivationSubstage *substage) {
  if (substage == NULL) return NO;
  *substage = PAUIActivationOther;
  if (![NSThread isMainThread]) {
    *substage = PAUIActivationWrongThread;
    return NO;
  }
  @try {
    NSApplication *app = [NSApplication sharedApplication];
    if (app == nil) {
      *substage = PAUIActivationSharedAppNil;
      return NO;
    }
    NSApplicationActivationPolicy priorPolicy = [app activationPolicy];
    BOOL policySet = [app setActivationPolicy:NSApplicationActivationPolicyRegular];
    NSApplicationActivationPolicy currentPolicy = [app activationPolicy];
    // A redundant set may report failure in this GUI test bundle. Proceed
    // only if it was already Regular and remains Regular; a real transition
    // still requires a successful set and the later foreground-active gate.
    if (currentPolicy != NSApplicationActivationPolicyRegular
        || (!policySet && priorPolicy != NSApplicationActivationPolicyRegular)) {
      *substage = PAUIActivationPolicyRejected;
      return NO;
    }
    @try {
      [app finishLaunching];
    } @catch (__unused NSException *exception) {
      *substage = PAUIActivationFinishLaunchingException;
      return NO;
    }
    [app activateIgnoringOtherApps:YES];
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:3.0];
    while (!app.active && deadline.timeIntervalSinceNow > 0.0) {
      [[NSRunLoop mainRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
    }
    BOOL active = app.active;
    if (!active) *substage = PAUIActivationInactiveTimeout;
    return active;
  } @catch (__unused NSException *exception) {
    return NO;
  }
}

static NSDictionary *PAExactSelector(NSString *service, NSString *account) {
  return @{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: service,
    (__bridge id)kSecAttrAccount: account,
    (__bridge id)kSecAttrSynchronizable: @NO,
    (__bridge id)kSecUseDataProtectionKeychain: @YES,
  };
}

static BOOL PADeleteExactOwnedItem(NSData *persistentReference) {
  // A successful add without a usable reference leaves a recoverable test-only
  // orphan. The fixed selector alone is never authority to delete an item.
  if (persistentReference == nil || persistentReference.length == 0U) return NO;
  LAContext *cleanupContext = [[LAContext alloc] init];
  cleanupContext.touchIDAuthenticationAllowableReuseDuration = 0.0;
  cleanupContext.interactionNotAllowed = YES;
  NSDictionary *query = @{
    (__bridge id)kSecValuePersistentRef: persistentReference,
    (__bridge id)kSecUseDataProtectionKeychain: @YES,
    (__bridge id)kSecUseAuthenticationContext: cleanupContext,
  };
  OSStatus status = SecItemDelete((__bridge CFDictionaryRef)query);
  [cleanupContext invalidate];
  return status == errSecSuccess;
}

static BOOL PAUnauthenticatedReadDenied(NSData *persistentReference) {
  if (persistentReference == nil || persistentReference.length == 0U) return NO;
  LAContext *inspector = [[LAContext alloc] init];
  inspector.touchIDAuthenticationAllowableReuseDuration = 0.0;
  inspector.interactionNotAllowed = YES;
  NSDictionary *query = @{
    (__bridge id)kSecValuePersistentRef: persistentReference,
    (__bridge id)kSecUseDataProtectionKeychain: @YES,
    (__bridge id)kSecUseAuthenticationContext: inspector,
    (__bridge id)kSecMatchLimit: (__bridge id)kSecMatchLimitOne,
    (__bridge id)kSecReturnData: @YES,
  };
  CFTypeRef result = NULL;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
  [inspector invalidate];
  BOOL denied = status != errSecSuccess && result == NULL;
  if (result != NULL) CFRelease(result);
  return denied;
}

static BOOL PAAttributesMatch(
  NSDictionary *attributes,
  NSString *service,
  NSString *account,
  SecAccessControlRef expectedAccessControl
) {
  if (![attributes isKindOfClass:[NSDictionary class]]) return NO;
  id synchronization = attributes[(__bridge id)kSecAttrSynchronizable];
  id returnedAccessControl = attributes[(__bridge id)kSecAttrAccessControl];
  BOOL accessControlMatches = returnedAccessControl != nil
    && CFGetTypeID((__bridge CFTypeRef)returnedAccessControl)
      == SecAccessControlGetTypeID()
    && CFEqual((__bridge CFTypeRef)returnedAccessControl, expectedAccessControl);
  return [attributes[(__bridge id)kSecAttrService] isEqualToString:service]
    && [attributes[(__bridge id)kSecAttrAccount] isEqualToString:account]
    && [attributes[(__bridge id)kSecAttrAccessible]
      isEqual:(__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
    && [synchronization isKindOfClass:[NSNumber class]]
    && CFGetTypeID((__bridge CFTypeRef)synchronization) == CFBooleanGetTypeID()
    && !CFBooleanGetValue((__bridge CFBooleanRef)synchronization)
    && accessControlMatches;
}

static BOOL PAVerifyStoredAttributes(
  NSString *service,
  NSString *account,
  NSData *persistentReference,
  SecAccessControlRef expectedAccessControl
) {
  if (persistentReference == nil || persistentReference.length == 0U
      || expectedAccessControl == NULL) return NO;
  NSMutableDictionary *query = [@{
    (__bridge id)kSecValuePersistentRef: persistentReference,
    (__bridge id)kSecUseDataProtectionKeychain: @YES,
  } mutableCopy];
  query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
  query[(__bridge id)kSecReturnAttributes] = @YES;
  LAContext *inspector = [[LAContext alloc] init];
  inspector.touchIDAuthenticationAllowableReuseDuration = 0.0;
  inspector.interactionNotAllowed = YES;
  query[(__bridge id)kSecUseAuthenticationContext] = inspector;
  CFTypeRef result = NULL;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
  [inspector invalidate];
  if (status != errSecSuccess || result == NULL) {
    if (result != NULL) CFRelease(result);
    return NO;
  }
  NSDictionary *attributes = CFGetTypeID(result) == CFDictionaryGetTypeID()
    ? (__bridge NSDictionary *)result : nil;
  BOOL valid = PAAttributesMatch(attributes, service, account, expectedAccessControl);
  CFRelease(result);
  return valid;
}

static BOOL PARunManualAcceptance(int *failureCode) {
  id<PAPlatformAdapter> adapter = PAProductionPlatformAdapter();
  id context = [adapter createAuthenticationContext];
  if (context == nil) return NO;
  BOOL created = NO;
  BOOL passed = NO;
  NSString *service = @"org.zenon-x402.manual-operator-acceptance";
  NSString *account = @"one-use-test-item";
  NSMutableData *expected = nil;
  NSMutableData *observed = nil;
  NSData *persistentReference = nil;
  CFErrorRef accessControlError = NULL;
  SecAccessControlRef accessControl = NULL;
  uint8_t randomCredential[32U] = { 0U };
  @try {
    PAApprovalAvailability availability = [adapter approvalAvailabilityForContext:context];
    if (availability != PAApprovalAvailabilityAvailable) {
      *failureCode = availability == PAApprovalAvailabilityUnavailable
        ? PAManualExitPolicyUnavailable : PAManualExitPolicyAmbiguous;
      return NO;
    }
    if (SecRandomCopyBytes(kSecRandomDefault, sizeof(randomCredential), randomCredential)
        != errSecSuccess) return NO;
    expected = [NSMutableData dataWithBytes:randomCredential length:sizeof(randomCredential)];
    if (expected.length != 32U) return NO;
    accessControl = SecAccessControlCreateWithFlags(
      kCFAllocatorDefault,
      kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
      kSecAccessControlUserPresence,
      &accessControlError
    );
    if (accessControl == NULL) return NO;
    NSMutableDictionary *item = [PAExactSelector(service, account) mutableCopy];
    item[(__bridge id)kSecAttrAccessControl] = (__bridge id)accessControl;
    item[(__bridge id)kSecValueData] = expected;
    item[(__bridge id)kSecReturnPersistentRef] = @YES;
    CFTypeRef addedReference = NULL;
    OSStatus added = SecItemAdd((__bridge CFDictionaryRef)item, &addedReference);
    if (added != errSecSuccess) {
      if (addedReference != NULL) CFRelease(addedReference);
      return NO;
    }
    created = YES;
    if (addedReference != NULL && CFGetTypeID(addedReference) == CFDataGetTypeID()
        && CFDataGetLength((CFDataRef)addedReference) > 0) {
      persistentReference = [(__bridge NSData *)addedReference copy];
    }
    if (addedReference != NULL) CFRelease(addedReference);
    if (persistentReference == nil) return NO;
    if (!PAUnauthenticatedReadDenied(persistentReference)) return NO;

    NSString *display = @"DEVELOPMENT/TESTNET SOFTWARE ATTESTOR — MANUAL DEVICE-OWNER AND KEYCHAIN ACCEPTANCE\n\n"
      "This one-use local test creates a disposable, non-synchronizing "
      "ThisDeviceOnly Keychain item. Continue only if you intend to exercise "
      "a real macOS device-owner authentication prompt. A system password may "
      "satisfy the policy; this test does not prove biometrics. No chain, "
      "payment, wallet, signer, token, or network action is performed.";
    PAOperatorDisplayOutcome displayOutcome = [adapter displayCommittedOperation:display];
    if (displayOutcome != PAOperatorDisplayOutcomeContinued) {
      *failureCode = displayOutcome == PAOperatorDisplayOutcomeCancelled
        ? PAManualExitDisplayCancelled : PAManualExitDisplayAmbiguous;
      return NO;
    }
    PAAuthenticationOutcome authentication = [adapter authenticateContext:context];
    if (authentication != PAAuthenticationOutcomeApproved) {
      *failureCode = authentication == PAAuthenticationOutcomeDenied
        ? PAManualExitAuthenticationDenied : PAManualExitAuthenticationAmbiguous;
      return NO;
    }
    observed = [adapter copyCredentialForService:service account:account context:context];
    if (observed == nil || observed.length != expected.length
        || ![observed isEqualToData:expected]) return NO;
    if (!PAVerifyStoredAttributes(service, account, persistentReference,
          accessControl)) return NO;
    passed = YES;
  } @catch (__unused NSException *exception) {
    passed = NO;
    *failureCode = PAManualExitFail;
  } @finally {
    [adapter invalidateAuthenticationContext:context];
    PAWipeData(observed);
    PAWipeData(expected);
    PAWipeBytes(randomCredential, sizeof(randomCredential));
    if (accessControl != NULL) CFRelease(accessControl);
    if (accessControlError != NULL) CFRelease(accessControlError);
    if (created) {
      // Only the exact item successfully created by this process may be removed.
      // A preexisting item makes SecItemAdd fail and is never touched.
      if (!PADeleteExactOwnedItem(persistentReference)) {
        passed = NO;
        *failureCode = PAManualExitFail;
      }
    }
  }
  return passed;
}

static int PARunManualDeviceOwnerOnly(void) {
  id<PAPlatformAdapter> adapter = PAProductionPlatformAdapter();
  id context = [adapter createAuthenticationContext];
  if (context == nil) return PAManualExitFail;
  int result = PAManualExitFail;
  @try {
    NSString *display = @"DEVELOPMENT/TESTNET SOFTWARE ATTESTOR — MANUAL DEVICE-OWNER ACCEPTANCE\n\n"
      "This local test exercises only the macOS device-owner policy. A system "
      "password may satisfy it; biometrics are not required or proven. The "
      "system prompt is not bound to this text. No Keychain item, chain, "
      "payment, wallet, signer, token, or network action is performed.";
    PAApprovalAvailability availability = [adapter approvalAvailabilityForContext:context];
    if (availability == PAApprovalAvailabilityUnavailable) {
      result = PAManualExitPolicyUnavailable;
    } else if (availability != PAApprovalAvailabilityAvailable) {
      result = PAManualExitPolicyAmbiguous;
    } else {
      PAOperatorDisplayOutcome displayOutcome = PABoundedManualDisplay(adapter, display);
      if (displayOutcome == PAOperatorDisplayOutcomeCancelled) {
        result = PAManualExitDisplayCancelled;
      } else if (displayOutcome != PAOperatorDisplayOutcomeContinued) {
        result = PAManualExitDisplayAmbiguous;
      } else {
        PAAuthenticationOutcome authentication = [adapter authenticateContext:context];
        if (authentication == PAAuthenticationOutcomeDenied) {
          result = PAManualExitAuthenticationDenied;
        } else if (authentication != PAAuthenticationOutcomeApproved) {
          result = PAManualExitAuthenticationAmbiguous;
        } else {
          result = PAManualExitPass;
        }
      }
    }
  } @catch (__unused NSException *exception) {
    result = PAManualExitFail;
  } @finally {
    [adapter invalidateAuthenticationContext:context];
  }
  return result;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    int resultDescriptor = dup(STDOUT_FILENO);
    int sink = open("/dev/null", O_WRONLY | O_CLOEXEC);
    if (resultDescriptor < 0 || sink < 0
        || dup2(sink, STDOUT_FILENO) < 0
        || dup2(sink, STDERR_FILENO) < 0) {
      if (sink >= 0) close(sink);
      if (resultDescriptor >= 0) close(resultDescriptor);
      return 1;
    }
    close(sink);
    BOOL exactManualFlag = argc == 2 && argv[1] != NULL;
    BOOL interactive = isatty(STDIN_FILENO) != 0;
    BOOL keychainMode = exactManualFlag && interactive
      && strcmp(argv[1], "--manual-one-use-device-owner-keychain") == 0;
    BOOL launchServicesTestApp = getuid() != 0 && geteuid() != 0
      && [[[NSBundle mainBundle] bundleIdentifier]
        isEqualToString:@"org.zenon-x402.provider-attestor.manual-device-owner-only-test"];
    BOOL deviceOwnerOnlyMode = exactManualFlag
      && strcmp(argv[1], "--manual-device-owner-only") == 0
      && (interactive || launchServicesTestApp);
    BOOL selectedMode = keychainMode || deviceOwnerOnlyMode;
    PAUIActivationSubstage uiSubstage = PAUIActivationOther;
    BOOL uiReady = selectedMode && PAActivateManualUI(&uiSubstage);
    int failureCode = PAManualExitFail;
    int status = !selectedMode ? PAManualExitFail
      : !uiReady ? PAManualExitUIActivation
      : keychainMode ? (PARunManualAcceptance(&failureCode)
          ? PAManualExitPass : failureCode)
        : PARunManualDeviceOwnerOnly();
    BOOL reportLAStage = !interactive && launchServicesTestApp && deviceOwnerOnlyMode;
    const char *result = reportLAStage ? PAFixedLAResult(status, uiSubstage)
      : status == PAManualExitPass ? "PASS\n" : "FAIL\n";
    size_t resultLength = strlen(result);
    ssize_t written = write(resultDescriptor, result, resultLength);
    close(resultDescriptor);
    return written == (ssize_t)resultLength ? status : PAManualExitFail;
  }
}
