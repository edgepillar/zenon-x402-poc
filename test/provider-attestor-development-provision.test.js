import assert from 'node:assert/strict';
import nodeTest from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

import {
  parseDevelopmentProvisionPlanBytes,
} from '../native/provider-attestor/tests/development_testnet_provision_plan.mjs';
import {
  parseZenonFundingProviderAttestationAuthorityRecord,
} from '../src/service-credit-zenon-funding-provider-attestation.js';

const nativeDirectory = fileURLToPath(new URL('../native/provider-attestor/', import.meta.url));
const sourceFile = join(nativeDirectory, 'tests/development_testnet_provision_main.m');

function fixedFailure() {
  const error = new Error('DEVELOPMENT_PROVISION_TEST_FAILED');
  error.stack = 'DEVELOPMENT_PROVISION_TEST_FAILED';
  return error;
}

function test(name, callback, native = false) {
  return nodeTest(name, { timeout: 20_000 }, async t => {
    if (native && process.platform !== 'darwin') {
      t.skip('development provisioning native fixtures require macOS');
      return;
    }
    try { await callback(t); } catch { throw fixedFailure(); }
  });
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function syntheticTemplate() {
  return {
    authorityRecordVersion: 1,
    authorityProfileId: 'zenon.provider-attestation.synthetic',
    authorityProfileVersion: 1,
    verifierVersion: 1,
    providerAuthorityId: 'provider.synthetic.non-live',
    generationId: 'provider.synthetic.non-live.generation',
    generationVersion: 1,
    keyId: 'provider.synthetic.non-live.key',
    algorithm: 'Ed25519',
    network: 'zenon:testnet',
    chainProfile: { version: 1, chainIdentifier: '12345', genesisMomentumHash: '1'.repeat(64) },
    observerPolicy: { policyId: 'zenon.synthetic-observer', policyVersion: 1, verifierVersion: 1 },
    confirmationPolicy: {
      policyId: 'zenon.authenticated-momentum-inclusion', policyVersion: 1, minimumConfirmations: 3,
    },
    bootstrapCheckpoint: { height: 10, hash: 'a'.repeat(64) },
    sourcePolicyCommitment: `sha256:${'8'.repeat(64)}`,
    maximumAttestationBytes: 4096,
    maximumCanonicalBytes: 524288,
    maximumInitialAgeSeconds: 300,
    maximumFutureSkewSeconds: 5,
    maximumValiditySeconds: 300,
  };
}

// Inert native peer: it creates only task-owned directories and plain fixture
// bytes. It never loads a module, generates a key, approves, or signs.
const fakeBootstrapSource = String.raw`
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdint.h>
#include <spawn.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>
extern char **environ;
#if !defined(PA_DEV_PROVISION_OFFLINE_TEST) || !defined(PA_FAKE_MODE)
#error This bootstrap is an inert development provisioning test fixture
#endif
static int exact(int fd, const void *memory, size_t length) {
  const uint8_t *bytes = memory;
  size_t used = 0;
  while (used < length) {
    ssize_t count = write(fd, bytes + used, length - used);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return 0;
    used += (size_t)count;
  }
  return 1;
}
int main(int argc, const char *argv[]) {
  if (argc != 4 || environ == NULL || environ[0] != NULL) return 3;
  for (int fd = 3; fd <= 6; fd += 3) {
    errno = 0;
    if (fcntl(fd, F_GETFD) != -1 || errno != EBADF) return 3;
  }
  uint8_t pin[16];
  size_t used = 0;
  while (used < sizeof(pin)) {
    ssize_t count = read(5, pin + used, sizeof(pin) - used);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return 3;
    used += (size_t)count;
  }
  uint8_t extra;
  if (read(5, &extra, 1) != 0) return 3;
  for (size_t index = 0; index < sizeof(pin); index++) {
    if (pin[index] < '0' || pin[index] > '9') return 3;
  }
  memset(pin, 0, sizeof(pin));
  int root = open(argv[1], O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
  if (root < 0) return 3;
  int mark = openat(root, "bootstrap-once.bin", O_WRONLY | O_CREAT | O_EXCL, 0600);
  if (mark < 0 || !exact(mark, "ONCE", 4) || close(mark) != 0) return 3;
  if (mkdirat(root, "tokens", 0700) != 0) return 3;
  char contents[8192];
  int length = snprintf(contents, sizeof(contents),
    "directories.tokendir = %s/tokens\nobjectstore.backend = file\nlog.level = ERROR\n",
    PA_FAKE_MODE == 8 ? "wrong-owned-fixture-root" : argv[1]);
  int config = openat(root, "softhsm2.conf", O_WRONLY | O_CREAT | O_EXCL, 0600);
  if (length <= 0 || (size_t)length >= sizeof(contents) || config < 0
      || !exact(config, contents, (size_t)length) || close(config) != 0) return 3;
  close(root);
#if PA_FAKE_MODE == 7
  pid_t changed=-1;
  char *aclArgs[]={"/bin/chmod","+a","everyone deny delete",(char *)argv[1],NULL};
  char *aclEnvironment[]={NULL};
  int changedStatus=0;
  if(posix_spawn(&changed,"/bin/chmod",NULL,NULL,aclArgs,aclEnvironment)!=0)return 3;
  pid_t waited;
  do { waited=waitpid(changed,&changedStatus,0); } while(waited<0&&errno==EINTR);
  if(waited!=changed||!WIFEXITED(changedStatus)||WEXITSTATUS(changedStatus)!=0)return 3;
  int driftRoot=open(argv[1],O_RDONLY|O_DIRECTORY|O_NOFOLLOW);
  int drift=driftRoot<0?-1:openat(driftRoot,"acl-drift-applied.bin",O_WRONLY|O_CREAT|O_EXCL,0600);
  if(drift<0||!exact(drift,"DONE",4)||close(drift)!=0)return 3;
  close(driftRoot);
#endif
  (void)write(1, "INERT_STDOUT", 12);
  (void)write(2, "INERT_STDERR", 12);
#if PA_FAKE_MODE == 4
  sleep(3);
  return 3;
#elif PA_FAKE_MODE == 3
  return 3;
#else
  uint8_t metadata[65] = { 0 };
  for (size_t index = 0; index < 32; index++) metadata[index] = (uint8_t)(index + 1);
  for (size_t index = 0; index < 16; index++) metadata[32 + index] = (uint8_t)(index + 1);
  memcpy(metadata + 48, "1234567890ABCDEF", 16);
#if PA_FAKE_MODE == 6
  memset(metadata + 48, 0, 16);
#endif
  size_t size = PA_FAKE_MODE == 1 ? 63 : PA_FAKE_MODE == 2 ? 65 : 64;
  int sent = exact(4, metadata, size);
#if PA_FAKE_MODE == 5
  (void)sent;
  return 3;
#else
  return sent ? 0 : 3;
#endif
#endif
}
`;

function compile(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 15_000 });
  if (result.error !== undefined || result.status !== 0) throw fixedFailure();
}

function sameDirectory(path, identity) {
  const current = lstatSync(path);
  return current.isDirectory() && !current.isSymbolicLink()
    && current.uid === process.getuid() && (current.mode & 0o7777) === 0o700
    && current.dev === identity.dev && current.ino === identity.ino;
}

function fixture(t, mode = 0, separateImages = false) {
  const tag = randomBytes(8).toString('hex');
  const directory = `/private/tmp/ProviderAttestorDevelopmentProvisionTest-${tag}`;
  mkdirSync(directory, { mode: 0o700 });
  const identity = lstatSync(directory);
  const home = join(directory, 'Home');
  const library = join(home, 'Library');
  const support = join(library, 'Application Support');
  const base = join(support, 'ZenonX402');
  const nested = [home, library, support, base];
  const nestedIdentities = nested.map(path => {
    mkdirSync(path, { mode: 0o700 });
    return lstatSync(path);
  });
  const imageDirectory = separateImages ? join(directory, 'UnrelatedImages') : directory;
  if (separateImages) mkdirSync(imageDirectory, { mode: 0o700 });
  const root = join(base, 'ProviderAttestorDevelopmentTestnet');
  t.after(() => {
    if (!sameDirectory(directory, identity)) throw fixedFailure();
    for (let index = 0; index < nested.length; index += 1) {
      if (!sameDirectory(nested[index], nestedIdentities[index])) throw fixedFailure();
      compile('/bin/chmod', ['-N', nested[index]]);
    }
    for (const path of [imageDirectory, root, join(root, 'tokens'),
      join(root, 'generations'), join(root, 'generations', syntheticTemplate().generationId),
      join(root, 'configuration.json')]) {
      if (existsSync(path)) compile('/bin/chmod', ['-N', path]);
    }
    // This is exact inert-fixture disposal, never production recovery/retry.
    rmSync(directory, { recursive: true });
  });
  const fakeSource = join(directory, 'inert-bootstrap.c');
  const fake = join(imageDirectory, 'inert-bootstrap');
  const module = join(imageDirectory, 'inert-module');
  const verifier = join(imageDirectory, 'inert-unused-verifier');
  writeFileSync(fakeSource, fakeBootstrapSource, { mode: 0o600, flag: 'wx' });
  compile('/usr/bin/xcrun', [
    '--sdk', 'macosx', 'clang', '-std=c11', '-Wall', '-Wextra', '-Werror',
    '-DPA_DEV_PROVISION_OFFLINE_TEST=1', `-DPA_FAKE_MODE=${mode}`, fakeSource, '-o', fake,
  ]);
  writeFileSync(module, 'inert non-module bytes', { mode: 0o600, flag: 'wx' });
  writeFileSync(verifier, 'inert never-executed verifier bytes', { mode: 0o700, flag: 'wx' });
  const plan = {
    planVersion: 1,
    purpose: 'zenon-x402-development-testnet-disposable-provider-attestor',
    authorityRecordTemplate: syntheticTemplate(),
    bootstrapExecutable: { path: fake, sha256: digest(readFileSync(fake)) },
    module: { path: module, sha256: digest(readFileSync(module)) },
    validitySeconds: 120,
  };
  const planBytes = Buffer.from(canonical(plan));
  parseDevelopmentProvisionPlanBytes(planBytes);
  const definitions = {
    PA_DEV_PROVISION_PLAN_SHA256: digest(planBytes),
    PA_DEV_PROVISION_VERIFIER_PATH: verifier,
    PA_DEV_PROVISION_VERIFIER_SHA256: digest(readFileSync(verifier)),
    PA_DEV_PROVISION_TEST_TAG: tag,
  };
  const pins = join(directory, 'inert-pins.h');
  writeFileSync(pins, Object.entries(definitions)
    .map(([name, value]) => `#define ${name} ${JSON.stringify(value)}\n`).join(''),
  { mode: 0o600, flag: 'wx' });
  const build = join(directory, 'build');
  compile('/usr/bin/make', [
    '--silent', '-C', nativeDirectory, 'development-testnet-provision-test',
    `BUILD_DIR=${build}`, `DEV_PROVISION_PINS_HEADER=${pins}`,
  ]);
  return {
    directory, home, library, support, base, imageDirectory, fake, module, verifier,
    planBytes, pins, build, root,
    staging: join(base, 'ProviderAttestorDevelopmentTestnetStaging'),
    executable: join(build, 'provider-attestor-development-testnet-provision-test'),
  };
}

function invoke(target, pinBytes = Buffer.alloc(16, 49), planBytes = target.planBytes,
  beforeInput = null, launcher = null) {
  return new Promise((resolve, reject) => {
    let child;
    let settled = false;
    let timer;
    const stop = () => {
      if (child !== undefined && child.exitCode === null && child.signalCode === null) {
        try { child.kill('SIGKILL'); } catch {}
      }
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stop();
      reject(fixedFailure());
    };
    try {
      child = spawn(launcher ?? target.executable,
        launcher === null ? [] : [target.executable], {
          env: {}, stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'ignore', 'ignore', 'pipe'],
        });
      timer = setTimeout(fail, 8000);
      const stdout = [];
      const stderr = [];
      child.on('error', fail);
      for (const pipe of [child.stdout, child.stderr]) pipe.on('error', fail);
      for (const pipe of [child.stdio[3], child.stdio[6]]) {
        pipe.on('error', error => { if (error?.code !== 'EPIPE') fail(); });
      }
      child.stdout.on('data', bytes => stdout.push(bytes));
      child.stderr.on('data', bytes => stderr.push(bytes));
      child.on('close', (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ code, signal, stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8') });
      });
      if (beforeInput !== null) beforeInput();
      child.stdio[3].end(planBytes);
      child.stdio[6].end(pinBytes);
    } catch { fail(); }
  });
}

function expectResult(result, status) {
  assert.equal(result.code, status === 'PREPARED' ? 0 : 3);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, `DEVELOPMENT_PROVISION=${status}\n`);
  assert.equal(result.stderr, '');
}

// Isolated ACL API faults surround the included source only in this test-owned
// translation unit. No production switch or mutable hook selects them.
const aclProbeSource = String.raw`
#import <Foundation/Foundation.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/acl.h>
#include <unistd.h>
#if !defined(PA_DEV_PROVISION_OFFLINE_TEST) || !defined(PA_ACL_PROBE_FAULT)
#error This probe is an isolated inert ACL fixture
#endif
static int probeArmed;
static unsigned int exports;
static acl_t probeGetFD(int fd,acl_type_t type) {
  if(probeArmed&&PA_ACL_PROBE_FAULT==1){errno=EIO;return NULL;}
  return acl_get_fd_np(fd,type);
}
static int probeGetEntry(acl_t acl,int cursor,acl_entry_t *entry) {
  if(probeArmed&&PA_ACL_PROBE_FAULT==2){errno=EIO;return -1;}
  if(probeArmed&&PA_ACL_PROBE_FAULT==3){errno=EINVAL;return -1;}
  if(probeArmed&&PA_ACL_PROBE_FAULT==4){errno=0;return 1;}
  return acl_get_entry(acl,cursor,entry);
}
static int probePermissions(acl_entry_t entry,acl_permset_mask_t *permissions) {
  int result=acl_get_permset_mask_np(entry,permissions);
  if(probeArmed&&result==0&&PA_ACL_PROBE_FAULT==5)
    *permissions|=(acl_permset_mask_t)1U<<(sizeof(*permissions)*8U-1U);
  return result;
}
static int probeFlags(void *object,acl_flagset_t *flags) {
  if(probeArmed&&PA_ACL_PROBE_FAULT==6){errno=EIO;return -1;}
  return acl_get_flagset_np(object,flags);
}
static int probeValid(acl_t acl) {
  if(probeArmed&&PA_ACL_PROBE_FAULT==7){errno=EINVAL;return -1;}
  return acl_valid(acl);
}
static ssize_t probeExport(void *memory,acl_t acl,ssize_t length) {
  if(probeArmed&&PA_ACL_PROBE_FAULT==8){errno=EIO;return -1;}
  ssize_t result=acl_copy_ext_native(memory,acl,length);
  if(probeArmed&&result==length&&PA_ACL_PROBE_FAULT==9)return length+1;
  if(probeArmed&&result==length&&PA_ACL_PROBE_FAULT==10&&++exports==2)
    ((unsigned char *)memory)[0]^=1U;
  return result;
}
static int probeFree(void *memory) {
  int result=acl_free(memory);
  if(probeArmed&&PA_ACL_PROBE_FAULT==11)return -1;
  return result;
}
#define acl_get_fd_np probeGetFD
#define acl_get_entry probeGetEntry
#define acl_get_permset_mask_np probePermissions
#define acl_get_flagset_np probeFlags
#define acl_valid probeValid
#define acl_copy_ext_native probeExport
#define acl_free probeFree
#define main PAIncludedProvisionMain
PA_SOURCE_INCLUDE
#undef main
int main(int argc,const char *argv[]) {
  @autoreleasepool {
    if(argc!=3||!PACaptureDevelopmentAncestorScope(PABasePath()))return 3;
    BOOL accepted=NO;
    NSString *path=[NSString stringWithUTF8String:argv[2]];
    if(strcmp(argv[1],"ANCESTOR")==0) {
      int fd=open(argv[2],O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);
      if(fd<0)return 3;
      probeArmed=1;
      accepted=PAHasOnlyDevelopmentDeleteDenyACL(fd);
      probeArmed=0;
      if(close(fd)!=0)return 3;
    } else if(strcmp(argv[1],"DIRECTORY")==0) {
      int fd=PAOpenPrivateDirectory(path);
      accepted=fd>=0;
      if(fd>=0&&close(fd)!=0)return 3;
    } else if(strcmp(argv[1],"FILE")==0) {
      int parent=PAOpenPrivateDirectory([path stringByDeletingLastPathComponent]);
      if(parent<0)return 3;
      accepted=PAReadPrivateFile(parent,path.lastPathComponent,1024U)!=nil;
      if(close(parent)!=0)return 3;
    } else return 3;
    const char *result=accepted?"ACL_POLICY_PROBE=ACCEPTED\n":"ACL_POLICY_PROBE=REFUSED\n";
    write(1,result,strlen(result));
    return 0;
  }
}
`;

function aclProbe(target, fault = 0) {
  const file = join(target.directory, `inert-acl-probe-${fault}.m`);
  const executable = join(target.directory, `inert-acl-probe-${fault}`);
  writeFileSync(file, aclProbeSource.replace('PA_SOURCE_INCLUDE',
    `#import ${JSON.stringify(sourceFile)}`), { mode: 0o600, flag: 'wx' });
  compile('/usr/bin/xcrun', ['--sdk', 'macosx', 'clang', '-fobjc-arc', '-fblocks',
    '-std=c11', '-Wall', '-Wextra', '-Werror', '-Wpedantic', '-O2',
    `-I${join(nativeDirectory, 'include')}`, `-I${join(nativeDirectory, 'tests')}`,
    '-DPA_TESTING=1', '-DPA_DISPOSABLE_TOKEN_SIGNING_TEST=1',
    '-DPA_DEVELOPMENT_TESTNET_PROVISION=1', '-DPA_DEV_PROVISION_FAKE_UI=1',
    '-DPA_DEV_PROVISION_OFFLINE_TEST=1', `-DPA_ACL_PROBE_FAULT=${fault}`,
    '-include', target.pins, join(nativeDirectory, 'src/provider_attestor_protocol.m'),
    file, '-framework', 'Foundation', '-o', executable]);
  return (kind, path, accepted = false) => {
    const result = spawnSync(executable, [kind, path], {
      env: {}, encoding: 'utf8', timeout: 2000,
    });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, `ACL_POLICY_PROBE=${accepted ? 'ACCEPTED' : 'REFUSED'}\n`);
  };
}

test('development provisioner stays opt-in, fixed-profile and separate from release', () => {
  const source = readFileSync(sourceFile, 'utf8');
  const makefile = readFileSync(join(nativeDirectory, 'Makefile'), 'utf8');
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  assert.match(source, /PA_DEVELOPMENT_TESTNET_PROVISION/);
  assert.match(source, /PA_DEV_PROVISION_FAKE_UI.*PA_DEV_PROVISION_OFFLINE_TEST/s);
  assert.match(source, /PA_DEV_PROVISION_TEST_TAG/);
  assert.match(source, /PAParseAuthorityRecord/);
  assert.match(source, /PAParseCanonicalJSONData/);
  assert.match(source, /PAValidateDisposableModuleBytes/);
  assert.match(source, /PAHasNoExtendedACL/);
  assert.match(source, /PADevelopmentAncestorPaths = @\[ home, library, support \]/);
  assert.match(source, /tag == ACL_EXTENDED_DENY/);
  assert.match(source, /permissions == \(acl_permset_mask_t\)ACL_DELETE/);
  assert.match(source, /acl_clear_flags_np\(flags\) == 0/);
  assert.match(source, /acl_copy_ext_native\(left, original, length\) == length/);
  assert.match(source, /memcmp\(left, right, \(size_t\)length\) == 0/);
  assert.match(source, /PACaptureDevelopmentAncestorScope\(basePath\)/);
  assert.match(source, /NSSecureTextField/);
  assert.match(source, /addButtonWithTitle:@"Cancel"/);
  assert.match(source, /POSIX_SPAWN_CLOEXEC_DEFAULT/);
  assert.match(source, /PAPrivateInputChannel/);
  assert.match(source, /type == SOCK_STREAM/);
  assert.match(source, /&& getpeername\(descriptor, \(struct sockaddr \*\)&peer, &peerLength\) == 0/);
  assert.match(source, /address->sun_family != AF_UNIX/);
  assert.match(source, /length < prefix \|\| length > sizeof\(\*address\)/);
  assert.match(source, /address->sun_path\[index\] != '\\0'/);
  assert.match(source, /PAUnnamedLocalAddress\(&local, localLength\)/);
  assert.match(source, /PAUnnamedLocalAddress\(&peer, peerLength\)/);
  assert.match(source, /char \*emptyEnvironment\[\] = \{ NULL \}/);
  assert.doesNotMatch(source, /\b(?:system|popen|posix_spawnp|dlopen|C_Sign|SecItem|LAContext|getenv)\s*\(/);
  assert.doesNotMatch(/^all:[^\n]*/m.exec(makefile)[0], /provision/);
  const release = /^\$\(BUILD_DIR\)\/provider-attestor-release-candidate:[^\n]*\n\t[^\n]*/m.exec(makefile)[0];
  assert.doesNotMatch(release, /provision|DEV_PROVISION/);
  assert.doesNotMatch(packageText, /development-testnet-provision|development_testnet_provision_main/);
});

test('development provisioner cancels or rejects invalid private input before effects', async t => {
  const target = fixture(t);
  for (const [input, status] of [
    [Buffer.alloc(0), 'CANCELLED'], [Buffer.alloc(15, 49), 'REFUSED'],
    [Buffer.alloc(16, 65), 'REFUSED'], [Buffer.alloc(17, 49), 'REFUSED'],
  ]) {
    expectResult(await invoke(target, input), status);
    assert.equal(existsSync(target.root), false);
    assert.equal(existsSync(target.staging), false);
  }
}, true);

test('development provisioner refuses changed or noncanonical plan and pinned images', async t => {
  const target = fixture(t);
  const changed = Buffer.from(target.planBytes);
  changed[changed.length - 1] = 32;
  for (const bytes of [changed, Buffer.concat([target.planBytes, Buffer.from('\n')]),
    Buffer.alloc(64 * 1024 + 1, 49)]) {
    expectResult(await invoke(target, Buffer.alloc(16, 49), bytes), 'REFUSED');
    assert.equal(existsSync(target.root), false);
  }
  chmodSync(target.module, 0o666);
  expectResult(await invoke(target), 'REFUSED');
  chmodSync(target.module, 0o600);
  writeFileSync(target.module, 'changed inert module bytes');
  expectResult(await invoke(target), 'REFUSED');
  assert.equal(existsSync(target.root), false);
}, true);

test('development provisioner refuses existing output, symlink and unsafe base before effects', async t => {
  const target = fixture(t);
  mkdirSync(target.staging, { mode: 0o700 });
  expectResult(await invoke(target), 'REFUSED');
  rmSync(target.staging, { recursive: true });
  symlinkSync(target.module, target.root);
  expectResult(await invoke(target), 'REFUSED');
  rmSync(target.root);
  chmodSync(target.base, 0o755);
  expectResult(await invoke(target), 'REFUSED');
  chmodSync(target.base, 0o700);
  assert.equal(existsSync(target.root), false);
}, true);

test('development provisioner rejects inherited extended ACL on the exact test base', async t => {
  const target = fixture(t);
  const changed = spawnSync('/bin/chmod', ['+a', 'everyone deny delete', target.base],
    { encoding: 'utf8', timeout: 2000 });
  assert.equal(changed.status, 0);
  try {
    expectResult(await invoke(target), 'REFUSED');
    assert.equal(existsSync(target.root), false);
  } finally {
    compile('/bin/chmod', ['-N', target.base]);
  }
}, true);

test('development provisioner accepts only protective delete-deny ACLs on fixed nonprivate ancestry', async t => {
  const target = fixture(t);
  for (const path of [target.home, target.library, target.support]) {
    compile('/bin/chmod', ['+a', 'everyone deny delete', path]);
  }
  const result = await invoke(target);
  if (result.code === 3 && result.stdout === 'DEVELOPMENT_PROVISION=REFUSED\n'
    && result.stderr === '' && !existsSync(target.root)) {
    t.diagnostic('ELIGIBLE_DELETE_DENY_REFUSED_BEFORE_EFFECTS');
  }
  expectResult(result, 'PREPARED');
  assert.equal(readFileSync(join(target.root, 'bootstrap-once.bin')).length, 4);
  expectResult(await invoke(target), 'REFUSED');
  assert.equal(readFileSync(join(target.root, 'bootstrap-once.bin')).length, 4);
}, true);

test('development provisioner rejects grants, additional permissions and every supported ancestry flag', async t => {
  const target = fixture(t);
  for (const entry of ['everyone allow delete', 'everyone deny read',
    'everyone deny delete,write', 'everyone deny delete,delete_child',
    'everyone deny delete,file_inherit', 'everyone deny delete,directory_inherit',
    'everyone deny delete,file_inherit,limit_inherit',
    'everyone deny delete,file_inherit,only_inherit', 'everyone deny delete,inherited']) {
    compile('/bin/chmod', ['+a', entry, target.home]);
    try {
      expectResult(await invoke(target), 'REFUSED');
      assert.equal(existsSync(target.root), false);
    } finally { compile('/bin/chmod', ['-N', target.home]); }
  }
  compile('/bin/chmod', ['+a', 'everyone deny delete', target.home]);
  compile('/bin/chmod', ['+a', 'everyone allow read', target.home]);
  expectResult(await invoke(target), 'REFUSED');
  assert.equal(existsSync(target.root), false);
}, true);

test('development provisioner retains empty ACL requirements on every private directory and record', t => {
  const target = fixture(t);
  mkdirSync(target.root, { mode: 0o700 });
  const tokens = join(target.root, 'tokens');
  const generations = join(target.root, 'generations');
  const generation = join(generations, syntheticTemplate().generationId);
  for (const path of [tokens, generations, generation]) mkdirSync(path, { mode: 0o700 });
  const probe = aclProbe(target);
  for (const path of [target.base, target.root, tokens, generations, generation]) {
    probe('DIRECTORY', path, true);
    compile('/bin/chmod', ['+a', 'everyone deny delete', path]);
    try { probe('DIRECTORY', path); }
    finally { compile('/bin/chmod', ['-N', path]); }
  }
  const record = join(target.root, 'configuration.json');
  writeFileSync(record, 'inert private record', { mode: 0o600, flag: 'wx' });
  probe('FILE', record, true);
  compile('/bin/chmod', ['+a', 'everyone deny delete', record]);
  try { probe('FILE', record); }
  finally { compile('/bin/chmod', ['-N', record]); }
}, true);

test('development provisioner refuses delete-deny ACLs on unrelated image ancestry and image leaves', async t => {
  const target = fixture(t, 0, true);
  compile('/bin/chmod', ['+a', 'everyone deny delete', target.imageDirectory]);
  try {
    expectResult(await invoke(target), 'REFUSED');
    assert.equal(existsSync(target.root), false);
  } finally { compile('/bin/chmod', ['-N', target.imageDirectory]); }
  for (const path of [target.fake, target.module, target.verifier]) {
    compile('/bin/chmod', ['+a', 'everyone deny delete', path]);
    try {
      expectResult(await invoke(target), 'REFUSED');
      assert.equal(existsSync(target.root), false);
    } finally { compile('/bin/chmod', ['-N', path]); }
  }
}, true);

test('development provisioner preserves UNKNOWN and refuses retry after private root ACL drift', async t => {
  const target = fixture(t, 7);
  expectResult(await invoke(target), 'UNKNOWN');
  assert.equal(readFileSync(join(target.root, 'acl-drift-applied.bin')).toString(), 'DONE');
  assert.equal(readFileSync(join(target.root, 'bootstrap-once.bin')).toString(), 'ONCE');
  assert.equal(existsSync(join(target.root, 'provision-manifest.json')), false);
  expectResult(await invoke(target), 'REFUSED');
  assert.equal(readFileSync(join(target.root, 'bootstrap-once.bin')).toString(), 'ONCE');
}, true);

for (const [fault, label] of [[1, 'retrieval failure'], [2, 'enumeration failure'],
  [3, 'premature enumeration end'], [4, 'unexpected enumeration result'],
  [5, 'unknown permission mask'], [6, 'flag inspection failure'],
  [7, 'malformed ACL'], [8, 'export failure'], [9, 'unexpected export length'],
  [10, 'comparison mismatch'], [11, 'release failure']]) {
  test(`development ancestor ACL inspection refuses ${label}`, t => {
    const target = fixture(t);
    compile('/bin/chmod', ['+a', 'everyone deny delete', target.home]);
    aclProbe(target, fault)('ANCESTOR', target.home);
    assert.equal(existsSync(target.root), false);
  }, true);
}

test('development provisioner prepares consistent real-shape public artifacts once without a journal request', async t => {
  const target = fixture(t);
  expectResult(await invoke(target), 'PREPARED');
  const configBytes = readFileSync(join(target.root, 'configuration.json'));
  const config = JSON.parse(configBytes.toString('utf8'));
  assert.equal(canonical(config), configBytes.toString('utf8'));
  const authority = parseZenonFundingProviderAttestationAuthorityRecord(config.authorityRecord);
  assert.equal(authority.publicKey, Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1))
    .toString('base64url'));
  assert.equal(config.authorityRecordDigest, authority.authorityRecordDigest);
  assert.equal(config.generationCommitment, authority.authorityGeneration.generationCommitment);
  assert.equal(config.pkcs11.modulePath, target.module);
  assert.equal(config.pkcs11.moduleSha256, digest(readFileSync(target.module)));
  assert.equal(config.pkcs11.tokenSerial, '1234567890ABCDEF');
  assert.equal(config.pkcs11.objectId, Buffer.from(Array.from({ length: 16 }, (_, i) => i + 1))
    .toString('base64url'));
  assert.equal(config.opensslVerifier.path, target.verifier);
  assert.equal(config.opensslVerifier.sha256, digest(readFileSync(target.verifier)));
  const manifestBytes = readFileSync(join(target.root, 'provision-manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(canonical(manifest), manifestBytes.toString('utf8'));
  assert.equal(manifest.status, 'PREREQUISITES_ONLY');
  assert.equal(manifest.configurationDigest, digest(Buffer.concat([
    Buffer.from('zenon-x402:provider-attestor-configuration-v1\0'), configBytes,
  ])));
  const pins = readFileSync(join(target.root, 'development-testnet-pins.h'), 'utf8');
  assert.ok(pins.includes(JSON.stringify(manifest.configurationDigest)));
  assert.ok(pins.includes(JSON.stringify(authority.authorityRecordDigest)));
  assert.ok(pins.includes(JSON.stringify(manifest.tokenConfigurationSha256)));
  for (const leaf of ['configuration.json', 'provision-manifest.json',
    'development-testnet-pins.h', 'bootstrap-metadata.bin', 'softhsm2.conf']) {
    assert.equal(lstatSync(join(target.root, leaf)).mode & 0o7777, 0o600);
  }
  assert.equal(lstatSync(target.root).mode & 0o7777, 0o700);
  assert.equal(readFileSync(join(target.root, 'bootstrap-once.bin')).length, 4);
  assert.equal(existsSync(join(target.root, 'generations', config.keyId)), false);
  assert.equal(existsSync(join(target.root, 'generations', authority.generationId,
    'journal.sqlite3')), false);
  assert.deepEqual(readdirSync(join(target.root, 'generations', authority.generationId)), []);
  const before = readFileSync(join(target.root, 'bootstrap-metadata.bin'));
  expectResult(await invoke(target), 'REFUSED');
  assert.ok(readFileSync(join(target.root, 'bootstrap-metadata.bin')).equals(before));
}, true);

for (const [mode, label] of [[1, 'short metadata'], [2, 'trailing metadata'],
  [3, 'no metadata'], [4, 'timeout'], [5, 'nonzero exit'], [6, 'invalid metadata'],
  [8, 'wrong token configuration']]) {
  test(`development provisioner preserves one-shot partial state after ${label}`, async t => {
    const target = fixture(t, mode);
    expectResult(await invoke(target), 'UNKNOWN');
    assert.equal(existsSync(target.root), true);
    assert.equal(readFileSync(join(target.root, 'bootstrap-once.bin')).length, 4);
    assert.equal(existsSync(join(target.root, 'provision-manifest.json')), false);
    expectResult(await invoke(target), 'REFUSED');
    assert.equal(readFileSync(join(target.root, 'bootstrap-once.bin')).length, 4);
  }, true);
}

for (const [mode, label] of [[1, 'ignored SIGCHLD'], [2, 'no-child-wait SIGCHLD']]) {
  test(`development provisioner restores exact child reaping under ${label}`, async t => {
    const target = fixture(t, 4);
    const launcher = join(target.directory, 'inert-launcher');
    compile('/usr/bin/xcrun', ['--sdk', 'macosx', 'clang', '-std=c11', '-Wall',
      '-Wextra', '-Werror', '-DPA_TESTING=1', '-DPA_GUI_BOOTSTRAP_OFFLINE_TEST=1',
      `-DPA_IGNORED_SIGCHLD_MODE=${mode}`,
      join(nativeDirectory, 'tests/ignored_sigchld_launcher_main.c'), '-o', launcher]);
    expectResult(await invoke(target, Buffer.alloc(16, 49), target.planBytes, null, launcher),
      'UNKNOWN');
    assert.equal(existsSync(target.root), true);
    expectResult(await invoke(target), 'REFUSED');
  }, true);
}
