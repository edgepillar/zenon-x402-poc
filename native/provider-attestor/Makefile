SHELL := /bin/sh

BUILD_DIR ?= build
XCRUN := /usr/bin/xcrun
CLANG := $(XCRUN) --sdk macosx clang
COMMON_FLAGS := -fobjc-arc -fblocks -std=c11 -Wall -Wextra -Werror -Wpedantic -O2 -Iinclude
FOUNDATION := -framework Foundation
RUNTIME_LIBRARIES := $(FOUNDATION) -lsqlite3
APPROVAL_LIBRARIES := $(FOUNDATION) -framework AppKit -framework LocalAuthentication -framework Security
TEST_PIN_FLAGS := $(if $(TEST_PINS_HEADER),-include "$(TEST_PINS_HEADER)",)
DEV_TESTNET_PIN_FLAGS := $(if $(DEV_TESTNET_PINS_HEADER),-include "$(DEV_TESTNET_PINS_HEADER)",)
CHILD_TEST_PIN_FLAGS := $(if $(CHILD_TEST_PINS_HEADER),-include "$(CHILD_TEST_PINS_HEADER)",)
RELEASE_PIN_FLAGS := $(if $(RELEASE_PINS_HEADER),-include "$(RELEASE_PINS_HEADER)",)
BOOTSTRAP_GUI_PIN_FLAGS := $(if $(BOOTSTRAP_GUI_PINS_HEADER),-include "$(BOOTSTRAP_GUI_PINS_HEADER)",)

.PHONY: all conformance conformance-only conformance-test-child runtime-test disposable-token-bootstrap-test disposable-token-bootstrap-synthetic-gui disposable-token-bootstrap-synthetic-gui-fake-ui-test runtime-disposable-token-test development-testnet-child development-testnet-child-test development-testnet-synthetic-manual-gui development-testnet-synthetic-manual-gui-no-dialog-test signer-profile-test trusted-loader-test macos-approval-test manual-operator-acceptance manual-device-owner-only-app manual-operator-acceptance-syntax-check release-syntax-check release-candidate release-artifact-check clean
.PHONY: pinned-build-force release-pins-required

# A pin-header path can change to an older file while BUILD_DIR is reused.
# Rebuild every pinned target instead of trusting the previous artifact's mtime.
pinned-build-force:

release-pins-required:
	@test -n "$(RELEASE_PINS_HEADER)" && test -f "$(RELEASE_PINS_HEADER)"

all: conformance conformance-only

conformance: $(BUILD_DIR)/provider-attestor-conformance

# Protocol/FD smoke target only. The runtime and signer drafts are not linked.
conformance-only: $(BUILD_DIR)/provider-attestor-protocol-child-conformance-only

# Distinct synthetic authority-pinned child for parser/FD conformance only.
# Its pins are temporary test data and cannot enter a release build.
conformance-test-child: $(BUILD_DIR)/provider-attestor-protocol-child-synthetic-test

# Synthetic, injected runner only. Never part of the deployable/conformance-only child.
runtime-test: $(BUILD_DIR)/provider-attestor-runtime-test

# Explicit opt-in, test-only bridge from a fresh disposable SoftHSM key to the
# journaled READY frame. Neither target is part of all, release, or package scripts.
disposable-token-bootstrap-test: $(BUILD_DIR)/provider-attestor-disposable-token-bootstrap-test

# Opt-in synthetic/offline collector. Build only; never enters all/release/package.
disposable-token-bootstrap-synthetic-gui: $(BUILD_DIR)/provider-attestor-disposable-token-bootstrap-synthetic-gui
	@test -n "$(BOOTSTRAP_GUI_PINS_HEADER)" && test -f "$(BOOTSTRAP_GUI_PINS_HEADER)"

disposable-token-bootstrap-synthetic-gui-fake-ui-test: $(BUILD_DIR)/provider-attestor-disposable-token-bootstrap-synthetic-gui-fake-ui-test
	@test -n "$(BOOTSTRAP_GUI_PINS_HEADER)" && test -f "$(BOOTSTRAP_GUI_PINS_HEADER)"

runtime-disposable-token-test: $(BUILD_DIR)/provider-attestor-runtime-disposable-token-test

# Separately pinned, source-only development/testnet child. Never in all,
# release, or package scripts; building it does not run an operator dialog.
development-testnet-child: $(BUILD_DIR)/provider-attestor-development-testnet-child

# Fake-UI, compiled-temporary-root counterpart for offline tests only.
development-testnet-child-test: $(BUILD_DIR)/provider-attestor-development-testnet-child-test

# Opt-in synthetic/offline manual AppKit child with a compiled private test root.
# The no-dialog variant is for automated malformed/replay checks only.
development-testnet-synthetic-manual-gui: $(BUILD_DIR)/provider-attestor-development-testnet-synthetic-manual-gui

development-testnet-synthetic-manual-gui-no-dialog-test: $(BUILD_DIR)/provider-attestor-development-testnet-synthetic-manual-gui-no-dialog-test

# Dedicated disposable PKCS#11 profile probe; it never links into a release.
signer-profile-test: $(BUILD_DIR)/provider-attestor-signer-profile-test

# Synthetic Mach-O and owner-policy checks; no real module is loaded or signed.
trusted-loader-test: $(BUILD_DIR)/provider-attestor-trusted-loader-test

# System interfaces are replaced at compile time in this isolated mock runner.
# It never invokes a real LocalAuthentication prompt or Keychain lookup.
macos-approval-test: $(BUILD_DIR)/provider-attestor-macos-approval-test

# Manual, one-use local operator acceptance only. Never run this target from CI.
# Building it does not show a prompt or create a Keychain item.
manual-operator-acceptance: $(BUILD_DIR)/provider-attestor-manual-operator-acceptance

# Development-only LaunchServices activation context for the LA-only manual
# flag. The caller must supply an existing absolute temporary BUILD_DIR. The
# target refuses to overwrite an existing bundle and never enters all/release.
# Building this target does not launch the app or show any prompt.
manual-device-owner-only-app:
	@test "$(origin BUILD_DIR)" = "command line" || { /bin/echo "Pass BUILD_DIR=/absolute/temporary/directory on the make command line" >&2; exit 2; }
	@case "$(BUILD_DIR)" in /*) ;; *) /bin/echo "BUILD_DIR must be absolute" >&2; exit 2 ;; esac
	@test -d "$(BUILD_DIR)" || { /bin/echo "BUILD_DIR must already exist" >&2; exit 2; }
	@set -eu; bundle="$(BUILD_DIR)/ProviderAttestorManualDeviceOwnerOnly.app"; \
	  if test -e "$$bundle" || test -L "$$bundle"; then /bin/echo "MANUAL_APP_BUILD=FAIL_EXISTS" >&2; exit 2; fi; \
	  $(MAKE) --no-print-directory --silent "$(BUILD_DIR)/provider-attestor-manual-operator-acceptance" BUILD_DIR="$(BUILD_DIR)"; \
	  /bin/mkdir "$$bundle"; \
	  trap '/bin/rm -rf "$$bundle"' 0; \
	  /bin/mkdir -p "$$bundle/Contents/MacOS"; \
	  /bin/cp "$(BUILD_DIR)/provider-attestor-manual-operator-acceptance" "$$bundle/Contents/MacOS/provider-attestor-manual-operator-acceptance"; \
	  /bin/cp tests/ManualDeviceOwnerOnly-Info.plist "$$bundle/Contents/Info.plist"; \
	  /usr/bin/plutil -lint "$$bundle/Contents/Info.plist" >/dev/null; \
	  trap - 0; \
	  /bin/echo "MANUAL_APP_BUILD=PASS"

manual-operator-acceptance-syntax-check:
	$(CLANG) $(COMMON_FLAGS) -DPA_MANUAL_OPERATOR_ACCEPTANCE=1 -fsyntax-only src/provider_attestor_macos_approval.m tests/manual_operator_acceptance_main.m

# Syntax/strict-warning gate only, never a deployable signing artifact. No pins
# means an intentional compile failure; a release cannot inherit test defines.
release-syntax-check:
	$(CLANG) $(COMMON_FLAGS) -DPA_RELEASE_BUILD=1 $(RELEASE_PIN_FLAGS) -fsyntax-only src/provider_attestor_runtime.m src/provider_attestor_signer.m src/provider_attestor_macos_approval.m src/provider_attestor_release_child.m

# Buildable only with separately supplied pins. This candidate still has the
# unconditional signer-loader deny and must not be deployed.
release-candidate: $(BUILD_DIR)/provider-attestor-release-candidate
	@$(MAKE) release-artifact-check RELEASE_ARTIFACT="$(BUILD_DIR)/provider-attestor-release-candidate"

# For a separately pinned, built candidate, reject any test-only injection
# symbol or synthetic grant fixture in the exact artifact. This is not a
# substitute for independent pin/deployment review.
release-artifact-check:
	@test -n "$(RELEASE_ARTIFACT)" && test -f "$(RELEASE_ARTIFACT)"
	@! /usr/bin/nm -a "$(RELEASE_ARTIFACT)" | /usr/bin/grep -Eq 'PATest|PAFake|test_grant_adapter|macos_approval_main|runner_main|manual_operator_acceptance_main|PARunManualAcceptance'

$(BUILD_DIR):
	/bin/mkdir -p "$@"

$(BUILD_DIR)/provider-attestor-conformance: src/provider_attestor_protocol.m tests/conformance_main.m include/provider_attestor.h | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) src/provider_attestor_protocol.m tests/conformance_main.m $(FOUNDATION) -o "$@"

$(BUILD_DIR)/provider-attestor-protocol-child-conformance-only: src/provider_attestor_protocol.m src/provider_attestor_protocol_child.m include/provider_attestor.h | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) src/provider_attestor_protocol.m src/provider_attestor_protocol_child.m $(FOUNDATION) -o "$@"

$(BUILD_DIR)/provider-attestor-protocol-child-synthetic-test: src/provider_attestor_protocol.m src/provider_attestor_protocol_child.m include/provider_attestor.h $(CHILD_TEST_PINS_HEADER) pinned-build-force | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) -DPA_SYNTHETIC_CHILD_TESTING=1 $(CHILD_TEST_PIN_FLAGS) src/provider_attestor_protocol.m src/provider_attestor_protocol_child.m $(FOUNDATION) -o "$@"

$(BUILD_DIR)/provider-attestor-runtime-test: src/provider_attestor_protocol.m src/provider_attestor_runtime.m src/provider_attestor_signer.m tests/test_grant_adapter.m tests/runner_main.m tests/test_grant_adapter.h include/provider_attestor_runtime.h include/provider_attestor_private.h include/provider_attestor_private_acl.h $(TEST_PINS_HEADER) pinned-build-force | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) -Itests -DPA_TESTING=1 $(TEST_PIN_FLAGS) src/provider_attestor_protocol.m src/provider_attestor_runtime.m src/provider_attestor_signer.m tests/test_grant_adapter.m tests/runner_main.m $(RUNTIME_LIBRARIES) -o "$@"

$(BUILD_DIR)/provider-attestor-disposable-token-bootstrap-test: tests/disposable_token_bootstrap_main.m tests/disposable_token_module_integrity.h include/pkcs11_minimal.h include/provider_attestor_private_acl.h | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) -DPA_TESTING=1 -DPA_DISPOSABLE_TOKEN_SIGNING_TEST=1 tests/disposable_token_bootstrap_main.m $(FOUNDATION) -o "$@"

$(BUILD_DIR)/provider-attestor-disposable-token-bootstrap-synthetic-gui: tests/disposable_token_bootstrap_gui_main.m tests/disposable_token_module_integrity.h include/provider_attestor_private_acl.h $(BOOTSTRAP_GUI_PINS_HEADER) pinned-build-force | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) -DPA_TESTING=1 -DPA_DISPOSABLE_TOKEN_SIGNING_TEST=1 -DPA_SYNTHETIC_BOOTSTRAP_GUI=1 $(BOOTSTRAP_GUI_PIN_FLAGS) tests/disposable_token_bootstrap_gui_main.m $(FOUNDATION) -framework AppKit -o "$@"

$(BUILD_DIR)/provider-attestor-disposable-token-bootstrap-synthetic-gui-fake-ui-test: tests/disposable_token_bootstrap_gui_main.m tests/disposable_token_module_integrity.h include/provider_attestor_private_acl.h $(BOOTSTRAP_GUI_PINS_HEADER) pinned-build-force | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) -DPA_TESTING=1 -DPA_DISPOSABLE_TOKEN_SIGNING_TEST=1 -DPA_SYNTHETIC_BOOTSTRAP_GUI=1 -DPA_GUI_BOOTSTRAP_FAKE_UI=1 -DPA_GUI_BOOTSTRAP_OFFLINE_TEST=1 $(BOOTSTRAP_GUI_PIN_FLAGS) tests/disposable_token_bootstrap_gui_main.m $(FOUNDATION) -o "$@"

$(BUILD_DIR)/provider-attestor-runtime-disposable-token-test: src/provider_attestor_protocol.m src/provider_attestor_runtime.m src/provider_attestor_signer.m tests/test_grant_adapter.m tests/disposable_token_runtime_main.m tests/disposable_token_signer.m tests/disposable_token_signer.h tests/disposable_token_module_integrity.h tests/test_grant_adapter.h include/provider_attestor_runtime.h include/provider_attestor_private.h include/provider_attestor_private_acl.h include/pkcs11_minimal.h $(TEST_PINS_HEADER) pinned-build-force | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) -Itests -DPA_TESTING=1 -DPA_DISPOSABLE_TOKEN_SIGNING_TEST=1 -DPA_SIGNER_PROFILE_TESTING=1 -DPA_DISPOSABLE_SIGNER_TEST_FAULTS=1 $(TEST_PIN_FLAGS) src/provider_attestor_protocol.m src/provider_attestor_runtime.m src/provider_attestor_signer.m tests/test_grant_adapter.m tests/disposable_token_signer.m tests/disposable_token_runtime_main.m $(RUNTIME_LIBRARIES) -o "$@"

$(BUILD_DIR)/provider-attestor-development-testnet-child: src/provider_attestor_protocol.m src/provider_attestor_runtime.m src/provider_attestor_signer.m tests/disposable_token_signer.m tests/development_testnet_ui.m tests/development_testnet_child_main.m tests/disposable_token_signer.h tests/disposable_token_module_integrity.h tests/development_testnet_ui.h include/provider_attestor_runtime.h include/provider_attestor_private.h include/provider_attestor_private_acl.h include/pkcs11_minimal.h $(DEV_TESTNET_PINS_HEADER) pinned-build-force | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) -Itests -DPA_TESTING=1 -DPA_DEVELOPMENT_TESTNET_CHILD=1 -DPA_DISPOSABLE_TOKEN_SIGNING_TEST=1 -DPA_SIGNER_PROFILE_TESTING=1 $(DEV_TESTNET_PIN_FLAGS) src/provider_attestor_protocol.m src/provider_attestor_runtime.m src/provider_attestor_signer.m tests/disposable_token_signer.m tests/development_testnet_ui.m tests/development_testnet_child_main.m $(RUNTIME_LIBRARIES) -framework AppKit -o "$@"

$(BUILD_DIR)/provider-attestor-development-testnet-child-test: src/provider_attestor_protocol.m src/provider_attestor_runtime.m src/provider_attestor_signer.m tests/test_grant_adapter.m tests/disposable_token_signer.m tests/development_testnet_test_ui.m tests/development_testnet_child_main.m tests/disposable_token_signer.h tests/disposable_token_module_integrity.h tests/development_testnet_ui.h tests/test_grant_adapter.h include/provider_attestor_runtime.h include/provider_attestor_private.h include/provider_attestor_private_acl.h include/pkcs11_minimal.h $(DEV_TESTNET_PINS_HEADER) pinned-build-force | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) -Itests -DPA_TESTING=1 -DPA_DEVELOPMENT_TESTNET_CHILD=1 -DPA_DEVELOPMENT_TESTNET_TESTING=1 -DPA_DISPOSABLE_TOKEN_SIGNING_TEST=1 -DPA_SIGNER_PROFILE_TESTING=1 $(DEV_TESTNET_PIN_FLAGS) src/provider_attestor_protocol.m src/provider_attestor_runtime.m src/provider_attestor_signer.m tests/test_grant_adapter.m tests/disposable_token_signer.m tests/development_testnet_test_ui.m tests/development_testnet_child_main.m $(RUNTIME_LIBRARIES) -o "$@"

$(BUILD_DIR)/provider-attestor-development-testnet-synthetic-manual-gui: src/provider_attestor_protocol.m src/provider_attestor_runtime.m src/provider_attestor_signer.m tests/disposable_token_signer.m tests/development_testnet_ui.m tests/development_testnet_child_main.m tests/disposable_token_signer.h tests/disposable_token_module_integrity.h tests/development_testnet_ui.h include/provider_attestor_runtime.h include/provider_attestor_private.h include/provider_attestor_private_acl.h include/pkcs11_minimal.h $(DEV_TESTNET_PINS_HEADER) pinned-build-force | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) -Itests -DPA_TESTING=1 -DPA_DEVELOPMENT_TESTNET_CHILD=1 -DPA_SYNTHETIC_MANUAL_GUI_TESTING=1 -DPA_DISPOSABLE_TOKEN_SIGNING_TEST=1 -DPA_SIGNER_PROFILE_TESTING=1 $(DEV_TESTNET_PIN_FLAGS) src/provider_attestor_protocol.m src/provider_attestor_runtime.m src/provider_attestor_signer.m tests/disposable_token_signer.m tests/development_testnet_ui.m tests/development_testnet_child_main.m $(RUNTIME_LIBRARIES) -framework AppKit -o "$@"

$(BUILD_DIR)/provider-attestor-development-testnet-synthetic-manual-gui-no-dialog-test: src/provider_attestor_protocol.m src/provider_attestor_runtime.m src/provider_attestor_signer.m tests/disposable_token_signer.m tests/development_testnet_ui.m tests/development_testnet_child_main.m tests/disposable_token_signer.h tests/disposable_token_module_integrity.h tests/development_testnet_ui.h include/provider_attestor_runtime.h include/provider_attestor_private.h include/provider_attestor_private_acl.h include/pkcs11_minimal.h $(DEV_TESTNET_PINS_HEADER) pinned-build-force | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) -Itests -DPA_TESTING=1 -DPA_DEVELOPMENT_TESTNET_CHILD=1 -DPA_SYNTHETIC_MANUAL_GUI_TESTING=1 -DPA_SYNTHETIC_MANUAL_NO_DIALOG_TESTING=1 -DPA_DISPOSABLE_TOKEN_SIGNING_TEST=1 -DPA_SIGNER_PROFILE_TESTING=1 $(DEV_TESTNET_PIN_FLAGS) src/provider_attestor_protocol.m src/provider_attestor_runtime.m src/provider_attestor_signer.m tests/disposable_token_signer.m tests/development_testnet_ui.m tests/development_testnet_child_main.m $(RUNTIME_LIBRARIES) -framework AppKit -o "$@"

$(BUILD_DIR)/provider-attestor-signer-profile-test: src/provider_attestor_protocol.m src/provider_attestor_signer.m tests/signer_profile_main.m include/pkcs11_minimal.h include/provider_attestor_private.h | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) -I/opt/homebrew/include -DPA_SIGNER_PROFILE_TESTING=1 src/provider_attestor_protocol.m src/provider_attestor_signer.m tests/signer_profile_main.m $(FOUNDATION) -L/opt/homebrew/lib -lcrypto -o "$@"

$(BUILD_DIR)/provider-attestor-trusted-loader-test: src/provider_attestor_protocol.m src/provider_attestor_signer.m tests/trusted_loader_main.m include/provider_attestor_private.h | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) -DPA_SIGNER_LOADER_TESTING=1 src/provider_attestor_protocol.m src/provider_attestor_signer.m tests/trusted_loader_main.m $(FOUNDATION) -o "$@"

$(BUILD_DIR)/provider-attestor-macos-approval-test: src/provider_attestor_macos_approval.m tests/macos_approval_main.m include/provider_attestor_macos_approval.h include/provider_attestor_runtime.h | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) -DPA_MACOS_APPROVAL_TESTING=1 src/provider_attestor_macos_approval.m tests/macos_approval_main.m $(APPROVAL_LIBRARIES) -o "$@"

$(BUILD_DIR)/provider-attestor-manual-operator-acceptance: src/provider_attestor_macos_approval.m tests/manual_operator_acceptance_main.m include/provider_attestor_macos_approval.h include/provider_attestor_runtime.h | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) -DPA_MANUAL_OPERATOR_ACCEPTANCE=1 src/provider_attestor_macos_approval.m tests/manual_operator_acceptance_main.m $(APPROVAL_LIBRARIES) -o "$@"

$(BUILD_DIR)/provider-attestor-release-candidate: src/provider_attestor_protocol.m src/provider_attestor_runtime.m src/provider_attestor_signer.m src/provider_attestor_macos_approval.m src/provider_attestor_release_child.m include/provider_attestor_macos_approval.h include/provider_attestor_runtime.h include/provider_attestor_private.h include/provider_attestor_private_acl.h $(RELEASE_PINS_HEADER) release-pins-required pinned-build-force | $(BUILD_DIR)
	$(CLANG) $(COMMON_FLAGS) -DPA_RELEASE_BUILD=1 $(RELEASE_PIN_FLAGS) src/provider_attestor_protocol.m src/provider_attestor_runtime.m src/provider_attestor_signer.m src/provider_attestor_macos_approval.m src/provider_attestor_release_child.m $(RUNTIME_LIBRARIES) -framework AppKit -framework LocalAuthentication -framework Security -o "$@"

clean:
	/bin/rm -rf "$(BUILD_DIR)"
