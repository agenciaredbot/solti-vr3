#!/usr/bin/env python3
"""Service execution via Solti Hub — route actions to external APIs.

Usage:
  python3 services_hub.py --action execute --service apify --service-action scrape_google_maps --params '{"searchQuery":"inmobiliarias bogota"}'
  python3 services_hub.py --action test --service brevo
  python3 services_hub.py --action list
  python3 services_hub.py --action actions --service evolution
  python3 services_hub.py --action credentials
  python3 services_hub.py --action store-credential --service apify --api-key "apify_api_..."

Requires: SOLTI_HUB_URL, SOLTI_API_KEY environment variables.
"""

import argparse
import json
import os
import sys

# hub_client.py is in the same directory, so direct import works
# But add to path explicitly for clarity
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPTS_DIR)

from hub_client import HubClient


def action_execute(client: HubClient, args) -> dict:
    """Execute a service action through the Hub."""
    if not args.service or not args.service_action:
        return {'success': False, 'error': '--service and --service-action required'}

    params = json.loads(args.params) if args.params else {}

    result = client.post('/services/execute', json_data={
        'service': args.service,
        'action': args.service_action,
        'params': params,
    }, timeout=120)

    if 'data' in result:
        data = result['data']
        return {
            'success': data.get('success', False),
            'service': data.get('service'),
            'action': data.get('action'),
            'cost': data.get('cost', 0),
            'description': data.get('description', ''),
            'data': data.get('data'),
        }
    return result


def action_test(client: HubClient, args) -> dict:
    """Test a service credential."""
    if not args.service:
        return {'success': False, 'error': '--service required'}

    result = client.post('/services/test', json_data={'service': args.service})
    return result


def action_list(client: HubClient, args) -> dict:
    """List available services and their actions."""
    result = client.get('/services')
    if 'data' in result:
        return {
            'success': True,
            'services': result['data'],
        }
    return result


def action_actions(client: HubClient, args) -> dict:
    """List actions for a specific service."""
    if not args.service:
        return {'success': False, 'error': '--service required'}

    result = client.get(f'/services/{args.service}/actions')
    if 'data' in result:
        return {'success': True, 'service': args.service, 'actions': result['data']}
    return result


def action_credentials(client: HubClient, args) -> dict:
    """List stored credentials (without values)."""
    result = client.get('/credentials')
    if 'data' in result:
        return {
            'success': True,
            'credentials': [{
                'service': c['service'],
                'type': c['credType'],
                'valid': c['isValid'],
                'lastTested': c.get('lastTestedAt'),
            } for c in result['data']],
        }
    return result


def action_store_credential(client: HubClient, args) -> dict:
    """Store a new API credential."""
    if not args.service or not args.api_key:
        return {'success': False, 'error': '--service and --api-key required'}

    metadata = json.loads(args.metadata) if args.metadata else {}

    result = client.post('/credentials', json_data={
        'service': args.service,
        'apiKey': args.api_key,
        'metadata': metadata,
    })

    if 'data' in result:
        return {
            'success': True,
            'service': args.service,
            'message': f'Credential stored for {args.service} (encrypted in Vault)',
        }
    return result


def action_test_credential(client: HubClient, args) -> dict:
    """Test a specific credential via the Hub."""
    if not args.service:
        return {'success': False, 'error': '--service required'}

    result = client.post(f'/credentials/{args.service}/test')
    return result


ACTIONS = {
    'execute': action_execute,
    'test': action_test,
    'list': action_list,
    'actions': action_actions,
    'credentials': action_credentials,
    'store-credential': action_store_credential,
    'test-credential': action_test_credential,
}


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--action', required=True, choices=ACTIONS.keys())
    parser.add_argument('--service', default=None, help='Service name (apify, brevo, evolution, getlate)')
    parser.add_argument('--service-action', default=None, help='Service action to execute')
    parser.add_argument('--params', default=None, help='JSON params for service action')
    parser.add_argument('--api-key', default=None, help='API key (for store-credential)')
    parser.add_argument('--metadata', default=None, help='JSON metadata (for store-credential)')
    args = parser.parse_args()

    try:
        client = HubClient()
        result = ACTIONS[args.action](client, args)
        print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}, indent=2))
        sys.exit(1)


if __name__ == '__main__':
    main()
