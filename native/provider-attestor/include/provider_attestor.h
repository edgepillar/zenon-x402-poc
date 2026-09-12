#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT const NSUInteger PAProviderSigningWireRequestMaximumPayloadBytes;
FOUNDATION_EXPORT const NSUInteger PAProviderAttestationHardMaximumCanonicalBytes;

@interface PAAuthority : NSObject

@property(nonatomic, readonly) NSDictionary<NSString *, id> *fields;
@property(nonatomic, readonly) NSString *canonicalRecord;
@property(nonatomic, readonly) NSString *recordDigest;
@property(nonatomic, readonly) NSString *generationCommitment;
@property(nonatomic, readonly) NSString *keyIdentifier;
@property(nonatomic, readonly) NSData *publicKey;
@property(nonatomic, readonly) NSUInteger maximumCanonicalBytes;
@property(nonatomic, readonly) NSUInteger maximumValiditySeconds;

@end

@interface PAParsedSigningRequest : NSObject

@property(nonatomic, readonly) NSDictionary<NSString *, id> *wireValue;
@property(nonatomic, readonly) NSDictionary<NSString *, id> *attestationRequest;
@property(nonatomic, readonly) NSData *canonicalWirePayload;
@property(nonatomic, readonly) NSData *canonicalAttestationRequest;
@property(nonatomic, readonly) NSString *operationIdentifier;

@end

FOUNDATION_EXPORT NSData * _Nullable PACanonicalJSONData(
  id value,
  NSUInteger maximumBytes,
  NSError **error
);

FOUNDATION_EXPORT id _Nullable PAParseCanonicalJSONData(
  NSData *data,
  NSUInteger maximumBytes,
  NSError **error
);

FOUNDATION_EXPORT PAAuthority * _Nullable PAParseAuthorityRecord(
  NSString *canonicalRecord,
  NSError **error
);

FOUNDATION_EXPORT PAParsedSigningRequest * _Nullable PAParseSigningRequestFrame(
  NSData *frame,
  PAAuthority *authority,
  NSError **error
);

FOUNDATION_EXPORT NSData * _Nullable PACreateAttestationSigningBytes(
  PAParsedSigningRequest *request,
  uint64_t issuedAt,
  uint64_t validUntil,
  NSError **error
);

FOUNDATION_EXPORT NSData * _Nullable PAFrameSigningResponse(
  NSDictionary<NSString *, id> *response,
  NSUInteger maximumPayloadBytes,
  NSError **error
);

FOUNDATION_EXPORT NSString * _Nullable PABase64URLString(NSData *data);
FOUNDATION_EXPORT NSData * _Nullable PADecodeBase64URL(
  NSString *text,
  NSUInteger expectedLength,
  NSError **error
);
FOUNDATION_EXPORT NSString * PASHA256Commitment(NSString *domain, NSData *payload);

NS_ASSUME_NONNULL_END
