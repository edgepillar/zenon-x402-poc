"""In-memory payloads; reads only the reviewed Python module source.

No application filesystem, key or network operation is entered.
"""
import hashlib
import importlib.util
import io
import json
import pathlib
import struct
import sys
import unittest
import zlib

_path = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'qualification_snapshot_codec.py'
_spec = importlib.util.spec_from_file_location('reviewed_snapshot_codec', _path)
codec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(codec)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def arbitrary_member(raw):
    z = zlib.compressobj(level=6, wbits=-15)
    return codec._HEADER + z.compress(raw) + z.flush() + struct.pack('<II', zlib.crc32(raw), len(raw))


class SnapshotCases(unittest.TestCase):
    def fixture(self, raw=b'{ "scope": "synthetic", "value": [1, true, null] }\n'):
        encoded = codec.encode_snapshot(raw)
        return raw, encoded, codec.snapshot_pins(encoded, raw)

    def refuse(self, encoded, raw, **changes):
        pins = dict(encoded_bytes=len(encoded), encoded_sha256=sha(encoded),
                    plain_bytes=len(raw), plain_sha256=sha(raw))
        pins.update(changes)
        with self.assertRaisesRegex(codec.SnapshotRefused, '^QUALIFICATION_SNAPSHOT_REFUSED$'):
            codec.decode_snapshot(encoded, **pins)

    def test_exact_bytes_whitespace_order_and_final_newline(self):
        raw, encoded, pins = self.fixture()
        self.assertEqual(codec.decode_snapshot(encoded, **pins), raw)
        self.assertNotEqual(json.dumps(json.loads(raw)).encode(), raw)

    def test_header_contains_no_filename_timestamp_or_optional_fields(self):
        _, encoded, _ = self.fixture()
        self.assertEqual(encoded[:10], b'\x1f\x8b\x08\x00\x00\x00\x00\x00\x00\xff')

    def test_same_pinned_runtime_repeats_same_output(self):
        raw, encoded, _ = self.fixture()
        self.assertEqual(codec.encode_snapshot(raw), encoded)

    def test_encode_plain_ceiling_is_enforced(self):
        raw, _, _ = self.fixture()
        with self.assertRaises(codec.SnapshotRefused):
            codec.encode_snapshot(raw, maximum_plain_bytes=len(raw)-1)

    def test_encode_encoded_ceiling_is_enforced(self):
        raw, encoded, _ = self.fixture()
        with self.assertRaises(codec.SnapshotRefused):
            codec.encode_snapshot(raw, maximum_encoded_bytes=len(encoded)-1)

    def test_both_exact_ceilings_are_accepted(self):
        raw, encoded, pins = self.fixture()
        self.assertEqual(codec.encode_snapshot(raw, maximum_plain_bytes=len(raw),
                         maximum_encoded_bytes=len(encoded)), encoded)
        self.assertEqual(codec.decode_snapshot(encoded, **pins), raw)

    def test_both_compressed_identity_pins_are_required(self):
        raw, encoded, _ = self.fixture()
        self.refuse(encoded, raw, encoded_bytes=len(encoded)+1)
        self.refuse(encoded, raw, encoded_sha256='0'*64)

    def test_both_plain_identity_pins_are_required(self):
        raw, encoded, _ = self.fixture()
        self.refuse(encoded, raw, plain_bytes=len(raw)+1)
        self.refuse(encoded, raw, plain_sha256='0'*64)

    def test_invalid_counts_boolean_and_ceiling_are_refused(self):
        raw, encoded, _ = self.fixture()
        for field in ['encoded_bytes', 'plain_bytes']:
            for value in [0, -1, True, 1.5, '1', codec.MAX_BYTES+1]:
                self.refuse(encoded, raw, **{field:value})

    def test_encode_limits_are_explicit_bounded_integers(self):
        raw, _, _ = self.fixture()
        for field in ['maximum_plain_bytes', 'maximum_encoded_bytes']:
            for value in [0, -1, True, 1.5, '1', codec.MAX_BYTES+1]:
                with self.assertRaises(codec.SnapshotRefused):
                    codec.encode_snapshot(raw, **{field:value})

    def test_decode_never_infers_a_missing_pin(self):
        _, encoded, pins = self.fixture()
        for name in pins:
            selected = dict(pins); del selected[name]
            with self.assertRaises(TypeError):
                codec.decode_snapshot(encoded, **selected)

    def test_noncanonical_digest_shapes_are_refused(self):
        raw, encoded, _ = self.fixture()
        for field in ['encoded_sha256', 'plain_sha256']:
            for value in ['', 'A'*64, '0'*63, 'sha256:'+'0'*64, None]:
                self.refuse(encoded, raw, **{field:value})

    def test_truncation_at_every_member_boundary_is_refused(self):
        raw, encoded, _ = self.fixture()
        for size in [1, 9, 10, len(encoded)-8, len(encoded)-1]:
            self.refuse(encoded[:size], raw)

    def test_changed_crc_and_size_trailers_are_refused(self):
        raw, encoded, _ = self.fixture()
        for at in [-8, -4, -1]:
            bad = bytearray(encoded); bad[at] ^= 1
            self.refuse(bytes(bad), raw)

    def test_trailing_bytes_are_not_silently_ignored(self):
        raw, encoded, _ = self.fixture()
        self.refuse(encoded+b'\x00', raw)

    def test_second_member_is_not_silently_accepted(self):
        raw, encoded, _ = self.fixture()
        self.refuse(encoded+encoded, raw)

    def test_optional_header_fields_are_not_accepted(self):
        raw, encoded, _ = self.fixture()
        bad = bytearray(encoded); bad[3] = 8
        self.refuse(bytes(bad[:10])+b'name\0'+bytes(bad[10:]), raw)

    def test_over_expansion_uses_declared_plain_bound(self):
        raw = b'{"value":"'+b'a'*262144+b'"}'
        encoded = codec.encode_snapshot(raw)
        self.refuse(encoded, raw, plain_bytes=32)

    def test_wrong_format_never_falls_back_to_plain_json_or_zlib(self):
        raw, _, _ = self.fixture()
        self.refuse(raw, raw)
        self.refuse(zlib.compress(raw), raw)

    def test_invalid_utf8_json_and_nonobject_roots_are_refused(self):
        for raw in [b'\xff', b'{', b'[]', b'"value"', b'null']:
            with self.assertRaises(codec.SnapshotRefused):
                codec.encode_snapshot(raw)
            self.refuse(arbitrary_member(raw), raw)

    def test_duplicate_keys_and_nonfinite_numbers_are_refused(self):
        for raw in [b'{"a":1,"a":2}', b'{"a":NaN}', b'{"a":Infinity}', b'{"a":1e9999}']:
            with self.assertRaises(codec.SnapshotRefused):
                codec.encode_snapshot(raw)
            self.refuse(arbitrary_member(raw), raw)

    def test_excessive_depth_and_node_count_are_refused(self):
        for raw in [b'{"a":'+b'['*65+b'0'+b']'*65+b'}',
                    b'{"a":['+b','.join([b'0']*65536)+b']}']:
            with self.assertRaises(codec.SnapshotRefused):
                codec.encode_snapshot(raw)
            self.refuse(arbitrary_member(raw), raw)

    def test_bytes_subclasses_and_mutable_inputs_are_refused(self):
        class Alternate(bytes):
            pass
        raw, encoded, pins = self.fixture()
        for value in [bytearray(raw), memoryview(raw), Alternate(raw)]:
            with self.assertRaises(codec.SnapshotRefused):
                codec.encode_snapshot(value)
        for value in [bytearray(encoded), memoryview(encoded), Alternate(encoded)]:
            with self.assertRaises(codec.SnapshotRefused):
                codec.decode_snapshot(value, **pins)

    def test_pin_factory_requires_actual_valid_roundtrip(self):
        raw, encoded, _ = self.fixture()
        with self.assertRaises(codec.SnapshotRefused):
            codec.snapshot_pins(encoded, raw+b' ')


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(SnapshotCases)
    sink = io.StringIO()
    result = unittest.TextTestRunner(stream=sink).run(suite)
    print(json.dumps(dict(qualification='BOUNDED_SOURCE_SNAPSHOT_CODEC_MEMORY',
          passed=result.testsRun-len(result.errors)-len(result.failures),
          failed=len(result.errors)+len(result.failures),
          cases=[name for name in unittest.defaultTestLoader.getTestCaseNames(SnapshotCases)],
          skipped=len(result.skipped), failureOutput=sink.getvalue() if not result.wasSuccessful() else '',
          applicationNativeExecutions=0, SDK=0, SQLite=0, sockets=0, keys=0,
          signatures=0, nonceSearches=0, actualPrepare=0, payouts=0)))
    if not result.wasSuccessful():
        sys.exit(1)
