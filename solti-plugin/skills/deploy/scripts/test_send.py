#!/usr/bin/env python3
"""Send a test message before campaign deployment.

Usage:
  python3 test_send.py --channel email --sequence .tmp/sequence.json \
    --test-email "me@example.com" --step 1

Output: JSON with {success, channel, test_recipient, message_preview}
"""

import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.error

BREVO_URL = 'https://api.brevo.com/v3'


def personalize(template: str, lead: dict) -> str:
    """Replace {{lead.field}} placeholders."""
    def replace_tag(match):
        field = match.group(1)
        return str(lead.get(field, ''))
    return re.sub(r'\{\{lead\.(\w+)\}\}', replace_tag, template)


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--channel', required=True,
                        choices=['email', 'whatsapp'])
    parser.add_argument('--sequence', required=True,
                        help='Sequence JSON file')
    parser.add_argument('--step', type=int, default=1,
                        help='Step to test (1-based)')
    parser.add_argument('--test-email', default=None,
                        help='Test email address')
    parser.add_argument('--test-phone', default=None,
                        help='Test WhatsApp number')
    parser.add_argument('--sender-name', default='Solti Test',
                        help='Sender name for email')
    parser.add_argument('--sender-email', default=None,
                        help='Sender email')
    args = parser.parse_args()

    try:
        with open(args.sequence) as f:
            seq_data = json.load(f)

        sequence = seq_data.get('sequence', seq_data)
        steps = sequence.get('steps', [])

        if args.step < 1 or args.step > len(steps):
            print(json.dumps({
                'success': False,
                'error': f'Step {args.step} not found.',
            }))
            sys.exit(1)

        current_step = steps[args.step - 1]

        # Create a fake lead for test
        test_lead = {
            'name': 'Test Lead',
            'first_name': 'Test',
            'last_name': 'Lead',
            'business': 'Test Company',
            'email': args.test_email or 'test@test.com',
            'city': 'Bogotá',
            'website': 'https://test.com',
            'phone': args.test_phone or '+573001234567',
        }

        if args.channel == 'email':
            if not args.test_email:
                print(json.dumps({
                    'success': False,
                    'error': 'Test email required (--test-email)',
                }))
                sys.exit(1)

            api_key = os.environ.get('BREVO_API_KEY', '')
            if not api_key:
                # Dry run — just show preview
                subject = personalize(
                    current_step.get('subject_template', 'Test'),
                    test_lead
                )
                print(json.dumps({
                    'success': True,
                    'dry_run': True,
                    'channel': 'email',
                    'step': args.step,
                    'subject': subject,
                    'test_email': args.test_email,
                    'note': 'No BREVO_API_KEY set — showing preview only.',
                }, indent=2, ensure_ascii=False))
                return

            subject = personalize(
                current_step.get('subject_template', 'Test email from Solti'),
                test_lead
            )

            sender_email = args.sender_email or os.environ.get('SENDER_EMAIL', 'agencia@theredbot.com')
            url = f'{BREVO_URL}/smtp/email'
            data = {
                'sender': {'name': args.sender_name, 'email': sender_email},
                'to': [{'email': args.test_email, 'name': 'Test Recipient'}],
                'subject': f'[TEST] {subject}',
                'htmlContent': '<p>This is a test email from Solti /deploy pre-flight.</p>',
            }

            req = urllib.request.Request(
                url, data=json.dumps(data).encode(),
                headers={'api-key': api_key, 'Content-Type': 'application/json'}
            )

            with urllib.request.urlopen(req, timeout=15) as resp:
                send_result = json.loads(resp.read())

            print(json.dumps({
                'success': True,
                'channel': 'email',
                'step': args.step,
                'test_email': args.test_email,
                'subject': f'[TEST] {subject}',
                'message_id': send_result.get('messageId', ''),
                'note': 'Check your inbox for the test email.',
            }, indent=2, ensure_ascii=False))

        elif args.channel == 'whatsapp':
            print(json.dumps({
                'success': True,
                'dry_run': True,
                'channel': 'whatsapp',
                'step': args.step,
                'test_phone': args.test_phone,
                'note': 'WhatsApp test send requires Evolution API. Use /whatsapp to verify.',
            }, indent=2, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__,
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
