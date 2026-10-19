// Node-only. Runtime enforces exact keys/byte limits; caller pins require independent custody.
type Binding = Readonly<Record<'requestId' | 'paymentHash' | 'origin' | 'contextId', string>>;
// Only originalBytes.requestBody permits canonical empty Base64; all fields stay required.
type Fields = Readonly<Record<'requestBody' | 'paymentPayload' | 'paymentRequirements' | 'context', string>>;
type Checkpoint = Readonly<{ version: 1; authorization: 'NONE'; binding: Binding; originalBytes: Fields; digests: Fields }>;
type Pins = Readonly<{ binding: Binding; digests: Fields }>;
export declare function captureOriginalPaymentCheckpoint(input: Readonly<{ binding: Binding; originalBytes: Fields }>): Readonly<{ checkpoint: Checkpoint; pins: Pins }>;
export declare function encodeOriginalPaymentCheckpoint(checkpoint: Checkpoint): string;
export declare function restoreOriginalPaymentCheckpoint(serialized: string, expectedPins: Pins): Checkpoint;
