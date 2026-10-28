"""Fixed current P1/P2 source selection for a separately owned preflight host.

No controller main, launcher or storage writer is invoked; no native authority
is created.
The trusted caller supplies a hash/identity-checking definitions loader. The
selected controllers read application source and declared package inventories;
their installed-package reader is not entered by this selection function.
"""
import hashlib
import json
import os
from pathlib import Path


SELECTIONS = {
    'p1': {
        'controller': 'qualification/run-sdk105-issued-command-application-v5.local.py',
        'controllerSha256': 'd2abb4960ce8e84fc2bf0dd88b44c82f143655614820fcc0f625f097af40dac4',
        'manifest': 'qualification/sdk105-issued-command-application-v5.inputs.json',
        'manifestSha256': '087df3b143f1802f75e7bbaaf295371bc32ef82eba2f75f8ee7a644a5b3ceb24',
        'kind': 'SDK105_ISSUED_COMMAND_APPLICATION_NODE24_V5',
        'entry': 'qualification/sdk105-issued-command-application-v5.case.mjs',
        'preload': 'qualification/sdk105-issued-command-application-v5.preload.mjs',
        'modes': ('clean', 'pending', 'service-response-loss'),
        'applicationFiles': 135, 'literalEdges': 603,
    },
    'p2': {
        'controller': 'qualification/run-sdk105-p2-commit-recovery-v5.local.py',
        'controllerSha256': 'ded75856be2ce6c34848d4cd1b81b7374e3e27c2d9f72b07cf9ac0881e8dcb34',
        'manifest': 'qualification/sdk105-p2-commit-recovery-v5.inputs.json',
        'manifestSha256': 'a3cd6e869a2ad627ac7f8c46951f9665d6066a3ea65b81bd8e547613730bc9b1',
        'kind': 'SDK105_P2_COMMIT_KILL_RECOVERY_NODE24_V5',
        'entry': 'qualification/sdk105-p2-commit-recovery-v5.parent.mjs',
        'preload': 'qualification/sdk105-p2-commit-recovery-v5.preload.mjs',
        'modes': ('commit-kill-recover',),
        'applicationFiles': 151, 'literalEdges': 667,
    },
}


def require(value, code):
    if not value:
        raise ValueError(code)


def select_current_v5_source(repo, lane, mode, *, load_controller):
    """Return the existing preflight tuple, with the exact new source binding.

    The tuple can be passed to the unchanged complete-allocation preflight.
    Selection never calls an inherited execute function or controller main.
    A positive source result is neither a capacity decision nor a run permit.
    """
    require(type(lane) is str and lane in SELECTIONS, 'EXACT_CURRENT_V5_LANE')
    chosen = dict(SELECTIONS[lane])
    require(type(mode) is str and mode in chosen['modes'], 'EXACT_CURRENT_V5_MODE')
    require(isinstance(repo, Path) and repo.is_absolute() and os.path.normpath(repo) == str(repo),
            'PHYSICAL_CURRENT_V5_REPO')
    controller = load_controller(repo / chosen['controller'], chosen['controllerSha256'],
                                 'current_v5_source_' + lane)
    require((controller.SELF, controller.MANIFEST, controller.ENTRY, controller.PRELOAD, controller.KIND)
            == tuple(chosen[key] for key in ('controller', 'manifest', 'entry', 'preload', 'kind'))
            and tuple(controller.ALLOWED_MODES) == chosen['modes'], 'FIXED_CURRENT_V5_CONTROLLER')
    old, profile, _delta, selected, rows, _inputs, _captures, stable, edges = controller.source_selection(
        repo, chosen['manifestSha256'])
    require(selected['kind'] == chosen['kind'] and selected['nativeAuthority'] == 'NONE'
            and type(selected['nativeCasesExecuted']) is int and selected['nativeCasesExecuted'] == 0
            and selected['entry'] == 'app/' + chosen['entry']
            and selected['preload'] == 'app/' + chosen['preload'], 'SOURCE_SELECTION_WITHOUT_AUTHORITY')
    require(type(edges) is int and edges == chosen['literalEdges']
            and type(rows) is list and len(rows) == chosen['applicationFiles'] + 404
            and selected['resolvedApplicationFiles'] == chosen['applicationFiles']
            and selected['packageFiles'] == 404, 'COMPLETE_CURRENT_V5_SELECTION')
    encoded = json.dumps(rows, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('ascii')
    require(hashlib.sha256(encoded).hexdigest() == selected['resolvedSourceRowsSha256'],
            'CURRENT_V5_SOURCE_ROWS_DIGEST')
    stable()
    binding = dict(lane=lane, mode=mode, controller=chosen['controller'],
                   controllerSha256=chosen['controllerSha256'], manifest=chosen['manifest'],
                   manifestSha256=chosen['manifestSha256'], kind=chosen['kind'],
                   applicationFiles=chosen['applicationFiles'], packageFilesDeclared=404,
                   packageFilesRead=0, literalEdges=edges,
                   sourceRowsSha256=selected['resolvedSourceRowsSha256'],
                   nativeAuthority='NONE', nativeExecutions=0)
    return dict(selection=(controller, old, profile, selected, rows, stable, edges), binding=binding)
