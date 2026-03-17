#!/usr/bin/env python3
"""Send test email via Hub/Brevo for QA.

Usage:
  python3 test_send.py --to agenciaredbot@gmail.com --subject "Test" --body "Hello"
  python3 test_send.py --to test@example.com --template .tmp/email.html --lead-id abc123
"""

import argparse
import json
import os
import sys

SKILLS_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(SKILLS_DIR, 'connect', 'scripts'))

from hub_client import HubClient


def main():
    parser = argparse.ArgumentParser(description='Send test email via Brevo')
    parser.add_argument('--to', required=True, help='Recipient email (test address only!)')
    parser.add_argument('--subject', default='[TEST] Solti QA Email', help='Email subject')
    parser.add_argument('--body', help='Inline HTML body')
    parser.add_argument('--template', help='Path to HTML template file')
    parser.add_argument('--lead-id', help='CRM contact ID for personalization')
    args = parser.parse_args()

    # Safety: Only allow sending to known test addresses
    allowed_domains = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'theredbot.com']
    domain = args.to.split('@')[-1].lower()
    if domain not in allowed_domains:
        print(json.dumps({
            'error': f'Test sends only allowed to personal email domains ({", ".join(allowed_domains)})',
            'suggestion': 'Use your personal email for test sends, not leads',
        }, indent=2))
        sys.exit(1)

    # Load template or body
    if args.template:
        try:
            with open(args.template, 'r') as f:
                html = f.read()
        except FileNotFoundError:
            print(json.dumps({'error': f'Template not found: {args.template}'}, indent=2))
            sys.exit(1)
    elif args.body:
        html = args.body
    else:
        html = '<h1>Solti QA Test</h1><p>This is a test email from Solti Hub.</p>'

    # Personalize with lead data if provided
    if args.lead_id:
        try:
            client = HubClient()
            lead = client.get(f'/contacts/{args.lead_id}')
            lead_data = lead.get('data', lead)
            # Simple replacement
            for key in ['firstName', 'lastName', 'email', 'phone', 'city', 'website']:
                html = html.replace(f'{{{key}}}', str(lead_data.get(key, f'[{key}]')))
        except Exception:
            pass

    # Send via Hub
    try:
        client = HubClient()
        result = client.post('/services/execute', json_data={
            'service': 'brevo',
            'action': 'send_email',
            'params': {
                'to': args.to,
                'toName': 'QA Test',
                'subject': args.subject,
                'html': html,
            },
        })

        if result.get('data', {}).get('success'):
            message_id = result.get('data', {}).get('data', {}).get('messageId', 'unknown')
            print(json.dumps({
                'action': 'test_send',
                'status': 'SENT',
                'to': args.to,
                'subject': args.subject,
                'messageId': message_id,
                'note': f'Check inbox at {args.to}',
            }, indent=2))
        else:
            print(json.dumps({
                'action': 'test_send',
                'status': 'FAILED',
                'error': result.get('error', result),
            }, indent=2))
            sys.exit(1)

    except RuntimeError as e:
        print(json.dumps({
            'error': str(e),
            'suggestion': 'Hub must be online to send test emails',
        }, indent=2))
        sys.exit(1)


if __name__ == '__main__':
    main()
