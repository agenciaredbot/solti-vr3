#!/usr/bin/env python3
"""Check WhatsApp instance status via Evolution API.

Usage:
  python3 check_status.py --instance "my-instance"
  python3 check_status.py --all

Output: JSON with {success, instances}
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error


def fetch_instances(base_url: str, api_key: str) -> list:
    """Fetch all instances from Evolution API."""
    url = f'{base_url}/instance/fetchInstances'
    req = urllib.request.Request(url, headers={'apikey': api_key})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def get_connection_state(base_url: str, api_key: str, name: str) -> dict:
    """Get connection state for a specific instance."""
    url = f'{base_url}/instance/connectionState/{name}'
    req = urllib.request.Request(url, headers={'apikey': api_key})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--instance', default=None,
                        help='Specific instance to check')
    parser.add_argument('--all', action='store_true',
                        help='Check all instances')
    parser.add_argument('--api-key', default=None)
    parser.add_argument('--api-url', default=None)
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get('EVOLUTION_API_KEY', '')
    base_url = (args.api_url or os.environ.get('EVOLUTION_API_URL', 'http://localhost:8080')).rstrip('/')

    if not api_key:
        print(json.dumps({
            'success': False,
            'error': 'No Evolution API key.',
            'suggestion': 'Set EVOLUTION_API_KEY or use /connect.',
        }))
        sys.exit(1)

    try:
        if args.instance:
            state = get_connection_state(base_url, api_key, args.instance)
            # API returns {"instance": {"instanceName": "...", "state": "open"}}
            instance_state = state.get('instance', {}).get('state', 'unknown')
            print(json.dumps({
                'success': True,
                'instance': args.instance,
                'state': instance_state,
                'detail': state,
            }, indent=2, ensure_ascii=False))

        elif args.all:
            instances = fetch_instances(base_url, api_key)
            summaries = []
            for inst in instances:
                name = inst.get('instanceName', inst.get('name', 'unknown'))
                try:
                    state = get_connection_state(base_url, api_key, name)
                    status = state.get('state', 'unknown')
                except Exception:
                    status = 'error'

                summaries.append({
                    'name': name,
                    'status': status,
                    'phone': inst.get('owner', ''),
                })

            connected = sum(1 for s in summaries if s['status'] == 'open')
            print(json.dumps({
                'success': True,
                'total': len(summaries),
                'connected': connected,
                'disconnected': len(summaries) - connected,
                'instances': summaries,
            }, indent=2, ensure_ascii=False))

        else:
            print(json.dumps({
                'success': False,
                'error': 'Specify --instance <name> or --all',
            }))
            sys.exit(1)

    except urllib.error.URLError as e:
        print(json.dumps({
            'success': False,
            'error': f'Cannot reach Evolution API at {base_url}',
            'suggestion': 'Check that Evolution is running.',
        }))
        sys.exit(1)

    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__,
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
