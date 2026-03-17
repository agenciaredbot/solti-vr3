#!/usr/bin/env python3
"""Send email campaign via Brevo API.

Usage:
  python3 send_email_campaign.py --sequence .tmp/sequence.json \
    --contacts .tmp/recipients.json --step 1 \
    --sender-name "Andrés" --sender-email "andres@redbot.app" \
    --confirmed

Output: JSON with {success, sent, failed, errors}
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

BREVO_URL = 'https://api.brevo.com/v3'
MAX_BATCH = 200  # Brevo free tier limit per batch


def personalize(template: str, lead: dict) -> str:
    """Replace {{lead.field}} placeholders with actual values."""
    def replace_tag(match):
        field = match.group(1)
        return str(lead.get(field, ''))
    return re.sub(r'\{\{lead\.(\w+)\}\}', replace_tag, template)


def send_single_email(api_key: str, sender: dict, to: dict,
                      subject: str, html_content: str) -> dict:
    """Send a single transactional email via Brevo."""
    url = f'{BREVO_URL}/smtp/email'
    data = {
        'sender': sender,
        'to': [to],
        'subject': subject,
        'htmlContent': html_content,
    }

    payload = json.dumps(data).encode()
    req = urllib.request.Request(
        url, data=payload,
        headers={
            'api-key': api_key,
            'Content-Type': 'application/json',
        }
    )

    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--sequence', required=True,
                        help='Sequence JSON file')
    parser.add_argument('--contacts', required=True,
                        help='Recipients JSON file (array of contacts)')
    parser.add_argument('--step', type=int, default=1,
                        help='Which step to send (1-based)')
    parser.add_argument('--subject', default=None,
                        help='Override subject template')
    parser.add_argument('--body', default=None,
                        help='HTML body content (or path to .html file)')
    parser.add_argument('--sender-name', default='Redbot',
                        help='Sender display name')
    parser.add_argument('--sender-email', default='agencia@theredbot.com',
                        help='Sender email (must be verified in Brevo)')
    parser.add_argument('--api-key', default=None,
                        help='Brevo API key (or BREVO_API_KEY env)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Preview without sending')
    parser.add_argument('--confirmed', action='store_true')
    parser.add_argument('--output', default=None)
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get('BREVO_API_KEY', '')
    if not api_key and not args.dry_run:
        print(json.dumps({
            'success': False,
            'error': 'No Brevo API key. Set BREVO_API_KEY or pass --api-key.',
            'suggestion': 'Use /connect to configure Brevo credentials.',
        }))
        sys.exit(1)

    try:
        # Load sequence
        with open(args.sequence) as f:
            seq_data = json.load(f)

        sequence = seq_data.get('sequence', seq_data)
        steps = sequence.get('steps', [])

        if args.step < 1 or args.step > len(steps):
            print(json.dumps({
                'success': False,
                'error': f'Step {args.step} not found. Sequence has {len(steps)} steps.',
            }))
            sys.exit(1)

        current_step = steps[args.step - 1]

        # Load contacts
        with open(args.contacts) as f:
            contacts_data = json.load(f)

        if isinstance(contacts_data, dict) and 'data' in contacts_data:
            contacts = contacts_data['data']
        elif isinstance(contacts_data, list):
            contacts = contacts_data
        else:
            contacts = [contacts_data]

        # Filter contacts with email
        recipients = [c for c in contacts if c.get('email') and '@' in c.get('email', '')]
        if not recipients:
            print(json.dumps({
                'success': False,
                'error': 'No contacts with valid email addresses.',
                'suggestion': 'Run /prospect ENRICH to add emails to contacts.',
            }))
            sys.exit(1)

        # Cap at max batch
        recipients = recipients[:MAX_BATCH]

        # Resolve subject and body
        subject_template = args.subject or current_step.get('subject_template', 'Mensaje para {{lead.name}}')

        # Load body from file if path provided
        body_template = args.body or ''
        if body_template and os.path.exists(body_template):
            with open(body_template) as f:
                body_template = f.read()

        if not body_template:
            body_template = '<p>{{lead.first_name}}, este mensaje fue generado por Solti.</p>'

        sender = {'name': args.sender_name, 'email': args.sender_email}

        if args.dry_run:
            # Preview mode
            preview = {
                'success': True,
                'dry_run': True,
                'channel': 'email',
                'step': args.step,
                'recipients': len(recipients),
                'sender': sender,
                'subject_template': subject_template,
                'sample_subject': personalize(subject_template, recipients[0]),
                'sample_preview': personalize(body_template, recipients[0])[:200],
            }
            print(json.dumps(preview, indent=2, ensure_ascii=False))
            return

        # Send emails
        sent = 0
        failed = 0
        errors = []

        for contact in recipients:
            try:
                name = f"{contact.get('first_name', '')} {contact.get('last_name', '')}".strip()
                # Build lead dict for personalization
                lead = {
                    'name': contact.get('name', name) or name,
                    'first_name': contact.get('first_name', ''),
                    'last_name': contact.get('last_name', ''),
                    'business': contact.get('business', '') or contact.get('name', name),
                    'email': contact.get('email', ''),
                    'city': contact.get('city', ''),
                    'website': contact.get('website', ''),
                    'phone': contact.get('phone', ''),
                }

                subject = personalize(subject_template, lead)
                body = personalize(body_template, lead)

                to = {'email': contact['email'], 'name': name}
                send_single_email(api_key, sender, to, subject, body)
                sent += 1

                # Rate limit: 1 email per 100ms
                time.sleep(0.1)

            except Exception as e:
                failed += 1
                errors.append({
                    'email': contact.get('email', 'unknown'),
                    'error': str(e),
                })

        result = {
            'success': True,
            'channel': 'email',
            'step': args.step,
            'sent': sent,
            'failed': failed,
            'total_recipients': len(recipients),
            'errors': errors[:10],  # Limit error details
        }

        out_str = json.dumps(result, indent=2, ensure_ascii=False)

        if args.output:
            os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
            with open(args.output, 'w') as f:
                f.write(out_str)
            print(json.dumps({
                'success': True,
                'output_file': args.output,
                'sent': sent,
                'failed': failed,
            }))
        else:
            print(out_str)

    except FileNotFoundError as e:
        print(json.dumps({
            'success': False,
            'error': f'File not found: {e.filename}',
            'suggestion': 'Generate the sequence first with generate_sequence.py.',
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
