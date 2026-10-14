import { Buffer } from 'node:buffer';

// One last successful declaration; each caller still receives a fresh record.
let lastDeclaredHeadersJson;
let lastDeclaredHeaders;

/**
 * Opt-in conservative application DATA value-character syntax only.
 * Input: exactly one primitive canonical JSON string, at most 4096 UTF16
 * units and 4096 UTF8 bytes before parsing. The object has 0..32 fields in
 * ascending lexical order. Names match ^[a-z][a-z0-9-]{0,63}$; each value
 * is a primitive string of 0..2048 ASCII U+0020..U+007E characters.
 * Output: a new frozen null-prototype record with own string data fields.
 *
 * This is not an allowed-header set, authentication/custody, complete
 * HTTP/RFC validity, socket/server enforcement, a security-header policy
 * replacement, service acknowledgement/delivery or pilot acceptance.
 * It is not wired into any existing framing, receiver, owner or response
 * path. Those behaviors remain untouched. No actual HTTP is performed.
 */
export function parseDeclaredPilotHttpHeaders(headersJson) {
  if (arguments.length !== 1 || typeof headersJson !== 'string') {
    throw new TypeError('Expected exactly one primitive JSON string');
  }
  if (headersJson.length > 4096 || Buffer.byteLength(headersJson, 'utf8') > 4096) {
    throw new RangeError('Declared header input exceeds 4096 units or UTF8 bytes');
  }

  if (lastDeclaredHeaders && headersJson === lastDeclaredHeadersJson) {
    return Object.freeze(Object.assign(Object.create(null), lastDeclaredHeaders));
  }

  const parsed = JSON.parse(headersJson);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)
      || Object.getPrototypeOf(parsed) !== Object.prototype) {
    throw new TypeError('Expected a plain declared header object');
  }

  const names = Object.keys(parsed);
  if (names.length > 32) {
    throw new RangeError('Declared header count exceeds 32');
  }

  const record = Object.create(null);
  let previous = null;
  for (const name of names) {
    // Equivalent to the documented name profile, with no end-anchor ambiguity.
    if (name.length > 64 || !/^[a-z]/.test(name) || /[^a-z0-9-]/.test(name)) {
      throw new TypeError('Invalid declared header name');
    }
    if (previous !== null && name <= previous) {
      throw new TypeError('Declared header names are not in lexical order');
    }
    const value = parsed[name];
    if (typeof value !== 'string' || value.length > 2048 || /[^\x20-\x7e]/.test(value)) {
      throw new TypeError('Invalid declared header value');
    }
    record[name] = value;
    previous = name;
  }

  // Parsing collapses duplicate keys; this also rejects them, alternate
  // escapes and whitespace. Incoming declarations are never trimmed or sorted.
  if (JSON.stringify(record) !== headersJson) {
    throw new TypeError('Declared header JSON is not canonical');
  }
  const frozen = Object.freeze(record);
  lastDeclaredHeadersJson = headersJson;
  lastDeclaredHeaders = frozen;
  return frozen;
}
