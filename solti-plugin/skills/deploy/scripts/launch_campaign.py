#!/usr/bin/env python3
"""Launch a campaign after pre-flight checks pass.

Usage:
  python3 launch_campaign.py --channel email \
    --sequence .tmp/sequence.json --contacts .tmp/recipients.json \
    --step 1 --sender-name "Andrés" --sender-email "andres@redbot.app" \
    --confirmed

This is the orchestrator that:
1. Runs pre-flight
2. Delegates to the appropriate send script
3. Saves campaign record to .tmp/

Output: JSON with {success, campaign_id, results}
"""

import argparse
import json
import os
import subprocess
import sys
import uuid
from datetime import datetime

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--channel', required=True,
                        choices=['email', 'instagram', 'linkedin', 'whatsapp'])
    parser.add_argument('--sequence', required=True)
    parser.add_argument('--contacts', required=True)
    parser.add_argument('--step', type=int, default=1)
    parser.add_argument('--sender-name', default='Solti')
    parser.add_argument('--sender-email', default=None)
    parser.add_argument('--instance', default=None,
                        help='WhatsApp instance name')
    parser.add_argument('--message', default=None,
                        help='Message template for DM channels')
    parser.add_argument('--confirmed', action='store_true')
    args = parser.parse_args()

    campaign_id = str(uuid.uuid4())[:8]
    timestamp = datetime.now().isoformat()

    # Step 1: Pre-flight
    preflight_cmd = [
        'python3', os.path.join(PLUGIN_DIR, 'skills/deploy/scripts/preflight_check.py'),
        '--channel', args.channel,
        '--sequence', args.sequence,
        '--contacts', args.contacts,
    ]

    preflight = subprocess.run(preflight_cmd, capture_output=True, text=True)
    if preflight.returncode != 0:
        try:
            result = json.loads(preflight.stdout)
        except json.JSONDecodeError:
            result = {'error': preflight.stderr or preflight.stdout}
        print(json.dumps({
            'success': False,
            'campaign_id': campaign_id,
            'stage': 'preflight',
            'error': 'Pre-flight checks failed',
            'detail': result,
        }, indent=2, ensure_ascii=False))
        sys.exit(1)

    # Step 2: Delegate to send script
    send_scripts = {
        'email': 'skills/outreach/scripts/send_email_campaign.py',
        'instagram': 'skills/outreach/scripts/send_instagram_dm.py',
        'linkedin': 'skills/outreach/scripts/send_linkedin_dm.py',
        'whatsapp': 'skills/outreach/scripts/send_whatsapp.py',
    }

    script = os.path.join(PLUGIN_DIR, send_scripts[args.channel])
    output_file = os.path.join(PLUGIN_DIR, f'.tmp/campaign_{campaign_id}_results.json')

    send_cmd = ['python3', script]

    if args.channel == 'email':
        send_cmd += [
            '--sequence', args.sequence,
            '--contacts', args.contacts,
            '--step', str(args.step),
            '--sender-name', args.sender_name,
            '--sender-email', args.sender_email or 'noreply@solti.app',
            '--output', output_file,
            '--confirmed',
        ]
    elif args.channel == 'whatsapp':
        send_cmd += [
            '--instance', args.instance or 'default',
            '--contacts', args.contacts,
            '--message', args.message or 'Hola {{lead.first_name}}',
            '--output', output_file,
            '--confirmed',
        ]
    elif args.channel in ('instagram', 'linkedin'):
        send_cmd += [
            '--message', args.message or 'Hola {{lead.first_name}}',
            '--' + ('usernames' if args.channel == 'instagram' else 'profiles'), args.contacts,
            '--output', output_file,
            '--confirmed',
        ]

    send = subprocess.run(send_cmd, capture_output=True, text=True)

    try:
        send_result = json.loads(send.stdout)
    except json.JSONDecodeError:
        send_result = {'raw_output': send.stdout, 'raw_error': send.stderr}

    # Step 3: Save campaign record
    campaign_record = {
        'campaign_id': campaign_id,
        'channel': args.channel,
        'step': args.step,
        'name': f'{args.channel}_campaign_{campaign_id}',
        'status': 'completed' if send.returncode == 0 else 'failed',
        'created_at': timestamp,
        'results': send_result,
        'recipients': [],  # Will be filled from contacts file
        'replied': [],     # Will be updated by check_campaign_status
    }

    record_file = os.path.join(PLUGIN_DIR, f'.tmp/campaign_{campaign_id}.json')
    os.makedirs(os.path.dirname(record_file), exist_ok=True)
    with open(record_file, 'w') as f:
        json.dump(campaign_record, f, indent=2, ensure_ascii=False)

    # Final output
    result = {
        'success': send.returncode == 0,
        'campaign_id': campaign_id,
        'channel': args.channel,
        'status': campaign_record['status'],
        'results': send_result,
        'record_file': record_file,
    }

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
