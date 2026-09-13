#import "provider_attestor.h"

#import <CommonCrypto/CommonDigest.h>
#import <CoreFoundation/CoreFoundation.h>
#import <math.h>

const NSUInteger PAProviderSigningWireRequestMaximumPayloadBytes = (512U * 1024U) + 610U;
const NSUInteger PAProviderAttestationHardMaximumCanonicalBytes = 512U * 1024U;

static NSString *const PAErrorDomain = @"org.zenon-x402.provider-attestor";
static NSString *const PARequestType = @"zenon-funding-provider-attestation-request";
static NSString *const PAWireRequestType = @"zenon-funding-provider-signing-request";
static NSString *const PAWireResponseType = @"zenon-funding-provider-signing-response";
static NSString *const PANetwork = @"zenon:testnet";
static NSString *const PAAlgorithm = @"Ed25519";
static NSString *const PAConfirmationPolicy = @"zenon.authenticated-momentum-inclusion";
static NSString *const PAOperationDomain = @"zenon-x402:funding-provider-signing-operation-v1";
static NSString *const PAAuthorityRecordDomain = @"zenon-x402:funding-provider-attestation-authority-v1";
static NSString *const PAAuthorityGenerationDomain = @"zenon-x402:funding-provider-attestation-generation-v1";
static NSString *const PAFundingEvidenceDomain = @"zenon-x402:funding-provider-attestation-evidence-v1";
static NSString *const PAAttestationIdentifierDomain = @"zenon-x402:funding-provider-attestation-id-v1";
static const uint8_t PASigningDomain[] =
  "zenon-x402:funding-provider-attestation-signature-v1\0";

typedef struct {
  NSUInteger depth;
  NSUInteger nodes;
  NSUInteger members;
  NSUInteger keyBytes;
  NSUInteger stringBytes;
} PACanonicalBudget;

@interface PAAuthority ()

@property(nonatomic, readwrite) NSDictionary<NSString *, id> *fields;
@property(nonatomic, readwrite) NSString *canonicalRecord;
@property(nonatomic, readwrite) NSString *recordDigest;
@property(nonatomic, readwrite) NSString *generationCommitment;
@property(nonatomic, readwrite) NSString *keyIdentifier;
@property(nonatomic, readwrite) NSData *publicKey;
@property(nonatomic, readwrite) NSUInteger maximumCanonicalBytes;
@property(nonatomic, readwrite) NSUInteger maximumValiditySeconds;

@end

@implementation PAAuthority
@end

@interface PAParsedSigningRequest ()

@property(nonatomic, readwrite) NSDictionary<NSString *, id> *wireValue;
@property(nonatomic, readwrite) NSDictionary<NSString *, id> *attestationRequest;
@property(nonatomic, readwrite) NSData *canonicalWirePayload;
@property(nonatomic, readwrite) NSData *canonicalAttestationRequest;
@property(nonatomic, readwrite) NSString *operationIdentifier;

@end


@implementation PAParsedSigningRequest
@end

static BOOL PAFail(NSError **error, NSInteger code) {
  if (error != NULL) {
    *error = [NSError errorWithDomain:PAErrorDomain code:code userInfo:@{}];
  }
  return NO;
}

static BOOL PAAddBudget(NSUInteger *value, NSUInteger amount, NSUInteger maximum) {
  if (amount > maximum || *value > maximum - amount) return NO;
  *value += amount;
  return YES;
}

static BOOL PAValidUnicodeString(NSString *value, NSUInteger *byteLength) {
  NSUInteger length = value.length;
  for (NSUInteger index = 0; index < length; index += 1) {
    unichar unit = [value characterAtIndex:index];
    if (CFStringIsSurrogateHighCharacter(unit)) {
      if (index + 1 >= length) return NO;
      unichar low = [value characterAtIndex:index + 1];
      if (!CFStringIsSurrogateLowCharacter(low)) return NO;
      index += 1;
    } else if (CFStringIsSurrogateLowCharacter(unit)) {
      return NO;
    }
  }
  NSData *encoded = [value dataUsingEncoding:NSUTF8StringEncoding allowLossyConversion:NO];
  if (encoded == nil) return NO;
  if (byteLength != NULL) *byteLength = encoded.length;
  return YES;
}

static NSComparisonResult PAUTF16Compare(NSString *left, NSString *right) {
  NSUInteger common = MIN(left.length, right.length);
  for (NSUInteger index = 0; index < common; index += 1) {
    unichar leftUnit = [left characterAtIndex:index];
    unichar rightUnit = [right characterAtIndex:index];
    if (leftUnit < rightUnit) return NSOrderedAscending;
    if (leftUnit > rightUnit) return NSOrderedDescending;
  }
  if (left.length < right.length) return NSOrderedAscending;
  if (left.length > right.length) return NSOrderedDescending;
  return NSOrderedSame;
}

static void PAAppendASCII(NSMutableData *output, const char *text) {
  [output appendBytes:text length:strlen(text)];
}

static BOOL PAAppendJSONString(NSMutableData *output, NSString *value) {
  static const char hex[] = "0123456789abcdef";
  PAAppendASCII(output, "\"");
  NSUInteger length = value.length;
  for (NSUInteger index = 0; index < length; index += 1) {
    unichar units[2] = { [value characterAtIndex:index], 0 };
    switch (units[0]) {
      case '"': PAAppendASCII(output, "\\\""); continue;
      case '\\': PAAppendASCII(output, "\\\\"); continue;
      case '\b': PAAppendASCII(output, "\\b"); continue;
      case '\t': PAAppendASCII(output, "\\t"); continue;
      case '\n': PAAppendASCII(output, "\\n"); continue;
      case '\f': PAAppendASCII(output, "\\f"); continue;
      case '\r': PAAppendASCII(output, "\\r"); continue;
      default: break;
    }
    if (units[0] < 0x20U) {
      char escape[6] = { '\\', 'u', '0', '0', hex[(units[0] >> 4U) & 0x0fU], hex[units[0] & 0x0fU] };
      [output appendBytes:escape length:sizeof(escape)];
      continue;
    }
    NSUInteger unitCount = 1;
    if (CFStringIsSurrogateHighCharacter(units[0])) {
      if (index + 1 >= length) return NO;
      units[1] = [value characterAtIndex:index + 1];
      if (!CFStringIsSurrogateLowCharacter(units[1])) return NO;
      unitCount = 2;
      index += 1;
    } else if (CFStringIsSurrogateLowCharacter(units[0])) {
      return NO;
    }
    NSString *scalar = [NSString stringWithCharacters:units length:unitCount];
    NSData *encoded = [scalar dataUsingEncoding:NSUTF8StringEncoding allowLossyConversion:NO];
    if (encoded == nil) return NO;
    [output appendData:encoded];
  }
  PAAppendASCII(output, "\"");
  return YES;
}

static BOOL PAIsBoolean(NSNumber *value) {
  return CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID();
}

static BOOL PAAppendCanonicalValue(
  NSMutableData *output,
  id value,
  PACanonicalBudget *budget,
  NSUInteger depth
) {
  if (depth > 32U || !PAAddBudget(&budget->nodes, 1U, 16384U)) return NO;
  if (value == [NSNull null]) {
    PAAppendASCII(output, "null");
    return YES;
  }
  if ([value isKindOfClass:[NSString class]]) {
    NSUInteger byteLength = 0;
    if (!PAValidUnicodeString(value, &byteLength)
        || !PAAddBudget(&budget->stringBytes, byteLength, 512U * 1024U)) return NO;
    return PAAppendJSONString(output, value);
  }
  if ([value isKindOfClass:[NSNumber class]]) {
    NSNumber *number = value;
    if (PAIsBoolean(number)) {
      PAAppendASCII(output, number.boolValue ? "true" : "false");
      return YES;
    }
    if (CFNumberIsFloatType((__bridge CFNumberRef)number)) {
      double observed = number.doubleValue;
      if (observed == 0.0 && signbit(observed)) {
        PAAppendASCII(output, "0");
        return YES;
      }
      return NO;
    }
    long long integer = number.longLongValue;
    if (integer < -9007199254740991LL || integer > 9007199254740991LL) return NO;
    NSString *rendered = [NSString stringWithFormat:@"%lld", integer];
    NSData *encoded = [rendered dataUsingEncoding:NSASCIIStringEncoding];
    if (encoded == nil) return NO;
    [output appendData:encoded];
    return YES;
  }
  if ([value isKindOfClass:[NSArray class]]) {
    NSArray *array = value;
    if (array.count > 8192U || !PAAddBudget(&budget->members, array.count, 16384U)) return NO;
    PAAppendASCII(output, "[");
    for (NSUInteger index = 0; index < array.count; index += 1) {
      if (index != 0U) PAAppendASCII(output, ",");
      if (!PAAppendCanonicalValue(output, array[index], budget, depth + 1U)) return NO;
    }
    PAAppendASCII(output, "]");
    return YES;
  }
  if ([value isKindOfClass:[NSDictionary class]]) {
    NSDictionary *dictionary = value;
    if (dictionary.count > 8192U
        || !PAAddBudget(&budget->members, dictionary.count, 16384U)) return NO;
    NSArray *keys = [dictionary.allKeys sortedArrayUsingComparator:^NSComparisonResult(id left, id right) {
      if (![left isKindOfClass:[NSString class]] || ![right isKindOfClass:[NSString class]]) {
        return NSOrderedSame;
      }
      return PAUTF16Compare(left, right);
    }];
    PAAppendASCII(output, "{");
    for (NSUInteger index = 0; index < keys.count; index += 1) {
      NSString *key = keys[index];
      NSUInteger keyBytes = 0;
      if (![key isKindOfClass:[NSString class]]
          || !PAValidUnicodeString(key, &keyBytes)
          || !PAAddBudget(&budget->keyBytes, keyBytes, 64U * 1024U)) return NO;
      if (index != 0U) PAAppendASCII(output, ",");
      if (!PAAppendJSONString(output, key)) return NO;
      PAAppendASCII(output, ":");
      if (!PAAppendCanonicalValue(output, dictionary[key], budget, depth + 1U)) return NO;
    }
    PAAppendASCII(output, "}");
    return YES;
  }
  return NO;
}

NSData *PACanonicalJSONData(id value, NSUInteger maximumBytes, NSError **error) {
  if (maximumBytes == 0U || maximumBytes > 1024U * 1024U) {
    PAFail(error, 1);
    return nil;
  }
  NSMutableData *output = [NSMutableData data];
  PACanonicalBudget budget = { 0U, 0U, 0U, 0U, 0U };
  if (!PAAppendCanonicalValue(output, value, &budget, 0U) || output.length > maximumBytes) {
    PAFail(error, 1);
    return nil;
  }
  return [output copy];
}

id PAParseCanonicalJSONData(NSData *data, NSUInteger maximumBytes, NSError **error) {
  if (![data isKindOfClass:[NSData class]]
      || data.length == 0U
      || data.length > maximumBytes
      || maximumBytes > 1024U * 1024U) {
    PAFail(error, 2);
    return nil;
  }
  NSString *text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  if (text == nil) {
    PAFail(error, 2);
    return nil;
  }
  NSError *jsonError = nil;
  id value = [NSJSONSerialization JSONObjectWithData:data options:0 error:&jsonError];
  if (value == nil || jsonError != nil) {
    PAFail(error, 2);
    return nil;
  }
  NSData *canonical = PACanonicalJSONData(value, maximumBytes, NULL);
  if (canonical == nil || ![canonical isEqualToData:data]) {
    PAFail(error, 2);
    return nil;
  }
  return value;
}

NSString *PABase64URLString(NSData *data) {
  NSString *base64 = [data base64EncodedStringWithOptions:0];
  base64 = [base64 stringByReplacingOccurrencesOfString:@"+" withString:@"-"];
  base64 = [base64 stringByReplacingOccurrencesOfString:@"/" withString:@"_"];
  return [base64 stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"="]];
}

NSData *PADecodeBase64URL(NSString *text, NSUInteger expectedLength, NSError **error) {
  if (![text isKindOfClass:[NSString class]] || [text containsString:@"="]) {
    PAFail(error, 3);
    return nil;
  }
  NSCharacterSet *invalid = [[NSCharacterSet characterSetWithCharactersInString:
    @"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"] invertedSet];
  if ([text rangeOfCharacterFromSet:invalid].location != NSNotFound) {
    PAFail(error, 3);
    return nil;
  }
  NSString *base64 = [text stringByReplacingOccurrencesOfString:@"-" withString:@"+"];
  base64 = [base64 stringByReplacingOccurrencesOfString:@"_" withString:@"/"];
  NSUInteger remainder = base64.length % 4U;
  if (remainder == 1U) {
    PAFail(error, 3);
    return nil;
  }
  if (remainder != 0U) {
    base64 = [base64 stringByPaddingToLength:base64.length + (4U - remainder)
                                  withString:@"="
                             startingAtIndex:0U];
  }
  NSData *decoded = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
  if (decoded == nil || decoded.length != expectedLength
      || ![PABase64URLString(decoded) isEqualToString:text]) {
    PAFail(error, 3);
    return nil;
  }
  return decoded;
}

static NSString *PAHexDigest(NSData *data) {
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
  static const char hex[] = "0123456789abcdef";
  char rendered[(CC_SHA256_DIGEST_LENGTH * 2U) + 1U];
  for (NSUInteger index = 0; index < CC_SHA256_DIGEST_LENGTH; index += 1U) {
    rendered[index * 2U] = hex[digest[index] >> 4U];
    rendered[(index * 2U) + 1U] = hex[digest[index] & 0x0fU];
  }
  rendered[CC_SHA256_DIGEST_LENGTH * 2U] = '\0';
  return [NSString stringWithUTF8String:rendered];
}

NSString *PASHA256Commitment(NSString *domain, NSData *payload) {
  NSMutableData *input = [NSMutableData data];
  [input appendData:[domain dataUsingEncoding:NSUTF8StringEncoding]];
  const uint8_t separator = 0U;
  [input appendBytes:&separator length:1U];
  [input appendData:payload];
  return [@"sha256:" stringByAppendingString:PAHexDigest(input)];
}

static BOOL PAExactKeys(NSDictionary *value, NSArray<NSString *> *keys) {
  if (![value isKindOfClass:[NSDictionary class]] || value.count != keys.count) return NO;
  for (NSString *key in keys) if (value[key] == nil) return NO;
  return YES;
}

static BOOL PAInteger(id value, BOOL positive, uint64_t *output) {
  if (![value isKindOfClass:[NSNumber class]] || PAIsBoolean(value)
      || CFNumberIsFloatType((__bridge CFNumberRef)value)) return NO;
  long long observed = [value longLongValue];
  if (observed < (positive ? 1LL : 0LL) || observed > 9007199254740991LL) return NO;
  if (output != NULL) *output = (uint64_t)observed;
  return YES;
}

static BOOL PAASCIIIdentifier(id value) {
  if (![value isKindOfClass:[NSString class]]) return NO;
  NSString *text = value;
  if (text.length < 1U || text.length > 128U) return NO;
  for (NSUInteger index = 0; index < text.length; index += 1U) {
    unichar unit = [text characterAtIndex:index];
    BOOL valid = (unit >= 'A' && unit <= 'Z')
      || (unit >= 'a' && unit <= 'z')
      || (unit >= '0' && unit <= '9')
      || (index > 0U && (unit == '.' || unit == '_' || unit == ':' || unit == '-'));
    if (!valid) return NO;
  }
  return YES;
}

static BOOL PALowerHex(NSString *value, NSUInteger length) {
  if (![value isKindOfClass:[NSString class]] || value.length != length) return NO;
  for (NSUInteger index = 0; index < value.length; index += 1U) {
    unichar unit = [value characterAtIndex:index];
    if (!((unit >= '0' && unit <= '9') || (unit >= 'a' && unit <= 'f'))) return NO;
  }
  return YES;
}

static BOOL PADigest(id value) {
  if (![value isKindOfClass:[NSString class]]) return NO;
  NSString *text = value;
  return text.length == 71U
    && [text hasPrefix:@"sha256:"]
    && PALowerHex([text substringFromIndex:7U], 64U);
}

static BOOL PAHashSyntax(id value) {
  return [value isKindOfClass:[NSString class]]
    && PALowerHex(value, 64U);
}

static BOOL PAHash(id value) {
  return PAHashSyntax(value)
    && ![value isEqualToString:[@"0" stringByPaddingToLength:64U withString:@"0" startingAtIndex:0U]];
}

static BOOL PAPositiveDecimal(id value, NSUInteger maximumLength) {
  if (![value isKindOfClass:[NSString class]]) return NO;
  NSString *text = value;
  if (text.length == 0U || text.length > maximumLength || [text characterAtIndex:0U] == '0') return NO;
  for (NSUInteger index = 0; index < text.length; index += 1U) {
    unichar unit = [text characterAtIndex:index];
    if (unit < '0' || unit > '9') return NO;
  }
  return YES;
}

static BOOL PAValidateChainProfile(NSDictionary *value) {
  uint64_t version = 0U;
  if (!PAExactKeys(value, @[ @"version", @"chainIdentifier", @"genesisMomentumHash" ])
      || !PAInteger(value[@"version"], YES, &version)
      || version != 1U
      || !PAPositiveDecimal(value[@"chainIdentifier"], 16U)
      || [value[@"chainIdentifier"] compare:@"9007199254740991" options:NSNumericSearch]
        == NSOrderedDescending
      || !PAHash(value[@"genesisMomentumHash"])) return NO;
  return YES;
}

static BOOL PAValidateObserverPolicy(NSDictionary *value) {
  uint64_t policyVersion = 0U;
  uint64_t verifierVersion = 0U;
  return PAExactKeys(value, @[ @"policyId", @"policyVersion", @"verifierVersion" ])
    && PAASCIIIdentifier(value[@"policyId"])
    && PAInteger(value[@"policyVersion"], YES, &policyVersion)
    && PAInteger(value[@"verifierVersion"], YES, &verifierVersion);
}

static BOOL PAValidateConfirmationPolicy(NSDictionary *value) {
  uint64_t version = 0U;
  uint64_t confirmations = 0U;
  return PAExactKeys(value, @[ @"policyId", @"policyVersion", @"minimumConfirmations" ])
    && [value[@"policyId"] isEqualToString:PAConfirmationPolicy]
    && PAInteger(value[@"policyVersion"], YES, &version)
    && version == 1U
    && PAInteger(value[@"minimumConfirmations"], YES, &confirmations)
    && confirmations >= 2U
    && confirmations <= 30U;
}

static BOOL PAValidateCheckpoint(NSDictionary *value) {
  uint64_t height = 0U;
  return PAExactKeys(value, @[ @"height", @"hash" ])
    && PAInteger(value[@"height"], NO, &height)
    && PAHash(value[@"hash"]);
}

static NSArray<NSString *> *PAAuthorityKeys(void) {
  return @[
    @"authorityRecordVersion", @"authorityProfileId", @"authorityProfileVersion",
    @"verifierVersion", @"providerAuthorityId", @"generationId",
    @"generationVersion", @"keyId", @"algorithm", @"publicKey", @"network",
    @"chainProfile", @"observerPolicy", @"confirmationPolicy", @"bootstrapCheckpoint",
    @"sourcePolicyCommitment", @"maximumAttestationBytes", @"maximumCanonicalBytes",
    @"maximumInitialAgeSeconds", @"maximumFutureSkewSeconds", @"maximumValiditySeconds",
  ];
}

PAAuthority *PAParseAuthorityRecord(NSString *canonicalRecord, NSError **error) {
  NSData *recordData = [canonicalRecord dataUsingEncoding:NSUTF8StringEncoding allowLossyConversion:NO];
  id parsed = recordData == nil ? nil : PAParseCanonicalJSONData(recordData, 64U * 1024U, NULL);
  if (![parsed isKindOfClass:[NSDictionary class]] || !PAExactKeys(parsed, PAAuthorityKeys())) {
    PAFail(error, 10);
    return nil;
  }
  NSDictionary *fields = parsed;
  uint64_t authorityVersion = 0U;
  uint64_t authorityProfileVersion = 0U;
  uint64_t verifierVersion = 0U;
  uint64_t generationVersion = 0U;
  uint64_t maximumAttestationBytes = 0U;
  uint64_t maximumCanonicalBytes = 0U;
  uint64_t maximumInitialAge = 0U;
  uint64_t maximumFutureSkew = 0U;
  uint64_t maximumValidity = 0U;
  NSData *publicKey = PADecodeBase64URL(fields[@"publicKey"], 32U, NULL);
  BOOL valid = PAInteger(fields[@"authorityRecordVersion"], YES, &authorityVersion)
    && authorityVersion == 1U
    && PAASCIIIdentifier(fields[@"authorityProfileId"])
    && PAInteger(fields[@"authorityProfileVersion"], YES, &authorityProfileVersion)
    && PAInteger(fields[@"verifierVersion"], YES, &verifierVersion)
    && PAASCIIIdentifier(fields[@"providerAuthorityId"])
    && PAASCIIIdentifier(fields[@"generationId"])
    && PAInteger(fields[@"generationVersion"], YES, &generationVersion)
    && PAASCIIIdentifier(fields[@"keyId"])
    && [fields[@"algorithm"] isEqualToString:PAAlgorithm]
    && publicKey != nil
    && [fields[@"network"] isEqualToString:PANetwork]
    && PAValidateChainProfile(fields[@"chainProfile"])
    && PAValidateObserverPolicy(fields[@"observerPolicy"])
    && PAValidateConfirmationPolicy(fields[@"confirmationPolicy"])
    && PAValidateCheckpoint(fields[@"bootstrapCheckpoint"])
    && PADigest(fields[@"sourcePolicyCommitment"])
    && PAInteger(fields[@"maximumAttestationBytes"], YES, &maximumAttestationBytes)
    && maximumAttestationBytes >= 512U && maximumAttestationBytes <= 64U * 1024U
    && PAInteger(fields[@"maximumCanonicalBytes"], YES, &maximumCanonicalBytes)
    && maximumCanonicalBytes >= 1024U
    && maximumCanonicalBytes <= PAProviderAttestationHardMaximumCanonicalBytes
    && PAInteger(fields[@"maximumInitialAgeSeconds"], YES, &maximumInitialAge)
    && maximumInitialAge <= 86400U
    && PAInteger(fields[@"maximumFutureSkewSeconds"], NO, &maximumFutureSkew)
    && maximumFutureSkew <= 300U
    && PAInteger(fields[@"maximumValiditySeconds"], YES, &maximumValidity)
    && maximumValidity <= 86400U
    && [fields[@"observerPolicy"][@"verifierVersion"] isEqual:fields[@"verifierVersion"]];
  if (!valid) {
    PAFail(error, 10);
    return nil;
  }
  NSDictionary *generation = @{
    @"providerAuthorityId": fields[@"providerAuthorityId"],
    @"generationId": fields[@"generationId"],
    @"generationVersion": fields[@"generationVersion"],
    @"keyId": fields[@"keyId"],
    @"algorithm": fields[@"algorithm"],
    @"publicKey": fields[@"publicKey"],
    @"network": fields[@"network"],
    @"chainProfile": fields[@"chainProfile"],
    @"observerPolicy": fields[@"observerPolicy"],
    @"confirmationPolicy": fields[@"confirmationPolicy"],
    @"bootstrapCheckpoint": fields[@"bootstrapCheckpoint"],
    @"sourcePolicyCommitment": fields[@"sourcePolicyCommitment"],
  };
  NSData *generationBytes = PACanonicalJSONData(generation, 64U * 1024U, NULL);
  if (generationBytes == nil) {
    PAFail(error, 10);
    return nil;
  }
  PAAuthority *authority = [[PAAuthority alloc] init];
  authority.fields = fields;
  authority.canonicalRecord = canonicalRecord;
  authority.recordDigest = PASHA256Commitment(PAAuthorityRecordDomain, recordData);
  authority.generationCommitment = PASHA256Commitment(PAAuthorityGenerationDomain, generationBytes);
  authority.keyIdentifier = fields[@"keyId"];
  authority.publicKey = publicKey;
  authority.maximumCanonicalBytes = (NSUInteger)maximumCanonicalBytes;
  authority.maximumValiditySeconds = (NSUInteger)maximumValidity;
  return authority;
}

static BOOL PAValidateEvidence(NSDictionary *value, PAAuthority *authority) {
  NSArray *keys = @[
    @"evidenceVersion", @"evidenceType", @"authorityProfileId",
    @"authorityProfileVersion", @"verifierVersion", @"authorityRecordDigest",
    @"network", @"chainProfile", @"transactionId", @"payer", @"payee", @"asset",
    @"amount", @"paymentResourceDigest", @"paymentRequirementDigest",
    @"paymentIntentDigest", @"resourceBinding", @"offerId", @"offerVersion",
    @"fundingPolicyId", @"fundingPolicyVersion", @"capabilityCommitment", @"totalUnits",
    @"expiresAt", @"grantFundingCommitment", @"inclusionEvidence", @"confirmationPolicy",
  ];
  uint64_t evidenceVersion = 0U;
  uint64_t authorityProfileVersion = 0U;
  uint64_t verifierVersion = 0U;
  uint64_t offerVersion = 0U;
  uint64_t fundingPolicyVersion = 0U;
  uint64_t totalUnits = 0U;
  uint64_t expiresAt = 0U;
  if (!PAExactKeys(value, keys)
      || !PAInteger(value[@"evidenceVersion"], YES, &evidenceVersion)
      || evidenceVersion != 1U
      || ![value[@"evidenceType"] isEqualToString:@"zenon-authenticated-funding-evidence"]
      || !PAASCIIIdentifier(value[@"authorityProfileId"])
      || !PAInteger(value[@"authorityProfileVersion"], YES, &authorityProfileVersion)
      || !PAInteger(value[@"verifierVersion"], YES, &verifierVersion)
      || !PADigest(value[@"authorityRecordDigest"])
      || ![value[@"network"] isEqualToString:PANetwork]
      || !PAValidateChainProfile(value[@"chainProfile"])
      || ![value[@"transactionId"] isKindOfClass:[NSString class]]
      || ![value[@"transactionId"] hasPrefix:@"zenontx:"]
      || !PALowerHex([value[@"transactionId"] substringFromIndex:8U], 64U)
      || !PAASCIIIdentifier(value[@"payer"])
      || !PAASCIIIdentifier(value[@"payee"])
      || !PAASCIIIdentifier(value[@"asset"])
      || !PAPositiveDecimal(value[@"amount"], 77U)
      || !PADigest(value[@"paymentResourceDigest"])
      || !PADigest(value[@"paymentRequirementDigest"])
      || !PADigest(value[@"paymentIntentDigest"])
      || !PADigest(value[@"resourceBinding"])
      || !PAASCIIIdentifier(value[@"offerId"])
      || !PAInteger(value[@"offerVersion"], YES, &offerVersion)
      || !PAASCIIIdentifier(value[@"fundingPolicyId"])
      || !PAInteger(value[@"fundingPolicyVersion"], YES, &fundingPolicyVersion)
      || !PADigest(value[@"capabilityCommitment"])
      || !PAInteger(value[@"totalUnits"], YES, &totalUnits)
      || !PAInteger(value[@"expiresAt"], YES, &expiresAt)
      || !PADigest(value[@"grantFundingCommitment"])
      || !PAValidateConfirmationPolicy(value[@"confirmationPolicy"])
      || !PAExactKeys(value[@"inclusionEvidence"], @[
        @"state", @"transactionHash", @"momentumHeight", @"momentumHash",
        @"observedConfirmations",
      ])) return NO;
  NSDictionary *inclusion = value[@"inclusionEvidence"];
  uint64_t momentumHeight = 0U;
  uint64_t confirmations = 0U;
  uint64_t required = 0U;
  if (![inclusion[@"state"] isEqualToString:@"MOMENTUM_INCLUDED"]
      || !PAHashSyntax(inclusion[@"transactionHash"])
      || ![inclusion[@"transactionHash"] isEqualToString:
        [value[@"transactionId"] substringFromIndex:8U]]
      || !PAInteger(inclusion[@"momentumHeight"], YES, &momentumHeight)
      || !PAHashSyntax(inclusion[@"momentumHash"])
      || [inclusion[@"momentumHash"] isEqualToString:inclusion[@"transactionHash"]]
      || !PAInteger(inclusion[@"observedConfirmations"], YES, &confirmations)
      || !PAInteger(value[@"confirmationPolicy"][@"minimumConfirmations"], YES, &required)
      || confirmations < required) return NO;
  return [value[@"authorityProfileId"] isEqual:authority.fields[@"authorityProfileId"]]
    && [value[@"authorityProfileVersion"] isEqual:authority.fields[@"authorityProfileVersion"]]
    && [value[@"verifierVersion"] isEqual:authority.fields[@"verifierVersion"]]
    && [value[@"authorityRecordDigest"] isEqual:authority.recordDigest]
    && [value[@"chainProfile"] isEqual:authority.fields[@"chainProfile"]]
    && [value[@"confirmationPolicy"] isEqual:authority.fields[@"confirmationPolicy"]];
}

static NSArray<NSString *> *PARequestKeys(void) {
  return @[
    @"requestVersion", @"requestType", @"attestationId", @"recordKey",
    @"authorityRecordDigest", @"generationCommitment", @"keyId", @"audienceDigest",
    @"observerRecordId", @"targetBindingDigest", @"candidateDigest",
    @"inclusionAuthorizationId", @"bootstrapCheckpoint", @"sourcePolicyCommitment",
    @"unsignedFundingEvidenceDigest", @"unsignedFundingEvidence",
  ];
}

static BOOL PAValidateAttestationRequest(
  NSDictionary *request,
  PAAuthority *authority,
  NSData **canonicalOutput
) {
  uint64_t requestVersion = 0U;
  if (!PAExactKeys(request, PARequestKeys())
      || !PAInteger(request[@"requestVersion"], YES, &requestVersion)
      || requestVersion != 1U
      || ![request[@"requestType"] isEqualToString:PARequestType]
      || !PADigest(request[@"attestationId"])
      || !PADigest(request[@"recordKey"])
      || !PADigest(request[@"authorityRecordDigest"])
      || !PADigest(request[@"generationCommitment"])
      || !PAASCIIIdentifier(request[@"keyId"])
      || !PADigest(request[@"audienceDigest"])
      || !PADigest(request[@"observerRecordId"])
      || !PADigest(request[@"targetBindingDigest"])
      || !PADigest(request[@"candidateDigest"])
      || !PADigest(request[@"inclusionAuthorizationId"])
      || !PAValidateCheckpoint(request[@"bootstrapCheckpoint"])
      || !PADigest(request[@"sourcePolicyCommitment"])
      || !PADigest(request[@"unsignedFundingEvidenceDigest"])
      || !PAValidateEvidence(request[@"unsignedFundingEvidence"], authority)) return NO;
  NSData *canonical = PACanonicalJSONData(request, authority.maximumCanonicalBytes, NULL);
  NSData *evidence = PACanonicalJSONData(request[@"unsignedFundingEvidence"],
                                         authority.maximumCanonicalBytes, NULL);
  NSDictionary *identity = @{
    @"requestVersion": request[@"requestVersion"],
    @"requestType": request[@"requestType"],
    @"recordKey": request[@"recordKey"],
    @"authorityRecordDigest": request[@"authorityRecordDigest"],
    @"generationCommitment": request[@"generationCommitment"],
    @"keyId": request[@"keyId"],
    @"audienceDigest": request[@"audienceDigest"],
    @"observerRecordId": request[@"observerRecordId"],
    @"targetBindingDigest": request[@"targetBindingDigest"],
    @"candidateDigest": request[@"candidateDigest"],
    @"inclusionAuthorizationId": request[@"inclusionAuthorizationId"],
    @"bootstrapCheckpoint": request[@"bootstrapCheckpoint"],
    @"sourcePolicyCommitment": request[@"sourcePolicyCommitment"],
    @"unsignedFundingEvidenceDigest": request[@"unsignedFundingEvidenceDigest"],
  };
  NSData *identityBytes = PACanonicalJSONData(identity, authority.maximumCanonicalBytes, NULL);
  if (canonical == nil || evidence == nil || identityBytes == nil
      || ![request[@"unsignedFundingEvidenceDigest"] isEqualToString:
        PASHA256Commitment(PAFundingEvidenceDomain, evidence)]
      || ![request[@"attestationId"] isEqualToString:
        PASHA256Commitment(PAAttestationIdentifierDomain, identityBytes)]
      || ![request[@"authorityRecordDigest"] isEqualToString:authority.recordDigest]
      || ![request[@"generationCommitment"] isEqualToString:authority.generationCommitment]
      || ![request[@"keyId"] isEqualToString:authority.keyIdentifier]
      || ![request[@"sourcePolicyCommitment"] isEqual:authority.fields[@"sourcePolicyCommitment"]]
      || ![request[@"bootstrapCheckpoint"] isEqual:authority.fields[@"bootstrapCheckpoint"]]) return NO;
  if (canonicalOutput != NULL) *canonicalOutput = canonical;
  return YES;
}

static NSString *PAOperationIdentifier(NSDictionary *wire) {
  NSDictionary *identity = @{
    @"protocolVersion": @1,
    @"authorityRecordDigest": wire[@"authorityRecordDigest"],
    @"generationCommitment": wire[@"generationCommitment"],
    @"keyId": wire[@"keyId"],
    @"attestationId": wire[@"attestationId"],
  };
  NSData *bytes = PACanonicalJSONData(identity, 4096U, NULL);
  return bytes == nil ? nil : PASHA256Commitment(PAOperationDomain, bytes);
}

PAParsedSigningRequest *PAParseSigningRequestFrame(
  NSData *frame,
  PAAuthority *authority,
  NSError **error
) {
  if (![frame isKindOfClass:[NSData class]] || authority == nil || frame.length < 5U
      || frame.length > PAProviderSigningWireRequestMaximumPayloadBytes + 4U) {
    PAFail(error, 20);
    return nil;
  }
  const uint8_t *bytes = frame.bytes;
  NSUInteger payloadLength = ((NSUInteger)bytes[0] << 24U)
    | ((NSUInteger)bytes[1] << 16U)
    | ((NSUInteger)bytes[2] << 8U)
    | (NSUInteger)bytes[3];
  if (payloadLength == 0U
      || payloadLength > PAProviderSigningWireRequestMaximumPayloadBytes
      || frame.length != payloadLength + 4U) {
    PAFail(error, 20);
    return nil;
  }
  NSData *payload = [frame subdataWithRange:NSMakeRange(4U, payloadLength)];
  id parsed = PAParseCanonicalJSONData(
    payload,
    PAProviderSigningWireRequestMaximumPayloadBytes,
    NULL
  );
  NSArray *wireKeys = @[
    @"protocolVersion", @"messageType", @"operationId", @"authorityRecordDigest",
    @"generationCommitment", @"keyId", @"attestationId", @"attestationRequest",
  ];
  uint64_t protocolVersion = 0U;
  if (![parsed isKindOfClass:[NSDictionary class]]
      || !PAExactKeys(parsed, wireKeys)
      || !PAInteger(parsed[@"protocolVersion"], YES, &protocolVersion)
      || protocolVersion != 1U
      || ![parsed[@"messageType"] isEqualToString:PAWireRequestType]
      || !PADigest(parsed[@"operationId"])
      || !PADigest(parsed[@"authorityRecordDigest"])
      || !PADigest(parsed[@"generationCommitment"])
      || !PAASCIIIdentifier(parsed[@"keyId"])
      || !PADigest(parsed[@"attestationId"])
      || ![parsed[@"attestationRequest"] isKindOfClass:[NSDictionary class]]) {
    PAFail(error, 20);
    return nil;
  }
  NSDictionary *wire = parsed;
  NSData *canonicalRequest = nil;
  NSDictionary *request = wire[@"attestationRequest"];
  NSString *operationIdentifier = PAOperationIdentifier(wire);
  if (!PAValidateAttestationRequest(request, authority, &canonicalRequest)
      || ![wire[@"authorityRecordDigest"] isEqual:request[@"authorityRecordDigest"]]
      || ![wire[@"generationCommitment"] isEqual:request[@"generationCommitment"]]
      || ![wire[@"keyId"] isEqual:request[@"keyId"]]
      || ![wire[@"attestationId"] isEqual:request[@"attestationId"]]
      || operationIdentifier == nil
      || ![wire[@"operationId"] isEqualToString:operationIdentifier]) {
    PAFail(error, 20);
    return nil;
  }
  PAParsedSigningRequest *result = [[PAParsedSigningRequest alloc] init];
  result.wireValue = wire;
  result.attestationRequest = request;
  result.canonicalWirePayload = payload;
  result.canonicalAttestationRequest = canonicalRequest;
  result.operationIdentifier = operationIdentifier;
  return result;
}

NSData *PACreateAttestationSigningBytes(
  PAParsedSigningRequest *request,
  uint64_t issuedAt,
  uint64_t validUntil,
  NSError **error
) {
  if (request == nil || issuedAt > 9007199254740991ULL
      || validUntil == 0U || validUntil > 9007199254740991ULL
      || validUntil <= issuedAt) {
    PAFail(error, 21);
    return nil;
  }
  NSDictionary *payload = @{
    @"signaturePayloadVersion": @1,
    @"algorithm": PAAlgorithm,
    @"request": request.attestationRequest,
    @"issuedAt": @(issuedAt),
    @"validUntil": @(validUntil),
  };
  NSData *canonical = PACanonicalJSONData(payload, 1024U * 1024U, NULL);
  if (canonical == nil) {
    PAFail(error, 21);
    return nil;
  }
  NSMutableData *output = [NSMutableData dataWithBytes:PASigningDomain
                                                length:sizeof(PASigningDomain) - 1U];
  [output appendData:canonical];
  return [output copy];
}

static BOOL PAValidateEnvelope(NSDictionary *envelope) {
  uint64_t version = 0U;
  uint64_t issuedAt = 0U;
  uint64_t validUntil = 0U;
  return PAExactKeys(envelope, @[
    @"envelopeVersion", @"attestationId", @"keyId", @"issuedAt", @"validUntil",
    @"signature",
  ])
    && PAInteger(envelope[@"envelopeVersion"], YES, &version)
    && version == 1U
    && PADigest(envelope[@"attestationId"])
    && PAASCIIIdentifier(envelope[@"keyId"])
    && PAInteger(envelope[@"issuedAt"], NO, &issuedAt)
    && PAInteger(envelope[@"validUntil"], YES, &validUntil)
    && validUntil > issuedAt
    && PADecodeBase64URL(envelope[@"signature"], 64U, NULL) != nil;
}

NSData *PAFrameSigningResponse(
  NSDictionary<NSString *, id> *response,
  NSUInteger maximumPayloadBytes,
  NSError **error
) {
  uint64_t version = 0U;
  if (!PAExactKeys(response, @[
    @"protocolVersion", @"messageType", @"operationId", @"status", @"reasonCode",
    @"envelope",
  ])
      || !PAInteger(response[@"protocolVersion"], YES, &version)
      || version != 1U
      || ![response[@"messageType"] isEqualToString:PAWireResponseType]
      || !PADigest(response[@"operationId"])) {
    PAFail(error, 22);
    return nil;
  }
  NSString *status = response[@"status"];
  id reason = response[@"reasonCode"];
  id envelope = response[@"envelope"];
  BOOL valid = NO;
  if ([status isEqualToString:@"READY"]) {
    valid = reason == [NSNull null]
      && [envelope isKindOfClass:[NSDictionary class]]
      && PAValidateEnvelope(envelope);
  } else if ([status isEqualToString:@"APPROVAL_REQUIRED"]) {
    valid = [reason isEqualToString:@"OPERATOR_APPROVAL_REQUIRED"]
      && envelope == [NSNull null];
  } else if ([status isEqualToString:@"REJECTED"]) {
    valid = ([reason isEqualToString:@"AUTHORITY_RETIRED"]
      || [reason isEqualToString:@"OPERATION_CONFLICT"]
      || [reason isEqualToString:@"POLICY_REJECTED"])
      && envelope == [NSNull null];
  }
  NSData *payload = valid ? PACanonicalJSONData(response, maximumPayloadBytes, NULL) : nil;
  if (payload == nil || payload.length > UINT32_MAX) {
    PAFail(error, 22);
    return nil;
  }
  uint32_t length = CFSwapInt32HostToBig((uint32_t)payload.length);
  NSMutableData *frame = [NSMutableData dataWithBytes:&length length:sizeof(length)];
  [frame appendData:payload];
  return [frame copy];
}
