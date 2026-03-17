#!/usr/bin/env python3
"""Campaign management via Hub API.

Actions:
  create      — Create campaign + steps from sequence config
  list        — List all campaigns
  get         — Get campaign details
  launch      — Launch a campaign
  pause       — Pause a campaign
  recipients  — List campaign recipients
  events      — List campaign events
  create-list — Create contact list
  populate    — Auto-populate list from CRM search
  stats       — Get campaign stats

Usage:
  python3 campaign_hub.py --action create --config .tmp/sequence.json
  python3 campaign_hub.py --action list
  python3 campaign_hub.py --action launch --campaign-id UUID
  python3 campaign_hub.py --action create-list --name "Pereira Hot Leads"
  python3 campaign_hub.py --action populate --list-id UUID --min-score 80 --city Pereira
"""

import argparse
import json
import os
import sys

SKILLS_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(SKILLS_DIR, 'connect', 'scripts'))

from hub_client import HubClient

# Default email templates for quick campaign creation
DEFAULT_EMAIL_STEPS = [
    {
        'stepNumber': 1,
        'type': 'initial',
        'delayDays': 0,
        'channel': 'email',
        'condition': 'always',
        'subject': 'Hola {firstName}, una idea para tu negocio',
        'body': '<p>Hola {firstName},</p><p>Vi que tu negocio está en {city} y me pareció interesante.</p><p>En <strong>Redbot</strong> ayudamos a inmobiliarias a responder leads 24/7 con IA.</p><p>¿Tendría 15 minutos esta semana para una llamada rápida?</p><p>Saludos,<br>Andrés</p>',
    },
    {
        'stepNumber': 2,
        'type': 'followup',
        'delayDays': 3,
        'channel': 'email',
        'condition': 'no_reply',
        'subject': 'Re: {firstName}, un dato rápido',
        'body': '<p>Hola {firstName},</p><p>Le escribí hace unos días. Solo quería compartir un dato:</p><p>📊 Las inmobiliarias que usan IA para responder leads ven un aumento del 40% en conversiones.</p><p>¿Le interesa saber cómo?</p><p>Saludos,<br>Andrés</p>',
    },
    {
        'stepNumber': 3,
        'type': 'breakup',
        'delayDays': 7,
        'channel': 'email',
        'condition': 'no_reply',
        'subject': '{firstName}, última pregunta',
        'body': '<p>Hola {firstName},</p><p>No quiero ser insistente, así que este será mi último mensaje.</p><p>Si responder leads más rápido no es prioridad ahora, lo entiendo.</p><p>Si en algún momento cambia, aquí estaré. 🤝</p><p>¡Éxitos!</p><p>Andrés</p>',
    },
]

DEFAULT_WHATSAPP_STEPS = [
    {
        'stepNumber': 1,
        'type': 'initial',
        'delayDays': 0,
        'channel': 'whatsapp',
        'condition': 'always',
        'body': 'Hola {firstName} 👋 Soy Andrés de Redbot. Vi tu inmobiliaria en {city} y creo que te puede interesar nuestro chatbot de IA para responder leads 24/7. ¿Tienes 5 minutos?',
    },
    {
        'stepNumber': 2,
        'type': 'followup',
        'delayDays': 2,
        'channel': 'whatsapp',
        'condition': 'no_reply',
        'body': 'Hola {firstName}, te escribí hace un par de días. Solo un dato: las inmobiliarias que usan IA ven 40% más conversiones. ¿Te cuento cómo? 📊',
    },
]


def action_create(client: HubClient, args) -> dict:
    """Create campaign + steps."""
    # If config file provided, use it
    if args.config:
        with open(args.config) as f:
            config = json.load(f)
        name = config.get('sequence', config).get('name', 'Campaign')
        channel = config.get('sequence', config).get('channel', 'email')
        steps_data = config.get('sequence', config).get('steps', [])
    else:
        name = args.name or f'{args.channel}_campaign'
        channel = args.channel or 'email'
        if channel == 'whatsapp':
            steps_data = DEFAULT_WHATSAPP_STEPS[:args.steps]
        else:
            steps_data = DEFAULT_EMAIL_STEPS[:args.steps]

    # Map channel name
    channel_map = {'instagram': 'instagram_dm', 'linkedin': 'linkedin_dm'}
    campaign_type = channel_map.get(channel, channel)

    # Create campaign
    campaign_body = {'name': name, 'type': campaign_type}
    if args.list_id:
        campaign_body['listId'] = args.list_id

    result = client.post('/campaigns', json_data=campaign_body)
    if result.get('success') is False or result.get('http_status', 200) >= 400:
        return {'error': 'Failed to create campaign', 'details': result}

    campaign = result.get('data', result)
    campaign_id = campaign.get('id')

    # Add steps
    created_steps = []
    for step in steps_data:
        step_body = {
            'stepNumber': step.get('stepNumber', step.get('step', 1)),
            'type': step.get('type', 'initial'),
            'delayDays': step.get('delayDays', step.get('day', 0)),
            'channel': step.get('channel', campaign_type),
            'condition': step.get('condition', 'always'),
            'body': step.get('body', ''),
        }
        if step.get('subject'):
            step_body['subject'] = step['subject']

        step_result = client.post(f'/campaigns/{campaign_id}/steps', json_data=step_body)
        created_steps.append(step_result.get('data', step_result))

    return {
        'action': 'create',
        'campaign': campaign,
        'steps_created': len(created_steps),
        'next_steps': [
            f'Add contacts to list or populate: python3 campaign_hub.py --action populate --list-id LIST_ID --min-score 80',
            f'Launch: python3 campaign_hub.py --action launch --campaign-id {campaign_id}',
        ],
    }


def action_list(client: HubClient) -> dict:
    result = client.get('/campaigns')
    campaigns = result.get('data', [])
    return {
        'action': 'list',
        'total': len(campaigns),
        'campaigns': [
            {
                'id': c['id'],
                'name': c['name'],
                'type': c['type'],
                'status': c['status'],
                'steps': len(c.get('steps', [])),
                'recipients': c.get('_count', {}).get('recipients', 0),
            }
            for c in campaigns
        ],
    }


def action_get(client: HubClient, campaign_id: str) -> dict:
    result = client.get(f'/campaigns/{campaign_id}')
    return {'action': 'get', 'data': result.get('data', result)}


def action_launch(client: HubClient, campaign_id: str) -> dict:
    result = client.post(f'/campaigns/{campaign_id}/launch')
    return {'action': 'launch', 'result': result}


def action_pause(client: HubClient, campaign_id: str) -> dict:
    result = client.post(f'/campaigns/{campaign_id}/pause')
    return {'action': 'pause', 'result': result}


def action_recipients(client: HubClient, campaign_id: str) -> dict:
    result = client.get(f'/campaigns/{campaign_id}/recipients')
    return {'action': 'recipients', 'data': result.get('data', [])}


def action_events(client: HubClient, campaign_id: str) -> dict:
    result = client.get(f'/campaigns/{campaign_id}/events')
    return {'action': 'events', 'data': result.get('data', [])}


def action_create_list(client: HubClient, name: str, description: str = None) -> dict:
    body = {'name': name}
    if description:
        body['description'] = description
    result = client.post('/lists', json_data=body)
    return {'action': 'create_list', 'data': result.get('data', result)}


def action_populate(client: HubClient, list_id: str, args) -> dict:
    body = {}
    if args.min_score is not None:
        body['minScore'] = args.min_score
    if args.city:
        body['city'] = args.city
    if args.status:
        body['status'] = args.status
    if args.source:
        body['source'] = args.source
    if args.has_email:
        body['hasEmail'] = True
    if args.limit:
        body['limit'] = args.limit

    result = client.post(f'/lists/{list_id}/populate', json_data=body)
    return {'action': 'populate', 'data': result.get('data', result)}


def action_stats(client: HubClient, campaign_id: str) -> dict:
    campaign = client.get(f'/campaigns/{campaign_id}')
    events = client.get(f'/campaigns/{campaign_id}/events')
    recipients = client.get(f'/campaigns/{campaign_id}/recipients')

    data = campaign.get('data', campaign)
    event_list = events.get('data', [])
    recipient_list = recipients.get('data', [])

    by_status = {}
    for r in recipient_list:
        s = r.get('status', 'UNKNOWN')
        by_status[s] = by_status.get(s, 0) + 1

    by_event = {}
    for e in event_list:
        t = e.get('eventType', 'unknown')
        by_event[t] = by_event.get(t, 0) + 1

    return {
        'action': 'stats',
        'campaign': {
            'name': data.get('name'),
            'status': data.get('status'),
            'type': data.get('type'),
        },
        'recipients': {
            'total': len(recipient_list),
            'by_status': by_status,
        },
        'events': {
            'total': len(event_list),
            'by_type': by_event,
        },
    }


def main():
    parser = argparse.ArgumentParser(description='Campaign management via Hub')
    parser.add_argument('--action', required=True,
                        choices=['create', 'list', 'get', 'launch', 'pause',
                                 'recipients', 'events', 'create-list', 'populate', 'stats'],
                        help='Action to perform')
    parser.add_argument('--campaign-id', help='Campaign UUID')
    parser.add_argument('--list-id', help='Contact list UUID')
    parser.add_argument('--config', help='Sequence config JSON file')
    parser.add_argument('--name', help='Campaign or list name')
    parser.add_argument('--channel', default='email', choices=['email', 'whatsapp', 'instagram_dm', 'linkedin_dm'])
    parser.add_argument('--steps', type=int, default=3, help='Number of steps')
    parser.add_argument('--min-score', type=int, help='Min score for populate')
    parser.add_argument('--city', help='City filter for populate')
    parser.add_argument('--status', help='Status filter for populate')
    parser.add_argument('--source', help='Source filter for populate')
    parser.add_argument('--has-email', action='store_true', help='Only contacts with email')
    parser.add_argument('--limit', type=int, help='Max contacts for populate')
    parser.add_argument('--description', help='List description')
    args = parser.parse_args()

    try:
        client = HubClient()
    except RuntimeError as e:
        print(json.dumps({'error': str(e)}, indent=2))
        sys.exit(1)

    if args.action == 'create':
        result = action_create(client, args)
    elif args.action == 'list':
        result = action_list(client)
    elif args.action == 'get':
        if not args.campaign_id:
            print(json.dumps({'error': 'Provide --campaign-id'}))
            sys.exit(1)
        result = action_get(client, args.campaign_id)
    elif args.action == 'launch':
        if not args.campaign_id:
            print(json.dumps({'error': 'Provide --campaign-id'}))
            sys.exit(1)
        result = action_launch(client, args.campaign_id)
    elif args.action == 'pause':
        if not args.campaign_id:
            print(json.dumps({'error': 'Provide --campaign-id'}))
            sys.exit(1)
        result = action_pause(client, args.campaign_id)
    elif args.action == 'recipients':
        if not args.campaign_id:
            print(json.dumps({'error': 'Provide --campaign-id'}))
            sys.exit(1)
        result = action_recipients(client, args.campaign_id)
    elif args.action == 'events':
        if not args.campaign_id:
            print(json.dumps({'error': 'Provide --campaign-id'}))
            sys.exit(1)
        result = action_events(client, args.campaign_id)
    elif args.action == 'create-list':
        if not args.name:
            print(json.dumps({'error': 'Provide --name'}))
            sys.exit(1)
        result = action_create_list(client, args.name, args.description)
    elif args.action == 'populate':
        if not args.list_id:
            print(json.dumps({'error': 'Provide --list-id'}))
            sys.exit(1)
        result = action_populate(client, args.list_id, args)
    elif args.action == 'stats':
        if not args.campaign_id:
            print(json.dumps({'error': 'Provide --campaign-id'}))
            sys.exit(1)
        result = action_stats(client, args.campaign_id)
    else:
        result = {'error': f'Unknown action: {args.action}'}

    print(json.dumps(result, indent=2, ensure_ascii=False))

    if result.get('error'):
        sys.exit(1)


if __name__ == '__main__':
    main()
