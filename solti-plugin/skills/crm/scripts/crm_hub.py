#!/usr/bin/env python3
"""CRM operations via Solti Hub — replaces crm_local.py when Hub is online.

Usage:
  python3 crm_hub.py --action list [--status NEW|CONTACTED|...] [--limit 25] [--page 1]
  python3 crm_hub.py --action search --query "bogota" [--limit 20]
  python3 crm_hub.py --action create --data '{"firstName":"John",...}'
  python3 crm_hub.py --action update --id <uuid> --data '{"status":"CONTACTED"}'
  python3 crm_hub.py --action get --id <uuid>
  python3 crm_hub.py --action import --input scored.json [--min-score 60]
  python3 crm_hub.py --action stats
  python3 crm_hub.py --action tag --id <uuid> --tag-name "VIP" [--tag-color "#ef4444"]
  python3 crm_hub.py --action activities --id <uuid>

Requires: SOLTI_HUB_URL, SOLTI_API_KEY environment variables.
Output: JSON to stdout.
"""

import argparse
import json
import os
import sys

# Import hub_client from sibling skill
# __file__ = .../skills/crm/scripts/crm_hub.py → 3x dirname = .../skills/
SKILLS_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(SKILLS_DIR, 'connect', 'scripts'))

from hub_client import HubClient


def action_list(client: HubClient, args) -> dict:
    """List contacts with filters."""
    params = {
        'page': args.page or 1,
        'limit': args.limit or 25,
        'sortBy': 'created_at',
        'sortDir': 'desc',
    }
    if args.status:
        params['status'] = args.status.upper()
    if args.query:
        params['search'] = args.query

    result = client.get('/contacts', params=params)

    # Flatten for display
    if 'data' in result:
        contacts = result['data']
        return {
            'success': True,
            'count': len(contacts),
            'total': result.get('pagination', {}).get('total', len(contacts)),
            'page': result.get('pagination', {}).get('page', 1),
            'data': contacts,
        }
    return result


def action_search(client: HubClient, args) -> dict:
    """Full-text search contacts."""
    if not args.query:
        return {'success': False, 'error': 'Search query required (--query)'}

    result = client.post('/contacts/search', json_data={
        'query': args.query,
        'limit': args.limit or 20,
    })

    if 'data' in result:
        return {
            'success': True,
            'count': len(result['data']),
            'query': args.query,
            'data': result['data'],
        }
    return result


def action_create(client: HubClient, args) -> dict:
    """Create a contact."""
    if not args.data:
        return {'success': False, 'error': 'Contact data required (--data JSON)'}

    data = json.loads(args.data)

    result = client.post('/contacts', json_data=data)

    if 'data' in result:
        return {
            'success': True,
            'id': result['data'].get('id'),
            'action': 'created',
            'data': result['data'],
        }
    return result


def action_update(client: HubClient, args) -> dict:
    """Update a contact."""
    if not args.id:
        return {'success': False, 'error': 'Contact ID required (--id)'}
    if not args.data:
        return {'success': False, 'error': 'Update data required (--data JSON)'}

    data = json.loads(args.data)

    result = client.patch(f'/contacts/{args.id}', json_data=data)

    if 'data' in result:
        return {
            'success': True,
            'id': args.id,
            'action': 'updated',
            'data': result['data'],
        }
    return result


def action_get(client: HubClient, args) -> dict:
    """Get a contact with details."""
    if not args.id:
        return {'success': False, 'error': 'Contact ID required (--id)'}

    result = client.get(f'/contacts/{args.id}')

    if 'data' in result:
        return {'success': True, 'data': result['data']}
    return result


def action_delete(client: HubClient, args) -> dict:
    """Delete a contact."""
    if not args.id:
        return {'success': False, 'error': 'Contact ID required (--id)'}

    result = client.delete(f'/contacts/{args.id}')
    return {'success': result.get('success', False), 'id': args.id, 'action': 'deleted'}


def action_import(client: HubClient, args) -> dict:
    """Bulk import contacts from JSON file."""
    if not args.input:
        return {'success': False, 'error': 'Input file required (--input)'}

    with open(args.input) as f:
        input_data = json.load(f)

    if isinstance(input_data, list):
        leads = input_data
    elif isinstance(input_data, dict) and 'data' in input_data:
        leads = input_data['data']
    else:
        leads = [input_data]

    min_score = args.min_score or 0

    # Filter by min score
    contacts = []
    skipped = 0
    for lead in leads:
        score = lead.get('score', 50)
        if score < min_score:
            skipped += 1
            continue

        # Map common field names to Hub format (camelCase)
        name = lead.get('name', '') or lead.get('title', '')
        parts = name.split(' ', 1) if name else ['', '']

        contacts.append({
            'firstName': lead.get('firstName') or lead.get('first_name') or parts[0],
            'lastName': lead.get('lastName') or lead.get('last_name') or (parts[1] if len(parts) > 1 else ''),
            'email': lead.get('email', ''),
            'phone': lead.get('phone') or lead.get('phoneNumber') or lead.get('telephone', ''),
            'whatsapp': lead.get('whatsapp', ''),
            'website': lead.get('website') or lead.get('url') or lead.get('webUrl', ''),
            'instagram': lead.get('instagram', ''),
            'linkedin': lead.get('linkedin', ''),
            'status': 'NEW',
            'score': score,
            'source': lead.get('source', 'prospect'),
            'sourceUrl': lead.get('source_url') or lead.get('sourceUrl') or lead.get('googleMapsUrl', ''),
            'city': lead.get('city') or lead.get('address', ''),
            'country': lead.get('country', ''),
        })

    if not contacts:
        return {'success': True, 'imported': 0, 'skipped_low_score': skipped, 'total_processed': len(leads)}

    # Send in batches of 200
    total_imported = 0
    for i in range(0, len(contacts), 200):
        batch = contacts[i:i+200]
        result = client.post('/contacts/bulk', json_data={'contacts': batch})
        total_imported += result.get('imported', 0)

    return {
        'success': True,
        'imported': total_imported,
        'skipped_low_score': skipped,
        'total_processed': len(leads),
    }


def action_stats(client: HubClient, args) -> dict:
    """Get dashboard/CRM stats."""
    result = client.get('/analytics/dashboard')

    if 'data' in result:
        data = result['data']
        return {
            'success': True,
            'total': data.get('contacts', {}).get('total', 0),
            'by_status': data.get('contacts', {}).get('byStatus', {}),
            'campaigns_active': data.get('campaigns', {}).get('active', 0),
            'whatsapp_connected': data.get('whatsapp', {}).get('connectedInstances', 0),
            'credits': data.get('credits'),
            'today': data.get('today'),
        }
    return result


def action_tag(client: HubClient, args) -> dict:
    """Add a tag to a contact."""
    if not args.id:
        return {'success': False, 'error': 'Contact ID required (--id)'}
    if not args.tag_name:
        return {'success': False, 'error': 'Tag name required (--tag-name)'}

    result = client.post(f'/contacts/{args.id}/tags', json_data={
        'tagName': args.tag_name,
        'tagColor': args.tag_color or '#6366f1',
    })

    if 'data' in result:
        return {'success': True, 'tag': result['data'], 'contactId': args.id}
    return result


def action_activities(client: HubClient, args) -> dict:
    """Get activity timeline for a contact."""
    if not args.id:
        return {'success': False, 'error': 'Contact ID required (--id)'}

    result = client.get(f'/contacts/{args.id}/activities')

    if 'data' in result:
        return {'success': True, 'count': len(result['data']), 'data': result['data']}
    return result


ACTIONS = {
    'list': action_list,
    'search': action_search,
    'create': action_create,
    'update': action_update,
    'get': action_get,
    'delete': action_delete,
    'import': action_import,
    'stats': action_stats,
    'tag': action_tag,
    'activities': action_activities,
}


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--action', required=True, choices=ACTIONS.keys(),
                        help='CRM operation to perform')
    parser.add_argument('--id', default=None, help='Contact ID (for get/update/delete/tag)')
    parser.add_argument('--data', default=None, help='JSON data (for create/update)')
    parser.add_argument('--query', default=None, help='Search query')
    parser.add_argument('--status', default=None, help='Filter by status')
    parser.add_argument('--input', default=None, help='Input file for import')
    parser.add_argument('--limit', type=int, default=25, help='Max results')
    parser.add_argument('--page', type=int, default=1, help='Page number')
    parser.add_argument('--min-score', type=int, default=0, help='Min score for import')
    parser.add_argument('--tag-name', default=None, help='Tag name (for tag action)')
    parser.add_argument('--tag-color', default=None, help='Tag color hex (for tag action)')
    args = parser.parse_args()

    try:
        client = HubClient()
        result = ACTIONS[args.action](client, args)
        print(json.dumps(result, indent=2, ensure_ascii=False, default=str))

    except RuntimeError as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'suggestion': 'Configure Hub connection: set SOLTI_HUB_URL and SOLTI_API_KEY env vars.',
        }, indent=2))
        sys.exit(1)

    except json.JSONDecodeError as e:
        print(json.dumps({
            'success': False,
            'error': f'Invalid JSON in --data: {e}',
        }, indent=2))
        sys.exit(1)

    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__,
        }, indent=2))
        sys.exit(1)


if __name__ == '__main__':
    main()
