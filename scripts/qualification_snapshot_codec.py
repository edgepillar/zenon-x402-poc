"""Bounded, lossless encoding of NEW source-qualification JSON snapshots.

Both compressed and plain byte counts and SHA-256 pins are mandatory on decode.
Pins establish byte identity, not authorship, trust, freshness or qualification.
This module performs no file, network, storage-manager or application operation.
Historical inputs must remain intact. Allocate/retain outputs through the
approved task-storage manager; never replace a historical report with this API.
"""
import hashlib
import json
import math
import re
import struct
import zlib

FORMAT = 'bounded-gzip-json-source-snapshot-v1'
MAX_BYTES = 1048576
MAX_DEPTH = 64
MAX_NODES = 65536
_DIGEST = re.compile(r'^[0-9a-f]{64}$')
_HEADER = b'\x1f\x8b\x08\x00\x00\x00\x00\x00\x00\xff'


class SnapshotRefused(ValueError):
    """A fixed diagnostic: never include private source bytes in the exception."""


def _refuse():
    raise SnapshotRefused('QUALIFICATION_SNAPSHOT_REFUSED') from None


def _count(value):
    if type(value) is not int or value < 1 or value > MAX_BYTES:
        _refuse()
    return value


def _digest(value):
    if type(value) is not str or _DIGEST.fullmatch(value) is None:
        _refuse()
    return value


def _sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _object(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            _refuse()
        out[key] = value
    return out


def _constant(_value):
    _refuse()


def _json_object(raw):
    try:
        value = json.loads(raw.decode('utf8', 'strict'),
                           object_pairs_hook=_object, parse_constant=_constant)
        if type(value) is not dict:
            _refuse()
        pending = [(value, 0)]
        nodes = 0
        while pending:
            item, depth = pending.pop()
            nodes += 1
            if nodes > MAX_NODES or depth > MAX_DEPTH:
                _refuse()
            if type(item) is dict:
                pending.extend((child, depth + 1) for child in item.values())
            elif type(item) is list:
                pending.extend((child, depth + 1) for child in item)
            elif type(item) is float and not math.isfinite(item):
                _refuse()
        return value
    except (UnicodeError, ValueError, RecursionError, OverflowError):
        _refuse()


def encode_snapshot(raw, *, maximum_plain_bytes=MAX_BYTES,
                    maximum_encoded_bytes=MAX_BYTES):
    """Preserve original UTF-8 JSON bytes, including whitespace/key order.

The fixed header has no filename, timestamp or optional fields. DEFLATE bytes
are not promised identical across Python/zlib versions; retain the actual pin.
"""
    plain_limit = _count(maximum_plain_bytes)
    encoded_limit = _count(maximum_encoded_bytes)
    if type(raw) is not bytes or not 1 <= len(raw) <= plain_limit:
        _refuse()
    _json_object(raw)
    encoder = zlib.compressobj(level=6, wbits=-15)
    body = encoder.compress(raw) + encoder.flush()
    encoded = _HEADER + body + struct.pack('<II', zlib.crc32(raw), len(raw))
    if len(encoded) > encoded_limit:
        _refuse()
    return encoded


def decode_snapshot(encoded, *, encoded_bytes, encoded_sha256,
                    plain_bytes, plain_sha256):
    """Reject truncation, trailing/multiple members, bad pins and over-expansion.

At most declared plain_bytes + 1 bytes are requested from the decoder. Never
call an unbounded decompressor/flush, fall back to another format or accept a
partial result. No JSON reserialization substitutes for exact original bytes.
"""
    size = _count(encoded_bytes)
    plain_size = _count(plain_bytes)
    encoded_digest = _digest(encoded_sha256)
    plain_digest = _digest(plain_sha256)
    if type(encoded) is not bytes or len(encoded) != size or _sha(encoded) != encoded_digest:
        _refuse()
    if encoded[:len(_HEADER)] != _HEADER:
        _refuse()
    try:
        decoder = zlib.decompressobj(wbits=31)
        raw = decoder.decompress(encoded, plain_size + 1)
        if (len(raw) != plain_size or not decoder.eof or decoder.unused_data
                or decoder.unconsumed_tail or _sha(raw) != plain_digest):
            _refuse()
    except zlib.error:
        _refuse()
    _json_object(raw)
    return raw


def snapshot_pins(encoded, raw):
    """Byte pins for a just-produced output, with a mandatory verified roundtrip."""
    if type(encoded) is not bytes or type(raw) is not bytes:
        _refuse()
    pins = dict(encoded_bytes=len(encoded), encoded_sha256=_sha(encoded),
                plain_bytes=len(raw), plain_sha256=_sha(raw))
    if decode_snapshot(encoded, **pins) != raw:
        _refuse()
    return pins
