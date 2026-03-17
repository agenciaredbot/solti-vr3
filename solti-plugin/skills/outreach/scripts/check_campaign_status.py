#!/usr/bin/env python3
"""Check campaign sending status and stats.

Usage:
  python3 check_campaign_status.py --campaign-id <id>
  python3 check_campaign_status.py --list-recent

For Phase 1-2 (local mode), reads from .tmp/campaign_*.json files.
For Phase 3+ (Hub mode), queries Hub API.

Output: JSON with {success, campaign, stats}
"""

import argparse
import glob
import json
import os
import sys


PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TMP_DIR = os.path.join(PLUGIN_DIR, '.tmp')


def list_campaigns() -> dict:
    """List recent campaign files from .tmp/."""
    pattern = os.path.join(TMP_DIR, 'campaign_*.json')
    files = sorted(glob.glob(pattern), reverse=True)

    campaigns = []
    for f in files[:20]:
        try:
            with open(f) as fh:
                data = json.load(fh)
            campaigns.append({
                'file': os.path.basename(f),
                'name': data.get('name', 'unnamed'),
                'channel': data.get('channel', 'unknown'),
                'sent': data.get('sent', 0),
                'status': data.get('status', 'unknown'),
                'created_at': data.get('created_at', ''),
            })
        except (json.JSONDecodeError, KeyError):
            continue

    return {
        'success': True,
        'count': len(campaigns),
        'campaigns': campaigns,
    }


def get_campaign(campaign_id: str) -> dict:
    """Get details for a specific campaign."""
    # Try direct file
    filepath = os.path.join(TMP_DIR, f'campaign_{campaign_id}.json')
    if not os.path.exists(filepath):
        # Try matching partial ID
        pattern = os.path.join(TMP_DIR, f'campaign_*{campaign_id}*.json')
        matches = glob.glob(pattern)
        if matches:
            filepath = matches[0]
        else:
            return {
                'success': False,
                'error': f'Campaign not found: {campaign_id}',
                'suggestion': 'Use --list-recent to see available campaigns.',
            }

    with open(filepath) as f:
        data = json.load(f)

    return {
        'success': True,
        'campaign': data,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--campaign-id', default=None,
                        help='Campaign ID to check')
    parser.add_argument('--list-recent', action='store_true',
                        help='List recent campaigns')
    args = parser.parse_args()

    if args.list_recent:
        result = list_campaigns()
    elif args.campaign_id:
        result = get_campaign(args.campaign_id)
    else:
        result = {
            'success': False,
            'error': 'Specify --campaign-id <id> or --list-recent',
        }

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
