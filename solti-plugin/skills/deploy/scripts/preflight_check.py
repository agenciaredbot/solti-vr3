#!/usr/bin/env python3
"""Pre-flight check before campaign deployment.

Usage:
  python3 preflight_check.py --channel email \
    --sequence .tmp/sequence.json --contacts .tmp/recipients.json

Output: JSON with {success, checks, all_passed}
"""

import argparse
import json
import os
import re
import sys

SPAM_TRIGGERS = [
    'free', 'gratis', 'act now', 'buy now', 'limited time',
    'click here', 'no obligation', 'winner', 'congratulations',
    'urgent', '100%', 'guarantee',
]

REQUIRED_FIELDS = {
    'email': ['email'],
    'instagram': ['instagram', 'username'],
    'linkedin': ['linkedin', 'profileUrl'],
    'whatsapp': ['phone', 'whatsapp'],
}


def check_credentials(channel: str) -> dict:
    """Check if required credentials are available."""
    env_map = {
        'email': 'BREVO_API_KEY',
        'instagram': 'APIFY_API_TOKEN',
        'linkedin': 'PHANTOMBUSTER_API_KEY',
        'whatsapp': 'EVOLUTION_API_KEY',
    }
    env_var = env_map.get(channel, '')
    has_key = bool(os.environ.get(env_var, ''))
    return {
        'name': 'credentials',
        'passed': has_key,
        'detail': f'{env_var} is set' if has_key else f'{env_var} not found in environment',
    }


def check_contacts(contacts: list, channel: str) -> dict:
    """Check contact list quality."""
    if not contacts:
        return {'name': 'contacts', 'passed': False, 'detail': 'No contacts provided'}

    required = REQUIRED_FIELDS.get(channel, ['email'])
    valid = 0
    for c in contacts:
        for field in required:
            if c.get(field):
                valid += 1
                break

    pct = (valid / len(contacts)) * 100
    return {
        'name': 'contacts',
        'passed': valid > 0,
        'detail': f'{valid}/{len(contacts)} contacts have required field ({pct:.0f}%)',
        'valid_count': valid,
        'total_count': len(contacts),
    }


def check_sequence(sequence: dict) -> dict:
    """Check sequence file validity."""
    steps = sequence.get('steps', [])
    if not steps:
        return {'name': 'sequence', 'passed': False, 'detail': 'No steps in sequence'}

    return {
        'name': 'sequence',
        'passed': True,
        'detail': f'{len(steps)} steps defined',
        'steps': len(steps),
    }


def check_spam(sequence: dict) -> dict:
    """Check for spam trigger words in content."""
    content = json.dumps(sequence).lower()
    found = [word for word in SPAM_TRIGGERS if word in content]
    return {
        'name': 'spam_check',
        'passed': len(found) == 0,
        'detail': f'Found spam triggers: {", ".join(found)}' if found else 'No spam triggers found',
        'triggers_found': found,
    }


def check_personalization(sequence: dict) -> dict:
    """Check that personalization tags are valid."""
    content = json.dumps(sequence)
    tags = re.findall(r'\{\{lead\.(\w+)\}\}', content)
    valid_fields = {'name', 'first_name', 'last_name', 'business', 'email',
                    'city', 'website', 'phone', 'score', 'instagram', 'linkedin'}
    invalid = [t for t in tags if t not in valid_fields]
    return {
        'name': 'personalization',
        'passed': len(invalid) == 0,
        'detail': f'Invalid tags: {invalid}' if invalid else f'{len(tags)} tags, all valid',
        'tags_found': list(set(tags)),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--channel', required=True,
                        choices=['email', 'instagram', 'linkedin', 'whatsapp'])
    parser.add_argument('--sequence', required=True,
                        help='Sequence JSON file')
    parser.add_argument('--contacts', required=True,
                        help='Contacts JSON file')
    args = parser.parse_args()

    checks = []

    # 1. Credentials
    checks.append(check_credentials(args.channel))

    # 2. Load and check contacts
    try:
        with open(args.contacts) as f:
            contacts_data = json.load(f)
        if isinstance(contacts_data, dict) and 'data' in contacts_data:
            contacts = contacts_data['data']
        elif isinstance(contacts_data, list):
            contacts = contacts_data
        else:
            contacts = [contacts_data]
        checks.append(check_contacts(contacts, args.channel))
    except FileNotFoundError:
        checks.append({'name': 'contacts', 'passed': False,
                       'detail': f'File not found: {args.contacts}'})
        contacts = []

    # 3. Load and check sequence
    try:
        with open(args.sequence) as f:
            seq_data = json.load(f)
        sequence = seq_data.get('sequence', seq_data)
        checks.append(check_sequence(sequence))
        checks.append(check_spam(sequence))
        checks.append(check_personalization(sequence))
    except FileNotFoundError:
        checks.append({'name': 'sequence', 'passed': False,
                       'detail': f'File not found: {args.sequence}'})

    all_passed = all(c['passed'] for c in checks)

    result = {
        'success': True,
        'all_passed': all_passed,
        'channel': args.channel,
        'checks': checks,
        'recommendation': 'Ready to deploy!' if all_passed else 'Fix failing checks before deploying.',
    }

    print(json.dumps(result, indent=2, ensure_ascii=False))
    if not all_passed:
        sys.exit(1)


if __name__ == '__main__':
    main()
