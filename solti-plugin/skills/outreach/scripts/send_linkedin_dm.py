#!/usr/bin/env python3
"""Send LinkedIn messages via PhantomBuster.

Usage:
  python3 send_linkedin_dm.py --message "Hello {{lead.name}}" \
    --profiles .tmp/linkedin_profiles.json --confirmed

Output: JSON with {success, sent, failed, container_id}
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

PB_URL = 'https://api.phantombuster.com/api/v2'
MAX_DMS = 50  # Daily limit recommendation


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
                        help='Message template')
    parser.add_argument('--profiles', required=True,
                        help='JSON file with LinkedIn profiles')
    parser.add_argument('--phantom-id', default=None,
                        help='PhantomBuster phantom ID for LinkedIn Message Sender')
    parser.add_argument('--session-cookie', default=None,
                        help='LinkedIn session cookie (or LI_SESSION_COOKIE env)')
    parser.add_argument('--api-key', default=None,
                        help='PhantomBuster API key (or PHANTOMBUSTER_API_KEY env)')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--confirmed', action='store_true')
    parser.add_argument('--output', default=None)
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get('PHANTOMBUSTER_API_KEY', '')
    session_cookie = args.session_cookie or os.environ.get('LI_SESSION_COOKIE', '')

    if not api_key:
        print(json.dumps({
            'success': False,
            'error': 'No PhantomBuster API key.',
            'suggestion': 'Set PHANTOMBUSTER_API_KEY or use /connect.',
        }))
        sys.exit(1)

    if not session_cookie and not args.dry_run:
        print(json.dumps({
            'success': False,
            'error': 'No LinkedIn session cookie.',
            'suggestion': 'Set LI_SESSION_COOKIE or use /connect to import.',
        }))
        sys.exit(1)

    try:
        with open(args.profiles) as f:
            profiles_data = json.load(f)

        if isinstance(profiles_data, dict) and 'data' in profiles_data:
            profiles = profiles_data['data']
        elif isinstance(profiles_data, list):
            profiles = profiles_data
        else:
            profiles = [profiles_data]

        # Filter profiles with LinkedIn URL
        recipients = []
        for p in profiles:
            linkedin = p.get('linkedin', '') or p.get('profileUrl', '') or p.get('linkedinUrl', '')
            if linkedin and 'linkedin.com' in linkedin:
                recipients.append({**p, 'profileUrl': linkedin})

        if not recipients:
            print(json.dumps({
                'success': False,
                'error': 'No contacts with LinkedIn profile URLs.',
                'suggestion': 'Enrich contacts with /prospect to find LinkedIn profiles.',
            }))
            sys.exit(1)

        recipients = recipients[:MAX_DMS]

        if args.dry_run:
            sample = personalize(args.message, recipients[0]) if recipients else args.message
            print(json.dumps({
                'success': True,
                'dry_run': True,
                'channel': 'linkedin_dm',
                'recipients': len(recipients),
                'sample_message': sample,
                'profiles': [r['profileUrl'] for r in recipients[:5]],
            }, indent=2, ensure_ascii=False))
            return

        # Build messages with personalization
        messages = []
        for r in recipients:
            msg = personalize(args.message, r)
            messages.append({
                'profileUrl': r['profileUrl'],
                'message': msg,
            })

        # Launch PhantomBuster phantom
        phantom_id = args.phantom_id or os.environ.get('PB_LINKEDIN_DM_PHANTOM', '')
        if not phantom_id:
            print(json.dumps({
                'success': False,
                'error': 'No phantom ID for LinkedIn Message Sender.',
                'suggestion': 'Set PB_LINKEDIN_DM_PHANTOM or pass --phantom-id.',
            }))
            sys.exit(1)

        launch_url = f'{PB_URL}/agents/launch'
        launch_data = {
            'id': phantom_id,
            'argument': {
                'sessionCookie': session_cookie,
                'messages': messages,
            },
        }

        req = urllib.request.Request(
            launch_url,
            data=json.dumps(launch_data).encode(),
            headers={
                'X-Phantombuster-Key': api_key,
                'Content-Type': 'application/json',
            }
        )

        with urllib.request.urlopen(req, timeout=30) as resp:
            launch_result = json.loads(resp.read())

        container_id = launch_result.get('data', {}).get('containerId', '')

        # Wait for completion
        start = time.time()
        status = 'running'
        while time.time() - start < 300:
            check_url = f'{PB_URL}/agents/fetch-output?id={container_id}'
            req = urllib.request.Request(
                check_url,
                headers={'X-Phantombuster-Key': api_key}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                output = json.loads(resp.read())
            status = output.get('data', {}).get('status', 'running')
            if status in ('finished', 'error'):
                break
            time.sleep(10)

        result = {
            'success': status == 'finished',
            'channel': 'linkedin_dm',
            'container_id': container_id,
            'status': status,
            'total_recipients': len(recipients),
        }

        out_str = json.dumps(result, indent=2, ensure_ascii=False)
        if args.output:
            os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
            with open(args.output, 'w') as f:
                f.write(out_str)
            print(json.dumps({'success': True, 'output_file': args.output}))
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
