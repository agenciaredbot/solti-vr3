#!/usr/bin/env python3
"""
Upgrade Apply — Download and apply an update, preserving user files.

Usage:
  python upgrade_apply.py --plugin-dir ../.. --target-version 1.1.0
  python upgrade_apply.py --plugin-dir ../.. --target-version 1.1.0 --dry-run

Output: JSON with update status and list of changed files.
"""

import json
import sys
import os
import argparse
import shutil
import subprocess
from datetime import datetime
from pathlib import Path


# Files and directories that MUST NOT be overwritten during updates
PROTECTED_PATTERNS = [
    'context/my-business.md',
    'context/my-voice.md',
    'context/my-icp.md',
    'context/my-offer.md',
    'args/preferences.yaml',
    'memory/MEMORY.md',
    'memory/logs',
    '.env',
    '.env.local',
    '.env.production',
    '.mcp.json',
    'data',
]


def main():
    parser = argparse.ArgumentParser(description='Apply Solti update')
    parser.add_argument('--plugin-dir', required=True, help='Root directory of the plugin')
    parser.add_argument('--target-version', required=True, help='Version to update to')
    parser.add_argument('--repo', default='redbotgroup/solti-plugin', help='GitHub repo')
    parser.add_argument('--dry-run', action='store_true', help='Show what would change without applying')
    parser.add_argument('--backup-dir', default='.tmp', help='Where to store backups')
    args = parser.parse_args()

    plugin_dir = Path(args.plugin_dir).resolve()
    if not (plugin_dir / 'VERSION').exists():
        print(json.dumps({
            'success': False,
            'error': f'Not a valid Solti plugin directory: {plugin_dir}'
        }))
        sys.exit(1)

    current_version = (plugin_dir / 'VERSION').read_text().strip()

    if args.dry_run:
        result = dry_run(plugin_dir, current_version, args.target_version)
    else:
        result = apply_update(plugin_dir, current_version, args.target_version, args.repo, args.backup_dir)

    print(json.dumps(result, indent=2, ensure_ascii=False))


def dry_run(plugin_dir: Path, current: str, target: str) -> dict:
    """Show what would happen without making changes."""
    protected = []
    for pattern in PROTECTED_PATTERNS:
        p = plugin_dir / pattern
        if p.exists():
            protected.append(pattern)

    return {
        'success': True,
        'dryRun': True,
        'current': current,
        'target': target,
        'protectedFiles': protected,
        'message': f'Actualizacion v{current} → v{target}: {len(protected)} archivos protegidos. Usa sin --dry-run para aplicar.',
    }


def apply_update(plugin_dir: Path, current: str, target: str, repo: str, backup_base: str) -> dict:
    """Apply the update using git or release download."""
    backup_dir = plugin_dir / backup_base / f'backup-{current}'

    # Step 1: Create backup
    try:
        backup_result = create_backup(plugin_dir, backup_dir)
        if not backup_result['success']:
            return backup_result
    except Exception as e:
        return {'success': False, 'error': f'Backup failed: {e}', 'step': 'backup'}

    # Step 2: Try git-based update first
    git_dir = plugin_dir / '.git'
    if git_dir.exists():
        result = update_via_git(plugin_dir, target)
    else:
        result = update_via_download(plugin_dir, target, repo)

    if not result['success']:
        # Rollback on failure
        rollback_result = restore_backup(plugin_dir, backup_dir)
        result['rollback'] = rollback_result
        return result

    # Step 3: Restore protected files from backup
    restored = restore_protected_files(plugin_dir, backup_dir)

    # Step 4: Update VERSION file
    (plugin_dir / 'VERSION').write_text(target + '\n')

    # Step 5: Post-update validation
    validation = validate_installation(plugin_dir)

    if not validation['healthy']:
        # Auto-rollback on validation failure
        rollback_result = restore_backup(plugin_dir, backup_dir)
        return {
            'success': False,
            'error': 'Post-update validation failed — auto-rolled back',
            'validation': validation,
            'rollback': rollback_result,
        }

    return {
        'success': True,
        'previous': current,
        'current': target,
        'backupPath': str(backup_dir),
        'protectedFiles': restored,
        'changedFiles': result.get('changedFiles', 0),
        'validation': validation,
        'message': f'✅ Actualizado v{current} → v{target}. {len(restored)} archivos protegidos. Ejecuta /audit para verificar.',
    }


def create_backup(plugin_dir: Path, backup_dir: Path) -> dict:
    """Create a backup of the current installation."""
    if backup_dir.exists():
        shutil.rmtree(backup_dir)

    backup_dir.mkdir(parents=True, exist_ok=True)

    # Backup essential directories
    dirs_to_backup = ['skills', 'hooks', 'bin', 'rules', 'agents', 'context', 'args', 'memory']
    files_to_backup = ['CLAUDE.md', 'VERSION', 'plugin.json', 'setup.sh', '.mcp.json']

    backed_up = []
    for d in dirs_to_backup:
        src = plugin_dir / d
        if src.exists():
            shutil.copytree(src, backup_dir / d, dirs_exist_ok=True)
            backed_up.append(d)

    for f in files_to_backup:
        src = plugin_dir / f
        if src.exists():
            shutil.copy2(src, backup_dir / f)
            backed_up.append(f)

    # Save metadata
    meta = {
        'version': (plugin_dir / 'VERSION').read_text().strip(),
        'timestamp': datetime.now().isoformat(),
        'files': backed_up,
    }
    (backup_dir / 'backup-meta.json').write_text(json.dumps(meta, indent=2))

    return {'success': True, 'backedUp': backed_up, 'path': str(backup_dir)}


def update_via_git(plugin_dir: Path, target: str) -> dict:
    """Update using git pull/checkout."""
    try:
        # Stash any local changes
        subprocess.run(['git', 'stash'], cwd=plugin_dir, capture_output=True)

        # Fetch latest
        fetch = subprocess.run(
            ['git', 'fetch', '--tags', 'origin'],
            cwd=plugin_dir, capture_output=True, text=True, timeout=30
        )
        if fetch.returncode != 0:
            return {'success': False, 'error': f'git fetch failed: {fetch.stderr}'}

        # Try to checkout the target version tag
        tag = f'v{target}'
        checkout = subprocess.run(
            ['git', 'checkout', tag],
            cwd=plugin_dir, capture_output=True, text=True, timeout=10
        )

        if checkout.returncode != 0:
            # Fall back to pulling main branch
            pull = subprocess.run(
                ['git', 'pull', 'origin', 'main'],
                cwd=plugin_dir, capture_output=True, text=True, timeout=30
            )
            if pull.returncode != 0:
                return {'success': False, 'error': f'git pull failed: {pull.stderr}'}

        # Count changed files
        diff = subprocess.run(
            ['git', 'diff', '--stat', f'HEAD~1..HEAD'],
            cwd=plugin_dir, capture_output=True, text=True
        )
        changed = len(diff.stdout.strip().split('\n')) if diff.stdout.strip() else 0

        return {'success': True, 'method': 'git', 'changedFiles': changed}

    except subprocess.TimeoutExpired:
        return {'success': False, 'error': 'Git operation timed out'}
    except Exception as e:
        return {'success': False, 'error': f'Git update failed: {e}'}


def update_via_download(plugin_dir: Path, target: str, repo: str) -> dict:
    """Update by downloading a release tarball from GitHub."""
    import urllib.request
    import tarfile
    import tempfile

    url = f'https://github.com/{repo}/archive/refs/tags/v{target}.tar.gz'

    try:
        with tempfile.NamedTemporaryFile(suffix='.tar.gz', delete=False) as tmp:
            urllib.request.urlretrieve(url, tmp.name)
            tmp_path = tmp.name

        # Extract to temp directory
        with tempfile.TemporaryDirectory() as extract_dir:
            with tarfile.open(tmp_path, 'r:gz') as tar:
                tar.extractall(extract_dir)

            # Find the extracted directory (usually repo-name-version/)
            extracted = list(Path(extract_dir).iterdir())
            if not extracted:
                return {'success': False, 'error': 'Empty release archive'}

            src_dir = extracted[0]

            # Copy non-protected files
            changed = 0
            for item in src_dir.rglob('*'):
                if item.is_file():
                    rel = item.relative_to(src_dir)
                    if not is_protected(str(rel)):
                        dest = plugin_dir / rel
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(item, dest)
                        changed += 1

        os.unlink(tmp_path)
        return {'success': True, 'method': 'download', 'changedFiles': changed}

    except Exception as e:
        return {'success': False, 'error': f'Download update failed: {e}'}


def is_protected(rel_path: str) -> bool:
    """Check if a relative path matches protected patterns."""
    for pattern in PROTECTED_PATTERNS:
        if rel_path == pattern or rel_path.startswith(pattern + '/') or rel_path.startswith(pattern + os.sep):
            return True
    return False


def restore_protected_files(plugin_dir: Path, backup_dir: Path) -> list:
    """Restore protected files from backup."""
    restored = []
    for pattern in PROTECTED_PATTERNS:
        src = backup_dir / pattern
        dest = plugin_dir / pattern
        if src.exists():
            if src.is_dir():
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(src, dest)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dest)
            restored.append(pattern)
    return restored


def restore_backup(plugin_dir: Path, backup_dir: Path) -> dict:
    """Full rollback from backup."""
    if not backup_dir.exists():
        return {'success': False, 'error': 'No backup found'}

    try:
        meta_file = backup_dir / 'backup-meta.json'
        if meta_file.exists():
            meta = json.loads(meta_file.read_text())
        else:
            meta = {'files': []}

        for item in backup_dir.iterdir():
            if item.name == 'backup-meta.json':
                continue
            dest = plugin_dir / item.name
            if item.is_dir():
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(item, dest)
            else:
                shutil.copy2(item, dest)

        return {'success': True, 'version': meta.get('version', 'unknown')}
    except Exception as e:
        return {'success': False, 'error': f'Rollback failed: {e}'}


def validate_installation(plugin_dir: Path) -> dict:
    """Validate the installation after update."""
    issues = []

    # Check VERSION exists
    if not (plugin_dir / 'VERSION').exists():
        issues.append('VERSION file missing')

    # Check CLAUDE.md exists
    if not (plugin_dir / 'CLAUDE.md').exists():
        issues.append('CLAUDE.md missing')

    # Check skills have SKILL.md
    skills_dir = plugin_dir / 'skills'
    if skills_dir.exists():
        for skill in skills_dir.iterdir():
            if skill.is_dir() and not (skill / 'SKILL.md').exists():
                issues.append(f'skills/{skill.name}/SKILL.md missing')

    # Check hooks exist
    hooks_dir = plugin_dir / 'hooks'
    if hooks_dir.exists():
        expected_hooks = ['guardrail_check.py', 'cost_guard.py', 'validate_output.py', 'memory_capture.py']
        for hook in expected_hooks:
            if not (hooks_dir / hook).exists():
                issues.append(f'hooks/{hook} missing')

    # Check bin scripts
    bin_dir = plugin_dir / 'bin'
    if bin_dir.exists():
        for script in bin_dir.iterdir():
            if not os.access(script, os.X_OK):
                issues.append(f'bin/{script.name} not executable')

    return {
        'healthy': len(issues) == 0,
        'issues': issues,
        'skillCount': len(list(skills_dir.iterdir())) if skills_dir.exists() else 0,
    }


if __name__ == '__main__':
    main()
