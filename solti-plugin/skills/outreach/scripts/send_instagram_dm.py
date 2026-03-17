#!/usr/bin/env python3
"""Send Instagram DMs via Apify actor (mikolabs/instagram-bulk-dm).

Usage:
  python3 send_instagram_dm.py --message "Hello {{lead.name}}" \
    --usernames .tmp/ig_usernames.json --confirmed

Output: JSON with {success, sent, failed, run_id}
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

BASE_URL = 'https://api.apify.com/v2'
DM_ACTOR = 'mikolabs/instagram-bulk-dm'
MAX_DMS = 50  # Rate limit per session


def personalize(template: str, lead: dict) -> str:
    """Replace {{lead.field}} placeholders."""
    def replace_tag(match):
        field = match.group(1)
        return str(lead.get(field, ''))
    return re.sub(r'\{\{lead\.(\w+)\}\}', replace_tag, template)


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--message', required=True,
                        help='Message template (supports {{lead.field}} tags)')
    parser.add_argument('--usernames', required=True,
                        help='JSON file with array of {username, ...lead_data}')
    parser.add_argument('--session-cookie', default=None,
                        help='Instagram session cookie (or IG_SESSION_COOKIE env)')
    parser.add_argument('--token', default=None,
                        help='Apify API token (or APIFY_API_TOKEN env)')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--confirmed', action='store_true')
    parser.add_argument('--output', default=None)
    args = parser.parse_args()

    token = args.token or os.environ.get('APIFY_API_TOKEN', '')
    session_cookie = args.session_cookie or os.environ.get('IG_SESSION_COOKIE', '')

    if not token:
        print(json.dumps({
            'success': False,
            'error': 'No Apify API token.',
            'suggestion': 'Set APIFY_API_TOKEN or use /connect.',
        }))
        sys.exit(1)

    if not session_cookie and not args.dry_run:
        print(json.dumps({
            'success': False,
            'error': 'No Instagram session cookie.',
            'suggestion': 'Set IG_SESSION_COOKIE or use /connect to import your session.',
        }))
        sys.exit(1)

    try:
        # Load usernames/contacts
        with open(args.usernames) as f:
            contacts = json.load(f)

        if isinstance(contacts, dict) and 'data' in contacts:
            contacts = contacts['data']

        # Filter contacts with instagram username
        recipients = []
        for c in contacts:
            username = c.get('instagram', '') or c.get('username', '')
            if username:
                username = username.strip().lstrip('@').split('/')[-1]
                if username:
                    recipients.append({**c, 'username': username})

        if not recipients:
            print(json.dumps({
                'success': False,
                'error': 'No contacts with Instagram usernames.',
                'suggestion': 'Enrich contacts with /prospect ENRICH to find Instagram profiles.',
            }))
            sys.exit(1)

        recipients = recipients[:MAX_DMS]

        if args.dry_run:
            sample = personalize(args.message, recipients[0]) if recipients else args.message
            print(json.dumps({
                'success': True,
                'dry_run': True,
                'channel': 'instagram_dm',
                'recipients': len(recipients),
                'sample_message': sample,
                'usernames': [r['username'] for r in recipients[:5]],
            }, indent=2, ensure_ascii=False))
            return

        # Build Apify actor input
        # For bulk personalized DMs, we send individual messages
        usernames = [r['username'] for r in recipients]
        message = args.message  # Will be personalized per recipient by actor if supported

        safe_actor = DM_ACTOR.replace('/', '~')
        url = f'{BASE_URL}/acts/{safe_actor}/runs?token={token}'

        input_data = {
            'sessionCookies': [session_cookie],
            'usernames': usernames,
            'message': message,
        }

        payload = json.dumps(input_data).encode()
        req = urllib.request.Request(
            url, data=payload,
            headers={'Content-Type': 'application/json'}
        )

        with urllib.request.urlopen(req, timeout=30) as resp:
            run = json.loads(resp.read())['data']

        run_id = run['id']
        dataset_id = run['defaultDatasetId']

        # Wait for completion (max 180s for DMs)
        start = time.time()
        status = 'RUNNING'
        while time.time() - start < 180:
            check_url = f'{BASE_URL}/actor-runs/{run_id}?token={token}'
            with urllib.request.urlopen(check_url, timeout=10) as resp:
                status = json.loads(resp.read())['data']['status']
            if status in ('SUCCEEDED', 'FAILED', 'ABORTED'):
                break
            time.sleep(5)

        # Get results
        results = []
        if status == 'SUCCEEDED':
            results_url = f'{BASE_URL}/datasets/{dataset_id}/items?token={token}'
            with urllib.request.urlopen(results_url, timeout=30) as resp:
                results = json.loads(resp.read())

        sent = sum(1 for r in results if r.get('status') == 'sent')
        failed = len(recipients) - sent

        result = {
            'success': status == 'SUCCEEDED',
            'channel': 'instagram_dm',
            'run_id': run_id,
            'status': status,
            'sent': sent,
            'failed': failed,
            'total_recipients': len(recipients),
        }

        out_str = json.dumps(result, indent=2, ensure_ascii=False)
        if args.output:
            os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
            with open(args.output, 'w') as f:
                f.write(out_str)
            print(json.dumps({'success': True, 'output_file': args.output, 'sent': sent}))
        else:
            print(out_str)

    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__,
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
