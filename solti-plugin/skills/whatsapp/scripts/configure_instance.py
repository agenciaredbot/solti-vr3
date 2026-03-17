#!/usr/bin/env python3
"""Configure a WhatsApp instance (system prompt, auto-reply, greeting).

Usage:
  python3 configure_instance.py --instance "my-instance" \
    --system-prompt "You are a helpful assistant..." \
    --auto-reply true \
    --greeting "Hola! En qué puedo ayudarte?"

Output: JSON with {success, instance, config}
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
    parser.add_argument('--system-prompt', default=None,
                        help='System prompt for AI responses')
    parser.add_argument('--auto-reply', default=None,
                        choices=['true', 'false'],
                        help='Enable/disable auto-reply')
    parser.add_argument('--greeting', default=None,
                        help='Greeting message for new conversations')
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
        # Build settings update
        settings = {}
        if args.system_prompt is not None:
            settings['systemPrompt'] = args.system_prompt
        if args.auto_reply is not None:
            settings['autoReply'] = args.auto_reply == 'true'
        if args.greeting is not None:
            settings['greetingMessage'] = args.greeting

        if not settings:
            print(json.dumps({
                'success': False,
                'error': 'No configuration changes specified.',
                'suggestion': 'Use --system-prompt, --auto-reply, or --greeting.',
            }))
            sys.exit(1)

        # Update instance settings (Evolution API uses POST /settings/set/)
        url = f'{base_url}/settings/set/{args.instance}'
        payload = json.dumps(settings).encode()
        req = urllib.request.Request(
            url, data=payload,
            method='POST',
            headers={
                'apikey': api_key,
                'Content-Type': 'application/json',
            }
        )

        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())

        output = {
            'success': True,
            'instance': args.instance,
            'updated_settings': list(settings.keys()),
            'config': settings,
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

    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__,
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
