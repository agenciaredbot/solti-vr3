#!/usr/bin/env python3
"""Create a new WhatsApp instance via Evolution API.

Usage:
  python3 create_instance.py --name "my-instance" \
    --webhook-url "https://hub.solti.app/webhooks/evolution" --confirmed

Output: JSON with {success, instance, qr_code_url}
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--name', required=True,
                        help='Instance name (kebab-case)')
    parser.add_argument('--webhook-url', default=None,
                        help='Webhook URL for incoming messages')
    parser.add_argument('--api-key', default=None,
                        help='Evolution API key (or EVOLUTION_API_KEY env)')
    parser.add_argument('--api-url', default=None,
                        help='Evolution API URL (or EVOLUTION_API_URL env)')
    parser.add_argument('--confirmed', action='store_true')
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
        # Create instance
        url = f'{base_url}/instance/create'
        data = {
            'instanceName': args.name,
            'integration': 'WHATSAPP-BAILEYS',
            'qrcode': True,
        }

        if args.webhook_url:
            data['webhook'] = {
                'url': args.webhook_url,
                'events': [
                    'messages.upsert',
                    'connection.update',
                    'messages.update',
                ],
            }

        payload = json.dumps(data).encode()
        req = urllib.request.Request(
            url, data=payload,
            headers={
                'apikey': api_key,
                'Content-Type': 'application/json',
            }
        )

        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())

        # Get QR code
        qr_url = f'{base_url}/instance/connect/{args.name}'
        req = urllib.request.Request(qr_url, headers={'apikey': api_key})
        with urllib.request.urlopen(req, timeout=15) as resp:
            qr_data = json.loads(resp.read())

        output = {
            'success': True,
            'instance': args.name,
            'status': 'created',
            'qr_code': qr_data.get('base64', ''),
            'qr_url': f'{base_url}/instance/connect/{args.name}',
            'next_step': 'Scan the QR code with WhatsApp on your phone to connect.',
        }

        print(json.dumps(output, indent=2, ensure_ascii=False))

    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ''
        print(json.dumps({
            'success': False,
            'error': f'Evolution API error: HTTP {e.code}',
            'detail': body[:200],
        }))
        sys.exit(1)

    except urllib.error.URLError as e:
        print(json.dumps({
            'success': False,
            'error': f'Cannot reach Evolution API at {base_url}',
            'suggestion': 'Check that Evolution is running (docker compose up).',
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
