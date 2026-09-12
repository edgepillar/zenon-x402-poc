#import "development_testnet_ui.h"

#import <AppKit/AppKit.h>
#include <string.h>
#include <time.h>

@interface PADevelopmentApprovalContext : NSObject
@property(nonatomic) id owner;
@property(nonatomic) BOOL valid;
@property(nonatomic) BOOL approved;
@end
@implementation PADevelopmentApprovalContext
@end

@interface PADevelopmentApprovalAdapter : NSObject <PAPlatformAdapter>
@property(nonatomic) PADevelopmentApprovalContext *active;
@end

@implementation PADevelopmentApprovalAdapter

- (BOOL)copyEpochSeconds:(uint64_t *)epochSeconds {
  if (epochSeconds == NULL) return NO;
  struct timespec now;
  if (clock_gettime(CLOCK_REALTIME, &now) != 0 || now.tv_sec < 0
      || (uint64_t)now.tv_sec > 9007199254740991ULL) return NO;
  *epochSeconds = (uint64_t)now.tv_sec;
  return YES;
}

- (id)createAuthenticationContext {
  if (self.active != nil || ![NSThread isMainThread]) return nil;
  PADevelopmentApprovalContext *context = [[PADevelopmentApprovalContext alloc] init];
  context.owner = self;
  context.valid = YES;
  self.active = context;
  return context;
}

- (PAApprovalAvailability)approvalAvailabilityForContext:(id)candidate {
  if (candidate != self.active || !self.active.valid || ![NSThread isMainThread]) {
    return PAApprovalAvailabilityAmbiguous;
  }
  return PAApprovalAvailabilityAvailable;
}

- (PAOperatorDisplayOutcome)displayCommittedOperation:(NSString *)displayText {
#if defined(PA_SYNTHETIC_MANUAL_NO_DIALOG_TESTING)
  (void)displayText;
  return PAOperatorDisplayOutcomeAmbiguous;
#else
  if (self.active == nil || !self.active.valid || self.active.approved
      || ![NSThread isMainThread] || displayText.length == 0U) {
    return PAOperatorDisplayOutcomeAmbiguous;
  }
  @try {
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
#if defined(PA_SYNTHETIC_MANUAL_GUI_TESTING)
    alert.messageText = @"SYNTHETIC/OFFLINE SOFTWARE ATTESTOR";
#else
    alert.messageText = @"DEVELOPMENT/TESTNET SOFTWARE ATTESTOR";
#endif
    alert.informativeText = @"Review every field. This copyable software token and caller-supplied chain data provide no Keychain, biometric, hardware-custody, or live-settlement assurance.";
    alert.accessoryView = scroll;
    [alert addButtonWithTitle:@"Cancel"];
    NSButton *approve = [alert addButtonWithTitle:@"Approve this operation"];
    approve.keyEquivalent = @"";
    NSModalResponse response = [alert runModal];
    if (response == NSAlertSecondButtonReturn) {
      self.active.approved = YES;
      return PAOperatorDisplayOutcomeContinued;
    }
    if (response == NSAlertFirstButtonReturn) return PAOperatorDisplayOutcomeCancelled;
  } @catch (__unused NSException *exception) {
    return PAOperatorDisplayOutcomeAmbiguous;
  }
  return PAOperatorDisplayOutcomeAmbiguous;
#endif
}

- (PAAuthenticationOutcome)authenticateContext:(id)candidate {
  if (candidate != self.active || !self.active.valid || !self.active.approved
      || ![NSThread isMainThread]) return PAAuthenticationOutcomeAmbiguous;
  self.active.approved = NO;
  return PAAuthenticationOutcomeApproved;
}

- (NSMutableData *)copyCredentialForService:(NSString *)service
                                    account:(NSString *)account
                                    context:(id)context {
  (void)service;
  (void)account;
  (void)context;
  return nil; // This adapter never accesses a Keychain.
}

- (void)invalidateAuthenticationContext:(id)candidate {
  if (candidate != self.active) return;
  self.active.approved = NO;
  self.active.valid = NO;
  self.active = nil;
}

@end

@interface PADevelopmentPINProvider : NSObject <PADisposablePINProvider>
@property(nonatomic) BOOL used;
@end

@implementation PADevelopmentPINProvider

- (BOOL)copyOneShotPIN:(uint8_t [16])pin
   operationIdentifier:(NSString *)operationIdentifier {
#if defined(PA_SYNTHETIC_MANUAL_NO_DIALOG_TESTING)
  (void)pin;
  (void)operationIdentifier;
  return NO;
#else
  if (self.used) return NO;
  self.used = YES;
  if (![NSThread isMainThread] || operationIdentifier.length == 0U) return NO;
  @try {
    NSSecureTextField *field = [[NSSecureTextField alloc]
      initWithFrame:NSMakeRect(0, 0, 360, 28)];
    field.placeholderString = @"Disposable token PIN";
    NSAlert *alert = [[NSAlert alloc] init];
    alert.alertStyle = NSAlertStyleWarning;
    alert.messageText = @"One-shot disposable token PIN";
    alert.informativeText = [@"The reviewed operation is now latched for one signing attempt. PIN cancellation or uncertainty quarantines it. Operation: "
      stringByAppendingString:operationIdentifier];
    alert.accessoryView = field;
    [alert addButtonWithTitle:@"Cancel"];
    NSButton *unlock = [alert addButtonWithTitle:@"Unlock once"];
    unlock.keyEquivalent = @"";
    NSModalResponse response = [alert runModal];
    if (response != NSAlertSecondButtonReturn) {
      field.stringValue = @"";
      return NO;
    }
    NSString *value = field.stringValue;
    NSData *encoded = [value dataUsingEncoding:NSASCIIStringEncoding allowLossyConversion:NO];
    BOOL valid = encoded.length == 16U;
    if (valid) {
      const uint8_t *bytes = encoded.bytes;
      for (size_t index = 0U; index < 16U; index += 1U) {
        if (bytes[index] < '0' || bytes[index] > '9') valid = NO;
      }
      if (valid) memcpy(pin, bytes, 16U);
    }
    field.stringValue = @"";
    return valid;
  } @catch (__unused NSException *exception) {
    return NO;
  }
#endif
}

@end

id<PAPlatformAdapter> PADevelopmentTestnetApprovalAdapter(void) {
  return [[PADevelopmentApprovalAdapter alloc] init];
}

id<PADisposablePINProvider> PADevelopmentTestnetPINProvider(void) {
  return [[PADevelopmentPINProvider alloc] init];
}
