#!/usr/bin/env python3
"""Export WhatsApp conversation logs from Evolution API.

Usage:
  python3 export_conversations.py --instance "my-instance" \
    --limit 20 --output .tmp/wa_conversations.json
  python3 export_conversations.py --instance "my-instance" \
    --contact 573042651486

Output: JSON with {success, conversations}

NOTE: Evolution API findMessages uses POST with JSON body.
Response format: {messages: {total, pages, currentPage, records: [...]}}
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
    parser.add_argument('--instance', required=True,
                        help='Instance name')
    parser.add_argument('--contact', default=None,
                        help='Filter by contact phone number (e.g. 573042651486)')
    parser.add_argument('--limit', type=int, default=20,
                        help='Max messages to export')
    parser.add_argument('--api-key', default=None)
    parser.add_argument('--api-url', default=None)
    parser.add_argument('--output', default=None)
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get('EVOLUTION_API_KEY', '')
    base_url = (args.api_url or os.environ.get('EVOLUTION_API_URL', 'http://localhost:8080')).rstrip('/')

    if not api_key:
        print(json.dumps({
            'success': False,
            'error': 'No Evolution API key.',
        }))
        sys.exit(1)

    try:
        url = f'{base_url}/chat/findMessages/{args.instance}'

        # Build POST body (Evolution API requires POST with JSON)
        body = {'limit': args.limit}
        if args.contact:
            # Normalize: add @s.whatsapp.net if not present
            jid = args.contact
            if '@' not in jid:
                jid = f'{jid}@s.whatsapp.net'
            body['where'] = {'key': {'remoteJid': jid}}

        payload = json.dumps(body).encode()
        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                'apikey': api_key,
                'Content-Type': 'application/json',
            }
        )

        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())

        # Response: {messages: {total, pages, currentPage, records: [...]}}
        records = data.get('messages', {}).get('records', [])

        # Format messages
        conversations = []
        for msg in records:
            text = (msg.get('message', {}).get('conversation', '')
                    or msg.get('message', {}).get('extendedTextMessage', {}).get('text', '')
                    or f'[{msg.get("messageType", "unknown")}]')
            conversations.append({
                'from': msg.get('key', {}).get('remoteJid', 'unknown'),
                'direction': 'outgoing' if msg.get('key', {}).get('fromMe') else 'incoming',
                'text': text,
                'timestamp': msg.get('messageTimestamp', ''),
                'message_type': msg.get('messageType', ''),
            })

        result = {
            'success': True,
            'instance': args.instance,
            'count': len(conversations),
            'total_available': data.get('messages', {}).get('total', len(conversations)),
            'conversations': conversations,
        }

        out_str = json.dumps(result, indent=2, ensure_ascii=False)
        if args.output:
            os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
            with open(args.output, 'w') as f:
                f.write(out_str)
            print(json.dumps({'success': True, 'output_file': args.output, 'count': len(conversations)}))
        else:
            print(out_str)

    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ''
        print(json.dumps({
            'success': False,
            'error': f'Evolution API error: HTTP {e.code}',
            'detail': body[:200],
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
