import { Buffer } from 'node:buffer';

const HEADER_LIMIT = 4096;
const FRAME_LIMIT = 131072;

// Last successful frame only; returned records stay fresh and frozen.
let lastDecodedFrameJson;
let lastDecodedFrame;

// One successful raw header declaration for encoding; each frame stays fresh.
let lastEncodedHeadersJson;
let lastEncodedHeaders;

function boundedString(value, limit) {
  if (typeof value !== 'string') throw new TypeError();
  if (value.length > limit || Buffer.byteLength(value, 'utf8') > limit) {
    throw new RangeError();
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sortedHeaders(value) {
  if (!isRecord(value)) throw new TypeError();
  const names = Object.keys(value);
  if (names.length > 32) throw new RangeError();
  for (const name of names) {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || typeof value[name] !== 'string') {
      throw new TypeError();
    }
  }
  boundedString(JSON.stringify(value), HEADER_LIMIT);
  return Object.freeze(Object.fromEntries(names.sort().map(name => [name, value[name]])));
}

function makeFrame(status, headers, body) {
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 100 || status > 599) {
    throw new TypeError();
  }
  boundedString(body, FRAME_LIMIT);
  return Object.freeze({
    responseVersion: 1,
    qualification: 'UNQUALIFIED',
    authorization: 'NONE',
    status,
    headers: sortedHeaders(headers),
    body
  });
}

function serialize(frame) {
  // Body-literal lower bound only; preserve the final full-frame bounds.
  const body = frame.body;
  let units = 2, bytes = 2;
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    let u = 1, b = 1;
    if (c === 34 || c === 92 || c === 8 || c === 9 ||
        c === 10 || c === 12 || c === 13) u = b = 2;
    else if (c < 32) u = b = 6;
    else if (c >= 0xd800 && c <= 0xdbff) {
      const next = body.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        u = 2; b = 4; i++;
      } else u = b = 6;
    } else if (c >= 0xdc00 && c <= 0xdfff) u = b = 6;
    else b = c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    units += u; bytes += b;
    if (units > FRAME_LIMIT || bytes > FRAME_LIMIT) throw new RangeError();
  }
  const text = JSON.stringify(frame);
  boundedString(text, FRAME_LIMIT);
  return text;
}

// Pure declared data; no transport or custody assurance.
export function encodeServiceCreditPilotHistoryEnvelopeResponse(status, headersJson, body) {
  if (arguments.length !== 3) throw new TypeError();
  boundedString(headersJson, HEADER_LIMIT);
  const headers = lastEncodedHeaders && headersJson === lastEncodedHeadersJson
    ? lastEncodedHeaders : JSON.parse(headersJson);
  const frame = makeFrame(status, headers, body);
  if (JSON.stringify(headers) !== headersJson) throw new TypeError();
  const text = serialize(frame);
  lastEncodedHeadersJson = headersJson;
  lastEncodedHeaders = headers;
  return text;
}

export function decodeServiceCreditPilotHistoryEnvelopeResponse(frameJson) {
  if (arguments.length !== 1) throw new TypeError();
  boundedString(frameJson, FRAME_LIMIT);
  if (lastDecodedFrame && frameJson === lastDecodedFrameJson) {
    return Object.freeze({
      ...lastDecodedFrame,
      headers: Object.freeze({ ...lastDecodedFrame.headers })
    });
  }
  const value = JSON.parse(frameJson);
  if (!isRecord(value) || value.responseVersion !== 1 ||
      value.qualification !== 'UNQUALIFIED' || value.authorization !== 'NONE') {
    throw new TypeError();
  }
  const frame = makeFrame(value.status, value.headers, value.body);
  if (serialize(frame) !== frameJson) throw new TypeError();
  lastDecodedFrameJson = frameJson;
  lastDecodedFrame = frame;
  return frame;
}
