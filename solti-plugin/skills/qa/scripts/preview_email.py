#!/usr/bin/env python3
"""Preview email template with real CRM data.

Usage:
  python3 preview_email.py --template .tmp/email_template.html --lead-id abc123
  python3 preview_email.py --template .tmp/email_template.html --sample
  python3 preview_email.py --body "Hola {firstName}, ..." --lead-id abc123
"""

import argparse
import json
import os
import re
import sys

SKILLS_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(SKILLS_DIR, 'connect', 'scripts'))

from hub_client import HubClient


def get_lead_data(client: HubClient, lead_id: str = None) -> dict:
    """Get lead data from CRM."""
    if lead_id:
        result = client.get(f'/contacts/{lead_id}')
        return result.get('data', result)
    else:
        # Get first contact as sample
        result = client.get('/contacts', params={'limit': '1', 'sortBy': 'score', 'sortDir': 'desc'})
        contacts = result.get('data', [])
        return contacts[0] if contacts else {}


def render_template(template: str, lead: dict) -> str:
    """Replace {field} placeholders with lead data."""
    replacements = {
        'firstName': lead.get('firstName', '[Nombre]'),
        'lastName': lead.get('lastName', '[Apellido]'),
        'fullName': f"{lead.get('firstName', '')} {lead.get('lastName', '')}".strip() or '[Nombre Completo]',
        'email': lead.get('email', '[email]'),
        'phone': lead.get('phone', '[teléfono]'),
        'company': f"{lead.get('firstName', '')} {lead.get('lastName', '')}".strip(),
        'city': lead.get('city', '[ciudad]'),
        'country': lead.get('country', '[país]'),
        'source': lead.get('source', '[fuente]'),
        'score': str(lead.get('score', 0)),
        'website': lead.get('website', '[sitio web]'),
    }

    # Add custom fields
    custom = lead.get('customFields', {})
    if isinstance(custom, dict):
        for k, v in custom.items():
            replacements[k] = str(v)

    rendered = template
    for key, value in replacements.items():
        rendered = rendered.replace(f'{{{key}}}', value)
        rendered = rendered.replace(f'{{{{ {key} }}}}', value)  # Jinja-style

    return rendered


def find_unresolved(rendered: str) -> list:
    """Find unresolved placeholders."""
    return re.findall(r'\{(\w+)\}', rendered)


def main():
    parser = argparse.ArgumentParser(description='Preview email with real CRM data')
    parser.add_argument('--template', help='Path to HTML template file')
    parser.add_argument('--body', help='Inline body text with {placeholders}')
    parser.add_argument('--subject', default='', help='Email subject with {placeholders}')
    parser.add_argument('--lead-id', help='Specific contact ID from CRM')
    parser.add_argument('--sample', action='store_true', help='Use top-scored lead as sample')
    parser.add_argument('--output', help='Save rendered HTML to file')
    args = parser.parse_args()

    if not args.template and not args.body:
        print(json.dumps({'error': 'Provide --template or --body'}, indent=2))
        sys.exit(1)

    # Load template
    if args.template:
        try:
            with open(args.template, 'r') as f:
                template = f.read()
        except FileNotFoundError:
            print(json.dumps({'error': f'Template not found: {args.template}'}, indent=2))
            sys.exit(1)
    else:
        template = args.body

    # Get lead data
    try:
        client = HubClient()
        lead = get_lead_data(client, args.lead_id if not args.sample else None)
    except RuntimeError:
        # Offline mode — use dummy data
        lead = {
            'firstName': 'María',
            'lastName': 'García',
            'email': 'maria@ejemplo.com',
            'phone': '+57 300 1234567',
            'city': 'Bogotá',
            'country': 'Colombia',
            'score': 85,
            'website': 'https://ejemplo.com',
            'customFields': {'rating': '4.8', 'reviews': '120'},
        }

    # Render
    rendered_body = render_template(template, lead)
    rendered_subject = render_template(args.subject, lead) if args.subject else ''

    # Check for unresolved placeholders
    unresolved = find_unresolved(rendered_body)
    if args.subject:
        unresolved += find_unresolved(rendered_subject)

    # Save if requested
    if args.output:
        with open(args.output, 'w') as f:
            f.write(rendered_body)

    result = {
        'action': 'preview',
        'lead': {
            'id': lead.get('id', 'sample'),
            'name': f"{lead.get('firstName', '')} {lead.get('lastName', '')}".strip(),
            'email': lead.get('email', ''),
            'score': lead.get('score', 0),
        },
        'subject': rendered_subject,
        'body_length': len(rendered_body),
        'unresolved_placeholders': unresolved,
        'has_issues': len(unresolved) > 0,
    }

    if not args.output:
        result['rendered_html'] = rendered_body

    print(json.dumps(result, indent=2, ensure_ascii=False))

    if unresolved:
        sys.exit(1)


if __name__ == '__main__':
    main()
