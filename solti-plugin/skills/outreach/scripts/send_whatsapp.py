#!/usr/bin/env python3
"""Send WhatsApp messages via Evolution API.

Usage:
  python3 send_whatsapp.py --instance "my-instance" \
    --contacts .tmp/recipients.json --message "Hola {{lead.first_name}}" \
    --confirmed

Output: JSON with {success, sent, failed}
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

MAX_MESSAGES = 50  # Rate limit per batch


def personalize(template: str, lead: dict) -> str:
    """Replace {{lead.field}} placeholders."""
    def replace_tag(match):
        field = match.group(1)
        return str(lead.get(field, ''))
    return re.sub(r'\{\{lead\.(\w+)\}\}', replace_tag, template)


def normalize_phone(phone: str) -> str:
    """Normalize phone number for WhatsApp (digits only, with country code)."""
    digits = re.sub(r'[^\d]', '', phone)
    # Ensure Colombian country code
    if digits.startswith('57') and len(digits) >= 12:
        return digits
    if digits.startswith('3') and len(digits) == 10:
        return '57' + digits
    return digits


def send_text(base_url: str, api_key: str, instance: str,
              phone: str, message: str) -> dict:
    """Send a text message via Evolution API."""
    url = f'{base_url}/message/sendText/{instance}'
    data = {
        'number': phone,
        'text': message,
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode(),
        headers={
            'apikey': api_key,
            'Content-Type': 'application/json',
        }
    )

    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--instance', required=True,
                        help='Evolution API instance name')
    parser.add_argument('--contacts', required=True,
                        help='JSON file with contacts (need phone field)')
    parser.add_argument('--message', required=True,
                        help='Message template with {{lead.field}} tags')
    parser.add_argument('--api-key', default=None,
                        help='Evolution API key (or EVOLUTION_API_KEY env)')
    parser.add_argument('--api-url', default=None,
                        help='Evolution API base URL (or EVOLUTION_API_URL env)')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--confirmed', action='store_true')
    parser.add_argument('--output', default=None)
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get('EVOLUTION_API_KEY', '')
    base_url = (args.api_url or os.environ.get('EVOLUTION_API_URL', 'http://localhost:8080')).rstrip('/')

    if not api_key and not args.dry_run:
        print(json.dumps({
            'success': False,
            'error': 'No Evolution API key.',
            'suggestion': 'Set EVOLUTION_API_KEY or use /connect.',
        }))
        sys.exit(1)

    try:
        with open(args.contacts) as f:
            contacts_data = json.load(f)

        if isinstance(contacts_data, dict) and 'data' in contacts_data:
            contacts = contacts_data['data']
        elif isinstance(contacts_data, list):
            contacts = contacts_data
        else:
            contacts = [contacts_data]

        # Filter contacts with phone
        recipients = []
        for c in contacts:
            phone = c.get('phone', '') or c.get('whatsapp', '') or c.get('phoneNumber', '')
            if phone:
                normalized = normalize_phone(phone)
                if len(normalized) >= 10:
                    recipients.append({**c, 'normalized_phone': normalized})

        if not recipients:
            print(json.dumps({
                'success': False,
                'error': 'No contacts with valid phone numbers.',
            }))
            sys.exit(1)

        recipients = recipients[:MAX_MESSAGES]

        if args.dry_run:
            sample = personalize(args.message, recipients[0])
            print(json.dumps({
                'success': True,
                'dry_run': True,
                'channel': 'whatsapp',
                'instance': args.instance,
                'recipients': len(recipients),
                'sample_message': sample,
                'sample_phone': recipients[0]['normalized_phone'],
            }, indent=2, ensure_ascii=False))
            return

        sent = 0
        failed = 0
        errors = []

        for contact in recipients:
            try:
                msg = personalize(args.message, contact)
                send_text(base_url, api_key, args.instance,
                         contact['normalized_phone'], msg)
                sent += 1
                # Rate limit: 1 msg per 2 seconds (WhatsApp is strict)
                time.sleep(2)

            except Exception as e:
                failed += 1
                errors.append({
                    'phone': contact.get('phone', 'unknown'),
                    'error': str(e),
                })

        result = {
            'success': True,
            'channel': 'whatsapp',
            'instance': args.instance,
            'sent': sent,
            'failed': failed,
            'total_recipients': len(recipients),
            'errors': errors[:10],
        }

        out_str = json.dumps(result, indent=2, ensure_ascii=False)
        if args.output:
            os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
            with open(args.output, 'w') as f:
                f.write(out_str)
            print(json.dumps({'success': True, 'output_file': args.output, 'sent': sent}))
        else:
            print(out_str)

    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__,
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
