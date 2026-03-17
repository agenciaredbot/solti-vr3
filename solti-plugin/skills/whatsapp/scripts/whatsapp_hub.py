#!/usr/bin/env python3
"""WhatsApp operations via Solti Hub — manages instances and messaging.

Usage:
  python3 whatsapp_hub.py --action list-instances
  python3 whatsapp_hub.py --action create-instance --name "ventas"
  python3 whatsapp_hub.py --action status --instance-id <uuid>
  python3 whatsapp_hub.py --action qr --instance-id <uuid>
  python3 whatsapp_hub.py --action send --instance-id <uuid> --number 573001234567 --text "Hola"
  python3 whatsapp_hub.py --action conversations --instance-id <uuid>
  python3 whatsapp_hub.py --action messages --conversation-id <uuid>
  python3 whatsapp_hub.py --action delete --instance-id <uuid>

Requires: SOLTI_HUB_URL, SOLTI_API_KEY environment variables.
"""

import argparse
import json
import os
import sys

# __file__ = .../skills/whatsapp/scripts/whatsapp_hub.py → 3x dirname = .../skills/
SKILLS_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(SKILLS_DIR, 'connect', 'scripts'))

from hub_client import HubClient


def action_list_instances(client: HubClient, args) -> dict:
    result = client.get('/whatsapp/instances')
    if 'data' in result:
        instances = result['data']
        return {
            'success': True,
            'count': len(instances),
            'instances': [{
                'id': i['id'],
                'name': i['instanceName'],
                'status': i['status'],
                'phone': i.get('phoneNumber'),
                'connectedAt': i.get('connectedAt'),
            } for i in instances],
        }
    return result


def action_create_instance(client: HubClient, args) -> dict:
    if not args.name:
        return {'success': False, 'error': 'Instance name required (--name)'}

    result = client.post('/whatsapp/instances', json_data={
        'name': args.name,
    }, timeout=30)

    if 'data' in result:
        data = result['data']
        return {
            'success': True,
            'id': data.get('id'),
            'name': data.get('instanceName'),
            'status': data.get('status'),
            'qrCode': data.get('qrCode'),
            'message': 'Instance created. Scan the QR code to connect.',
        }
    return result


def action_status(client: HubClient, args) -> dict:
    if not args.instance_id:
        return {'success': False, 'error': 'Instance ID required (--instance-id)'}

    result = client.get(f'/whatsapp/instances/{args.instance_id}/status')
    if 'data' in result:
        return {'success': True, **result['data']}
    return result


def action_qr(client: HubClient, args) -> dict:
    if not args.instance_id:
        return {'success': False, 'error': 'Instance ID required (--instance-id)'}

    result = client.get(f'/whatsapp/instances/{args.instance_id}/qr')
    if 'data' in result:
        data = result['data']
        if data.get('qrCode'):
            return {
                'success': True,
                'instanceName': data.get('instanceName'),
                'qrCode': data['qrCode'][:80] + '...' if len(data.get('qrCode', '')) > 80 else data.get('qrCode'),
                'qrCodeFull': data['qrCode'],
                'message': 'Scan this QR code with WhatsApp on your phone.',
            }
        return {'success': True, 'status': data.get('status'), 'message': 'No QR code available — instance may already be connected.'}
    return result


def action_send(client: HubClient, args) -> dict:
    if not args.instance_id:
        return {'success': False, 'error': 'Instance ID required (--instance-id)'}
    if not args.number:
        return {'success': False, 'error': 'Phone number required (--number)'}
    if not args.text:
        return {'success': False, 'error': 'Message text required (--text)'}

    result = client.post(f'/whatsapp/instances/{args.instance_id}/send', json_data={
        'number': args.number,
        'text': args.text,
    })

    if 'data' in result:
        return {
            'success': result['data'].get('success', True),
            'message': f'Message sent to {args.number}',
            'description': result['data'].get('description', ''),
        }
    return result


def action_conversations(client: HubClient, args) -> dict:
    if not args.instance_id:
        return {'success': False, 'error': 'Instance ID required (--instance-id)'}

    result = client.get(f'/whatsapp/instances/{args.instance_id}/conversations')
    if 'data' in result:
        convs = result['data']
        return {
            'success': True,
            'count': len(convs),
            'conversations': [{
                'id': c['id'],
                'remoteJid': c['remoteJid'],
                'remoteName': c.get('remoteName'),
                'status': c['status'],
                'unreadCount': c.get('unreadCount', 0),
                'lastMessage': c.get('messages', [{}])[0].get('content') if c.get('messages') else None,
                'lastMessageAt': c.get('lastMessageAt'),
                'contactId': c.get('contactId'),
            } for c in convs],
        }
    return result


def action_messages(client: HubClient, args) -> dict:
    if not args.conversation_id:
        return {'success': False, 'error': 'Conversation ID required (--conversation-id)'}

    params = {'limit': args.limit or 50}
    result = client.get(f'/whatsapp/conversations/{args.conversation_id}/messages', params=params)
    if 'data' in result:
        return {'success': True, 'count': len(result['data']), 'messages': result['data']}
    return result


def action_delete(client: HubClient, args) -> dict:
    if not args.instance_id:
        return {'success': False, 'error': 'Instance ID required (--instance-id)'}

    result = client.delete(f'/whatsapp/instances/{args.instance_id}')
    return {'success': result.get('success', False), 'message': 'Instance deleted'}


ACTIONS = {
    'list-instances': action_list_instances,
    'create-instance': action_create_instance,
    'status': action_status,
    'qr': action_qr,
    'send': action_send,
    'conversations': action_conversations,
    'messages': action_messages,
    'delete': action_delete,
}


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--action', required=True, choices=ACTIONS.keys())
    parser.add_argument('--instance-id', default=None, help='WhatsApp instance ID')
    parser.add_argument('--conversation-id', default=None, help='Conversation ID')
    parser.add_argument('--name', default=None, help='Instance name (for create)')
    parser.add_argument('--number', default=None, help='Phone number with country code')
    parser.add_argument('--text', default=None, help='Message text')
    parser.add_argument('--limit', type=int, default=50, help='Max results')
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
