#!/usr/bin/env python3
"""Schedule or publish a post via getLate API (direct or through Solti Hub).

Usage:
  python3 schedule_post.py --platform linkedin --account-id <id> \
    --content "Post text" --schedule "2026-03-20T10:00:00" --confirmed
  python3 schedule_post.py --platform instagram --account-id <id> \
    --content "Caption" --media /path/to/image.jpg --publish-now --confirmed
  python3 schedule_post.py --platform instagram --account-id <id> \
    --content "Carousel" --media img1.jpg img2.jpg img3.jpg --publish-now --confirmed

Routing:
  1. Try Hub first (POST /api/v1/services/execute with service=getlate)
  2. Fall back to direct getLate API if Hub is offline or unavailable

Media upload flow (direct mode):
  1. POST /v1/media/presign → {url (upload target), mediaUrl (attach to post)}
  2. PUT file to url
  3. Use mediaUrl in mediaItems array

CRITICAL gotchas:
  - presign_media returns {url, mediaUrl} — PUT to url, use mediaUrl in post
  - Video upload timeout: 600 seconds
  - YouTube requires video — text-only posts will fail
  - Posts without publishNow or scheduledFor stay as DRAFTS
  - API payload uses `content` (NOT `text`)
  - Platforms array uses `accountId` + `platform` (NOT platformAccountId/platformId)
  - Schedule field is `scheduledFor` (NOT scheduledAt)

Output: JSON with {success, post_id, platform_post_url, scheduled_at, mode}
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime

# ═══ Hub client import (optional — graceful fallback) ═══
_hub_client_mod = None
try:
    # hub_client.py lives in skills/connect/scripts/
    _scripts_root = os.path.dirname(os.path.abspath(__file__))
    _connect_scripts = os.path.normpath(os.path.join(
        _scripts_root, '..', '..', 'connect', 'scripts'))
    if _connect_scripts not in sys.path:
        sys.path.insert(0, _connect_scripts)
    from hub_client import HubClient
    _hub_client_mod = True
except ImportError:
    _hub_client_mod = False

GETLATE_URL = 'https://getlate.dev/api/v1'

MIME_TYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.webm': 'video/webm',
}

VIDEO_EXTENSIONS = {'.mp4', '.mov', '.avi', '.webm'}

# Video uploads can be large — 600s timeout
VIDEO_UPLOAD_TIMEOUT = 600
IMAGE_UPLOAD_TIMEOUT = 120


# ═══════════════════════════════════════════════════════════════════════
#  Direct getLate API helpers
# ═══════════════════════════════════════════════════════════════════════

def api_request(token: str, method: str, path: str,
                data: dict = None, timeout: int = 30) -> dict:
    """Make an authenticated request to getLate API."""
    url = f'{GETLATE_URL}{path}'
    payload = json.dumps(data, ensure_ascii=False).encode('utf-8') if data else None
    req = urllib.request.Request(
        url, data=payload, method=method,
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        }
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def presign_media(token: str, filename: str, content_type: str) -> dict:
    """Get presigned upload URL from getLate.

    Returns: {url (PUT target), mediaUrl (for post attachment)}
    """
    result = api_request(token, 'POST', '/media/presign', {
        'filename': filename,
        'contentType': content_type,
    })
    # API returns {url, mediaUrl}
    return {
        'url': result['url'],
        'mediaUrl': result['mediaUrl'],
    }


def upload_file_to_presigned(upload_url: str, file_path: str,
                              content_type: str) -> None:
    """PUT file bytes to the presigned upload URL."""
    is_video = content_type.startswith('video/')
    timeout = VIDEO_UPLOAD_TIMEOUT if is_video else IMAGE_UPLOAD_TIMEOUT

    with open(file_path, 'rb') as f:
        file_data = f.read()

    req = urllib.request.Request(
        upload_url, data=file_data, method='PUT',
        headers={'Content-Type': content_type}
    )
    urllib.request.urlopen(req, timeout=timeout)


def upload_media_direct(token: str, file_path: str) -> dict:
    """Upload a local file via presigned URL (direct mode).

    Returns: {mediaUrl, type} ready for mediaItems array.
    """
    filename = os.path.basename(file_path)
    ext = os.path.splitext(filename)[1].lower()
    content_type = MIME_TYPES.get(ext, 'application/octet-stream')

    # Step 1: Get presigned URL
    presign = presign_media(token, filename, content_type)

    # Step 2: PUT file to presign['url']
    upload_file_to_presigned(presign['url'], file_path, content_type)

    # Step 3: Return mediaUrl for post attachment
    media_type = 'video' if ext in VIDEO_EXTENSIONS else 'image'
    return {'url': presign['mediaUrl'], 'type': media_type}


def resolve_media_items_direct(token: str, media_paths: list) -> list:
    """Resolve media paths/URLs into mediaItems array (direct mode)."""
    items = []
    for path in media_paths:
        if path.startswith('http://') or path.startswith('https://'):
            ext = os.path.splitext(path)[1].lower().split('?')[0]
            media_type = 'video' if ext in VIDEO_EXTENSIONS else 'image'
            items.append({'url': path, 'type': media_type})
        elif os.path.isfile(path):
            items.append(upload_media_direct(token, path))
        else:
            raise FileNotFoundError(f'Media file not found: {path}')
    return items


# ═══════════════════════════════════════════════════════════════════════
#  Hub mode helpers
# ═══════════════════════════════════════════════════════════════════════

def _get_hub_client():
    """Create a HubClient instance. Returns None if Hub is unavailable."""
    if not _hub_client_mod:
        return None
    try:
        client = HubClient()
        if client.is_online():
            return client
    except Exception:
        pass
    return None


def upload_media_hub(hub: 'HubClient', file_path: str) -> dict:
    """Upload media via Hub's service proxy.

    Hub route: POST /api/v1/services/execute
    with {service:'getlate', action:'presign_media', params:{filename, contentType}}
    Then PUT to the returned url, use mediaUrl for post.
    """
    filename = os.path.basename(file_path)
    ext = os.path.splitext(filename)[1].lower()
    content_type = MIME_TYPES.get(ext, 'application/octet-stream')

    presign_result = hub.post('/services/execute', json_data={
        'service': 'getlate',
        'action': 'presign_media',
        'params': {
            'filename': filename,
            'contentType': content_type,
        },
    }, timeout=30)

    if presign_result.get('success') is False:
        raise RuntimeError(f"Hub presign failed: {presign_result.get('error', 'unknown')}")

    data = presign_result.get('data', presign_result)
    upload_url = data.get('url')
    media_url = data.get('mediaUrl')

    if not upload_url or not media_url:
        raise RuntimeError(f"Hub presign missing url/mediaUrl: {data}")

    # PUT file directly (bypasses Hub — goes to cloud storage)
    upload_file_to_presigned(upload_url, file_path, content_type)

    media_type = 'video' if ext in VIDEO_EXTENSIONS else 'image'
    return {'url': media_url, 'type': media_type}


def resolve_media_items_hub(hub: 'HubClient', media_paths: list) -> list:
    """Resolve media paths/URLs into mediaItems array (Hub mode)."""
    items = []
    for path in media_paths:
        if path.startswith('http://') or path.startswith('https://'):
            ext = os.path.splitext(path)[1].lower().split('?')[0]
            media_type = 'video' if ext in VIDEO_EXTENSIONS else 'image'
            items.append({'url': path, 'type': media_type})
        elif os.path.isfile(path):
            items.append(upload_media_hub(hub, path))
        else:
            raise FileNotFoundError(f'Media file not found: {path}')
    return items


def schedule_via_hub(hub: 'HubClient', platform: str, account_id: str,
                     content: str, schedule_at: str, media_items: list = None,
                     publish_now: bool = False,
                     content_type: str = None) -> dict:
    """Create post via Hub service proxy."""
    post_params = {
        'content': content,
        'platforms': [
            {
                'platform': platform,
                'accountId': account_id,
            }
        ],
    }

    if publish_now or schedule_at == 'now':
        post_params['publishNow'] = True
    elif schedule_at:
        post_params['scheduledFor'] = schedule_at
    # NOTE: omitting both publishNow and scheduledFor → post stays as draft

    if media_items:
        post_params['mediaItems'] = media_items

    if content_type:
        post_params['contentType'] = content_type

    result = hub.post('/services/execute', json_data={
        'service': 'getlate',
        'action': 'create_post',
        'params': post_params,
    }, timeout=60)

    return result


# ═══════════════════════════════════════════════════════════════════════
#  Direct getLate mode
# ═══════════════════════════════════════════════════════════════════════

def schedule_via_getlate(token: str, platform: str, account_id: str,
                         content: str, schedule_at: str,
                         media_items: list = None,
                         publish_now: bool = False,
                         content_type: str = None) -> dict:
    """Schedule or publish a post via direct getLate API.

    Field mappings (getLate API):
      - content (NOT text)
      - platforms[].accountId (NOT platformAccountId)
      - platforms[].platform (NOT platformId)
      - publishNow: true for immediate publish
      - scheduledFor (NOT scheduledAt) for future scheduling
      - Omitting both → draft
    """
    data = {
        'content': content,
        'platforms': [
            {
                'platform': platform,
                'accountId': account_id,
            }
        ],
    }

    if publish_now or schedule_at == 'now':
        data['publishNow'] = True
    elif schedule_at:
        data['scheduledFor'] = schedule_at
    # NOTE: omitting both publishNow and scheduledFor → post stays as draft

    if media_items:
        data['mediaItems'] = media_items

    if content_type:
        data['contentType'] = content_type

    return api_request(token, 'POST', '/posts', data)


# ═══════════════════════════════════════════════════════════════════════
#  Account listing
# ═══════════════════════════════════════════════════════════════════════

def list_accounts(token: str, platform: str = None) -> list:
    """List connected accounts, optionally filtered by platform."""
    result = api_request(token, 'GET', '/accounts')
    accounts = result.get('accounts', [])
    if platform:
        accounts = [a for a in accounts if a.get('platform') == platform]
    return [
        {
            'id': a['_id'],
            'platform': a.get('platform'),
            'username': a.get('username', ''),
            'displayName': a.get('displayName', ''),
        }
        for a in accounts
    ]


def list_accounts_hub(hub: 'HubClient', platform: str = None) -> list:
    """List connected accounts via Hub."""
    params = {'platform': platform} if platform else {}
    result = hub.post('/services/execute', json_data={
        'service': 'getlate',
        'action': 'list_accounts',
        'params': params,
    }, timeout=30)
    # Hub returns {data: {success, data: {accounts: [...]}}} — navigate nested structure
    inner = result.get('data', result)
    if isinstance(inner, dict) and 'data' in inner:
        inner = inner['data']
    accounts = inner.get('accounts', [])
    if platform:
        accounts = [a for a in accounts if a.get('platform') == platform]
    return [
        {
            'id': a.get('_id', a.get('id')),
            'platform': a.get('platform'),
            'username': a.get('username', ''),
            'displayName': a.get('displayName', ''),
        }
        for a in accounts
    ]


# ═══════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument('--platform', required=True,
                        choices=['linkedin', 'instagram', 'facebook',
                                 'twitter', 'tiktok', 'threads',
                                 'googlebusiness', 'youtube'],
                        help='Target platform')
    parser.add_argument('--account-id', default=None,
                        help='getLate account ID (use --list-accounts to find)')
    parser.add_argument('--content', default=None,
                        help='Post content text (or path to .txt file)')
    parser.add_argument('--media', nargs='*', default=None,
                        help='Media file paths or URLs (multiple for carousel)')
    parser.add_argument('--schedule', default=None,
                        help='Schedule time in ISO format (e.g. 2026-03-20T10:00:00)')
    parser.add_argument('--publish-now', action='store_true',
                        help='Publish immediately (sets publishNow: true)')
    parser.add_argument('--content-type', default=None,
                        help='Platform-specific content type (e.g. reel, story, carousel)')
    parser.add_argument('--token', default=None,
                        help='getLate API token (or GETLATE_API_TOKEN env)')
    parser.add_argument('--list-accounts', action='store_true',
                        help='List connected accounts for platform')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--confirmed', action='store_true')
    parser.add_argument('--direct', action='store_true',
                        help='Skip Hub, use direct getLate API')
    parser.add_argument('--output', default=None)
    args = parser.parse_args()

    token = args.token or os.environ.get('GETLATE_API_TOKEN', '')

    # ── Determine mode: Hub vs Direct ──
    hub = None
    if not args.direct:
        hub = _get_hub_client()

    mode = 'hub' if hub else 'direct'

    # Direct mode requires a token
    if mode == 'direct' and not token:
        print(json.dumps({
            'success': False,
            'error': 'No getLate API token and Hub is offline.',
            'suggestion': 'Set GETLATE_API_TOKEN or start the Hub.',
        }))
        sys.exit(1)

    # ── Warn about YouTube text-only ──
    if args.platform == 'youtube' and not args.media:
        print(json.dumps({
            'success': False,
            'error': 'YouTube requires video — text-only posts will fail.',
            'suggestion': 'Add --media /path/to/video.mp4',
        }))
        sys.exit(1)

    # ── Warn about draft posts ──
    if not args.publish_now and not args.schedule and not args.list_accounts and not args.dry_run:
        # No publishNow or scheduledFor → post will be a draft
        sys.stderr.write(
            "WARNING: Neither --publish-now nor --schedule set. "
            "Post will be saved as a DRAFT in getLate.\n"
        )

    # ── List accounts mode ──
    if args.list_accounts:
        try:
            if hub:
                accounts = list_accounts_hub(hub, args.platform)
            else:
                accounts = list_accounts(token, args.platform)
        except Exception as e:
            # If Hub fails, fallback to direct
            if hub and token:
                accounts = list_accounts(token, args.platform)
            else:
                raise

        print(json.dumps({
            'success': True,
            'platform': args.platform,
            'accounts': accounts,
            'mode': mode,
        }, indent=2, ensure_ascii=False))
        return

    if not args.content:
        print(json.dumps({
            'success': False,
            'error': '--content is required (or use --list-accounts).',
        }))
        sys.exit(1)

    # ── Load content from file if path ──
    content = args.content
    if os.path.exists(content) and not content.startswith('http'):
        with open(content) as f:
            content = f.read().strip()

    # ── Resolve schedule_at ──
    schedule_at = args.schedule  # ISO string or None
    publish_now = args.publish_now

    # Legacy compat: --schedule now → publish_now
    if schedule_at == 'now':
        publish_now = True
        schedule_at = None

    # ── Auto-detect account if not specified ──
    account_id = args.account_id
    if not account_id:
        try:
            if hub:
                accounts = list_accounts_hub(hub, args.platform)
            else:
                accounts = list_accounts(token, args.platform)
        except Exception:
            if hub and token:
                accounts = list_accounts(token, args.platform)
            else:
                raise

        if len(accounts) == 1:
            account_id = accounts[0]['id']
        elif len(accounts) == 0:
            print(json.dumps({
                'success': False,
                'error': f'No {args.platform} account connected in getLate.',
                'suggestion': 'Connect the account at getlate.dev dashboard.',
            }))
            sys.exit(1)
        else:
            print(json.dumps({
                'success': False,
                'error': f'Multiple {args.platform} accounts found. Use --account-id.',
                'accounts': accounts,
            }, indent=2, ensure_ascii=False))
            sys.exit(1)

    # ── Dry run ──
    if args.dry_run:
        result = {
            'success': True,
            'dry_run': True,
            'mode': mode,
            'platform': args.platform,
            'account_id': account_id,
            'content_preview': content[:200],
            'content_length': len(content),
            'publish_now': publish_now,
            'scheduled_for': schedule_at,
            'will_be_draft': not publish_now and not schedule_at,
            'has_media': bool(args.media),
            'media_count': len(args.media) if args.media else 0,
            'content_type': args.content_type,
        }
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    # ── Execute ──
    try:
        # Upload media
        media_items = None
        if args.media:
            if hub:
                try:
                    media_items = resolve_media_items_hub(hub, args.media)
                except Exception:
                    # Fallback to direct if Hub media upload fails
                    if token:
                        media_items = resolve_media_items_direct(token, args.media)
                        mode = 'direct-fallback'
                    else:
                        raise
            else:
                media_items = resolve_media_items_direct(token, args.media)

        # Create post
        if hub and mode != 'direct-fallback':
            try:
                response = schedule_via_hub(
                    hub, args.platform, account_id, content,
                    schedule_at, media_items,
                    publish_now=publish_now,
                    content_type=args.content_type,
                )
                # Hub wraps result in {success, data}
                if response.get('success') is False:
                    raise RuntimeError(response.get('error', 'Hub create_post failed'))
                response = response.get('data', response)
            except Exception:
                # Fallback to direct
                if token:
                    response = schedule_via_getlate(
                        token, args.platform, account_id, content,
                        schedule_at, media_items,
                        publish_now=publish_now,
                        content_type=args.content_type,
                    )
                    mode = 'direct-fallback'
                else:
                    raise
        else:
            response = schedule_via_getlate(
                token, args.platform, account_id, content,
                schedule_at, media_items,
                publish_now=publish_now,
                content_type=args.content_type,
            )

        post = response.get('post', response)
        platform_info = post.get('platforms', [{}])[0] if post.get('platforms') else {}

        result = {
            'success': True,
            'mode': mode,
            'platform': args.platform,
            'post_id': post.get('_id', post.get('id', 'unknown')),
            'platform_post_id': platform_info.get('platformPostId', ''),
            'platform_post_url': platform_info.get('platformPostUrl', ''),
            'status': post.get('status', 'unknown'),
            'publish_now': publish_now,
            'scheduled_for': schedule_at,
            'content_length': len(content),
            'media_count': len(media_items) if media_items else 0,
        }

        out_str = json.dumps(result, indent=2, ensure_ascii=False)
        if args.output:
            os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
            with open(args.output, 'w') as f:
                f.write(out_str)
            print(json.dumps({'success': True, 'output_file': args.output}))
        else:
            print(out_str)

    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ''
        print(json.dumps({
            'success': False,
            'error': f'getLate API error: HTTP {e.code}',
            'detail': body[:500],
            'mode': mode,
            'suggestion': 'Check API token and platform connection in getLate dashboard.',
        }))
        sys.exit(1)

    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__,
            'mode': mode,
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
