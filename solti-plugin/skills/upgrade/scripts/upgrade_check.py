#!/usr/bin/env python3
"""
Upgrade Check — Compare local version against latest remote release.

Usage:
  python upgrade_check.py --version-file ../../VERSION
  python upgrade_check.py --version-file ../../VERSION --repo owner/solti-plugin

Output: JSON with version info and update availability.
"""

import json
import sys
import os
import argparse
import re
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description='Check for Solti updates')
    parser.add_argument('--version-file', required=True, help='Path to VERSION file')
    parser.add_argument('--repo', default='redbotgroup/solti-plugin', help='GitHub repo (owner/name)')
    parser.add_argument('--cache-dir', default='.tmp', help='Cache directory for update check')
    parser.add_argument('--force', action='store_true', help='Bypass 24h cache')
    args = parser.parse_args()

    # Read current version
    version_path = Path(args.version_file)
    if not version_path.exists():
        print(json.dumps({
            'success': False,
            'error': f'VERSION file not found at {args.version_file}'
        }))
        sys.exit(1)

    current = version_path.read_text().strip()
    if not re.match(r'^\d+\.\d+\.\d+', current):
        print(json.dumps({
            'success': False,
            'error': f'Invalid version format: {current}'
        }))
        sys.exit(1)

    # Check cache
    cache_dir = Path(args.cache_dir)
    cache_file = cache_dir / 'update-check-cache.json'

    if not args.force and cache_file.exists():
        import time
        cache_age = time.time() - cache_file.stat().st_mtime
        if cache_age < 86400:  # 24 hours
            try:
                cached = json.loads(cache_file.read_text())
                cached['fromCache'] = True
                cached['cacheAge'] = int(cache_age)
                print(json.dumps(cached, indent=2))
                return
            except (json.JSONDecodeError, KeyError):
                pass  # Invalid cache, proceed with fresh check

    # Fetch latest release from GitHub
    latest = fetch_latest_release(args.repo)

    if not latest['success']:
        # If we can't reach GitHub, report current version only
        result = {
            'success': True,
            'current': current,
            'latest': None,
            'updateAvailable': False,
            'message': f'Solti v{current} — no pude verificar actualizaciones ({latest.get("error", "unknown")})',
            'fromCache': False,
        }
    else:
        latest_version = latest['version']
        update_type = compare_versions(current, latest_version)

        if update_type == 'up-to-date':
            message = f'Solti v{current} — al dia ✅'
        elif update_type == 'patch':
            message = f'Solti v{current} → v{latest_version} disponible (parche)'
        elif update_type == 'minor':
            message = f'Solti v{current} → v{latest_version} disponible (mejoras)'
        elif update_type == 'major':
            message = f'⚠️ Solti v{current} → v{latest_version} — actualizacion mayor disponible'
        else:
            message = f'Solti v{current} (version mas reciente que remoto: v{latest_version})'

        result = {
            'success': True,
            'current': current,
            'latest': latest_version,
            'updateAvailable': update_type in ('patch', 'minor', 'major'),
            'updateType': update_type,
            'releaseNotes': latest.get('notes', ''),
            'releaseUrl': latest.get('url', ''),
            'message': message,
            'fromCache': False,
        }

    # Save to cache
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(result, indent=2))
    except OSError:
        pass  # Cache write failure is non-critical

    print(json.dumps(result, indent=2))


def fetch_latest_release(repo: str) -> dict:
    """Fetch latest release from GitHub API."""
    import urllib.request
    import urllib.error

    url = f'https://api.github.com/repos/{repo}/releases/latest'
    req = urllib.request.Request(url, headers={
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'solti-upgrade-check/1.0',
    })

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            tag = data.get('tag_name', '').lstrip('v')
            return {
                'success': True,
                'version': tag,
                'notes': data.get('body', '')[:500],
                'url': data.get('html_url', ''),
            }
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {'success': False, 'error': 'No releases found'}
        return {'success': False, 'error': f'GitHub API error: {e.code}'}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def compare_versions(current: str, latest: str) -> str:
    """Compare semver versions. Returns: up-to-date, patch, minor, major, or ahead."""
    def parse(v):
        parts = v.split('.')
        return tuple(int(p) for p in parts[:3])

    try:
        c = parse(current)
        l = parse(latest)
    except (ValueError, IndexError):
        return 'unknown'

    if c >= l:
        return 'ahead' if c > l else 'up-to-date'
    if l[0] > c[0]:
        return 'major'
    if l[1] > c[1]:
        return 'minor'
    return 'patch'


if __name__ == '__main__':
    main()
