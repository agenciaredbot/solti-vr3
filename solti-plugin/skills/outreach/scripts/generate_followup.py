#!/usr/bin/env python3
"""Generate follow-up messages for non-responders.

Usage:
  python3 generate_followup.py --campaign-id <id> --step 2 \
    --voice context/my-voice.md --output .tmp/followup.json

This generates the follow-up structure. Claude writes the actual copy
using the prompt templates.

Output: JSON with {success, followup_data}
"""

import argparse
import json
import os
import sys

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--campaign-id', required=True,
                        help='Original campaign ID')
    parser.add_argument('--step', type=int, default=2,
                        help='Follow-up step number (2=first followup, 3=breakup)')
    parser.add_argument('--voice', default='context/my-voice.md',
                        help='Voice context file')
    parser.add_argument('--output', default=None)
    args = parser.parse_args()

    # Load original campaign
    tmp_dir = os.path.join(PLUGIN_DIR, '.tmp')
    campaign_file = os.path.join(tmp_dir, f'campaign_{args.campaign_id}.json')

    if not os.path.exists(campaign_file):
        print(json.dumps({
            'success': False,
            'error': f'Campaign file not found: {campaign_file}',
            'suggestion': 'Check campaign ID with check_campaign_status.py --list-recent',
        }))
        sys.exit(1)

    with open(campaign_file) as f:
        campaign = json.load(f)

    channel = campaign.get('channel', 'email')
    original_recipients = campaign.get('recipients', [])
    replied = set(campaign.get('replied', []))

    # Filter non-responders
    non_responders = [r for r in original_recipients
                      if r.get('email', r.get('username', '')) not in replied]

    step_type = 'followup' if args.step <= 3 else 'breakup'
    prompt_file = f'skills/outreach/assets/prompts/cold_email_{step_type}.txt'

    followup = {
        'success': True,
        'followup': {
            'campaign_id': args.campaign_id,
            'step': args.step,
            'type': step_type,
            'channel': channel,
            'non_responders': len(non_responders),
            'prompt_file': prompt_file,
            'recipients': non_responders,
            'instructions': (
                f'Generate a {step_type} message for {len(non_responders)} non-responders. '
                f'Read {args.voice} for tone. Read the original campaign for context. '
                f'Keep it shorter than the initial message.'
            ),
        },
    }

    out_str = json.dumps(followup, indent=2, ensure_ascii=False)
    if args.output:
        os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
        with open(args.output, 'w') as f:
            f.write(out_str)
        print(json.dumps({
            'success': True,
            'output_file': args.output,
            'non_responders': len(non_responders),
        }))
    else:
        print(out_str)


if __name__ == '__main__':
    main()
