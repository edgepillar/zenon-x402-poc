"""P2 profile DATA: one verified source inventory, three explicit role views.

The caller supplies the pinned canonical producer and source-read capabilities.
This module evaluates no SDK or JavaScript and creates no files or processes.
Role profiles are metadata, not permission or native qualification.
"""
import re


ROLES = ('parent', 'funding-child', 'recovery-child')


def build_role_profile_bundle(repo, packages, old, identity_profile, selected,
                              rows, mode, *, producer, kind, entries):
    if mode != 'commit-kill-recover':
        raise ValueError('EXACT_P2_BUNDLE_MODE')
    if (type(entries) is not dict or set(entries) != set(ROLES)
            or any(type(name) is not str or not name.startswith('qualification/')
                   or any(part in ('', '.', '..') for part in name.split('/'))
                   for name in entries.values())
            or len(set(entries.values())) != len(ROLES)):
        raise ValueError('EXACT_P2_BUNDLE_ROLE_ENTRIES')
    if (type(kind) is not str
            or re.fullmatch(r'SDK105_P2_COMMIT_KILL_RECOVERY_NODE24_V[1-9][0-9]*', kind) is None):
        raise ValueError('EXACT_P2_BUNDLE_KIND')
    # Only this call enters the source reader. Derive the three bounded role
    # views from its retained inventory; never rebuild or copy package trees.
    common = producer.build_profile(
        repo, packages, old, identity_profile, selected, rows, mode,
        kind=kind, entry=entries['parent'], allowed_modes=['commit-kill-recover'])
    return producer.build_role_profiles(
        common, kind=kind, mode=mode, entries=entries)
