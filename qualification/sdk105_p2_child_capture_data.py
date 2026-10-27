"""Private transcript DATA decoding only; no process, store or SDK access."""
import base64
import hashlib
import json


def require(value, code):
    if not value:
        raise ValueError(code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def child_capture_data(stdout):
    """Reconstruct retained private bytes; framed DATA alone is not native proof."""
    require(type(stdout) is bytes and len(stdout) <= 524288, 'P2_PRIVATE_TRANSCRIPT_BOUND')
    prefix = '# sdk105-p2-private-child-capture-v1 '
    roles, output_bytes = {}, 0
    def fields(value, names):
        require(type(value) is dict and set(value) == set(names), 'P2_PRIVATE_FRAME_FIELDS')
    def pairs(items):
        out = {}
        for key, value in items:
            require(key not in out, 'P2_PRIVATE_DUPLICATE_KEY'); out[key] = value
        return out
    for line in stdout.decode('utf8').splitlines(keepends=True):
        if not line.startswith(prefix):
            continue
        output_bytes += len(line.encode())
        require(output_bytes <= 458752 and line.endswith('\n'), 'P2_PRIVATE_FRAME_BOUNDARY')
        frame = json.loads(line[len(prefix):], object_pairs_hook=pairs)
        require(type(frame) is dict and type(frame.get('version')) is int and frame['version'] == 1,
            'P2_PRIVATE_FRAME_VERSION')
        name = frame.get('role'); require(name in ('funding-child','recovery-child'), 'P2_PRIVATE_FRAME_ROLE')
        if name not in roles:
            require(name == ('funding-child','recovery-child')[len(roles)] and
                (not roles or roles['funding-child']['closed']), 'P2_PRIVATE_ROLE_ORDER')
            roles[name] = dict(closed=False, stdout=bytearray(), stderr=bytearray(), stdoutEof=False, stderrEof=False)
        row = roles[name]; require(not row['closed'], 'P2_PRIVATE_DATA_AFTER_CLOSE')
        kind = frame.get('kind')
        if kind in ('bytes','eof'):
            stream = frame.get('stream'); require(stream in ('stdout','stderr') and not row[stream+'Eof'], 'P2_PRIVATE_STREAM_ORDER')
            if kind == 'bytes':
                fields(frame, ('version','kind','role','stream','offset','base64'))
                encoded = frame['base64']
                require(type(encoded) is str and 0 < len(encoded) <= 87384 and type(frame['offset']) is int
                    and frame['offset'] == len(row[stream]), 'P2_PRIVATE_PREFIX_OFFSET')
                try:
                    raw = base64.b64decode(encoded, validate=True)
                except ValueError:
                    raise ValueError('P2_PRIVATE_BASE64') from None
                require(raw and base64.b64encode(raw).decode('ascii') == encoded
                    and len(row[stream]) + len(raw) <= 65536, 'P2_PRIVATE_RAW_PREFIX_CAP')
                row[stream].extend(raw)
            else:
                fields(frame, ('version','kind','role','stream')); row[stream+'Eof'] = True
        else:
            fields(frame, ('version','kind','role','complete','exitCode','exitSignal','closeCode','closeSignal','stdout','stderr'))
            require(kind == 'close' and frame['complete'] is True, 'P2_PRIVATE_CLOSE_REQUIRED')
            for stream in ('stdout','stderr'):
                facts = frame[stream]; fields(facts, ('observedBytes','retainedBytes','eof','sha256','overflow'))
                require(row[stream+'Eof'] and type(facts['observedBytes']) is int and type(facts['retainedBytes']) is int
                    and facts['observedBytes'] == facts['retainedBytes'] == len(row[stream])
                    and facts['eof'] is True and facts['overflow'] is False and facts['sha256'] == sha(row[stream]),
                    'P2_PRIVATE_STREAM_DIGEST_OR_EOF')
            code, signal = (None,'SIGKILL') if name == 'funding-child' else (0,None)
            require(type(frame['exitCode']) is type(code) and frame['exitCode'] == frame['closeCode'] == code
                and type(frame['closeCode']) is type(code) and frame['exitSignal'] == frame['closeSignal'] == signal,
                'P2_PRIVATE_MATCHING_CHILD_EXIT')
            row['closed'] = True; row['receipt'] = frame
    require(list(roles) == ['funding-child','recovery-child'] and all(row['closed'] for row in roles.values()),
        'P2_PRIVATE_INCOMPLETE_CHILD_TRANSCRIPT')
    return dict(roles=roles, outputBytes=output_bytes, evidence='CALLER_SUPPLIED_PRIVATE_STREAM_DATA_NOT_NATIVE_PROOF')

