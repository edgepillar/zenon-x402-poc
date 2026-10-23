# x402 runtime dependency contract

## Declared runtime layout

The real official x402 application modules import @x402/core. The manifest now
declares the SAME exact 2.23.0 version under dependencies rather than only
devDependencies. The root lock declaration agrees with the manifest, and the
existing core and zod 3.25.76 rows are no longer development-only. No other
dependency, resolved URL, artifact integrity string, override or version changes.

This is a source/lock correction, not an upgrade to 2.28.0, package installation,
publication to npm, SDK execution or proof of the installed namespace. The
repository stays private and the ordinary buyer/provider defaults do not change.

npm documents dev-only package descriptors and the separation between resolved
lock entries and packages physically installed under omit=dev. The two selected
runtime rows are explicit retained inputs, not a replacement npm resolver:
[lockfile format](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/),
[omit configuration](https://docs.npmjs.com/cli/v11/commands/npm-ci/#omit).

## Current-source checks

scripts/x402-runtime-dependency-contract.mjs parses bounded ASCII manifest and
lock JSON without importing dependencies. It requires the fixed core version,
runtime declaration, matching root maps, selected core/zod artifact pins and
non-dev/non-optional/non-link rows. It refuses extra or shadowed zod resolution.
Its verdict explicitly keeps ordinaryInstalledNamespaceQualified false.

The new immutable p0-current-p2-node24-v2 profile includes seven contract cases:

1. Actual manifest/lock acceptance with explicit non-installation boundaries.
2. Missing, floating, development, peer or optional core declarations.
3. Manifest/root lock, engine or dependency-map divergence.
4. Development, optional, link or installer-marked selected lock rows.
5. Changed versions, resolved tarball locations or retained integrity strings.
6. Changed, extra or shadowed transitive zod resolution.
7. Malformed, oversized, non-ASCII or non-object input text.

The same profile separately selects twelve profile-contract cases, the actual
accepted-run receipt regression and seven actual declared-interface abort-drain
composition cases. The complete selection is 27, not broad test discovery.
The v1 recipe and results retain their original source pins unchanged.

## Evidence and remaining gates

On 2026-10-23 the complete v2 selection ran once with Node 24.19.0 on
darwin-arm64: 27/27 passed with complete streams and empty stderr. Source and
manifest pins, all five closed records and both exact streams were reviewed
separately. See qualification/current-p2-profile-v2.actual-local-result.json.
This includes the seven runtime-dependency source/lock cases, not installation.

An authored validator or profile alone is not an executed result.
A successful selected command must finish both streams, pass every named case
without skips/cancellation and recheck exact current source identities and hashes.
The default Node argv is source-pinned; running it directly does not prove npm
CLI behavior or install anything.

An actual reviewed omit=dev install, artifact inspection and ordinary Node
namespace resolution remain a separate qualification with no implicit install
permission. The source-pinned package facade used by earlier x402 experiments
is not that qualification. New package/source metadata also makes earlier
whole-source experiment pins historical; their results are not repinned or
silently transferred to this generation.

Native HTTPS, V6 custody, full funding-to-service composition, hosted CI and the
economic pilot remain separate. No installation, live chain, payment, signing,
nonce search, real PREPARE or provider authority is introduced by this change.
