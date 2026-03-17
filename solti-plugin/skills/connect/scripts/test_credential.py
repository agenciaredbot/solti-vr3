#!/usr/bin/env python3
"""Test API credentials for external services.

Usage:
  python3 test_credential.py --service apify --token <token>
  python3 test_credential.py --check-all

Supported services: apify, brevo, phantombuster, getlate, evolution

Output: JSON with {success, service, status, message}
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error

SERVICES = {
    'apify': {
        'env': 'APIFY_API_TOKEN',
        'test_url': 'https://api.apify.com/v2/users/me?token={token}',
        'method': 'GET',
    },
    'brevo': {
        'env': 'BREVO_API_KEY',
        'test_url': 'https://api.brevo.com/v3/account',
        'method': 'GET',
        'headers': {'api-key': '{token}'},
    },
    'phantombuster': {
        'env': 'PHANTOMBUSTER_API_KEY',
        'test_url': 'https://api.phantombuster.com/api/v2/user',
        'method': 'GET',
        'headers': {'X-Phantombuster-Key': '{token}'},
    },
    'getlate': {
        'env': 'GETLATE_API_TOKEN',
        'test_url': 'https://getlate.dev/api/v1/accounts',
        'method': 'GET',
        'headers': {'Authorization': 'Bearer {token}'},
    },
    'evolution': {
        'env': 'EVOLUTION_API_KEY',
        'env_url': 'EVOLUTION_API_URL',
        'test_path': '/instance/fetchInstances',
        'method': 'GET',
        'headers': {'apikey': '{token}'},
    },
}


def mask_token(token: str) -> str:
    """Mask token showing only last 4 characters."""
    if not token or len(token) < 8:
        return '****'
    return '****' + token[-4:]


def test_service(service_name: str, token: str) -> dict:
    """Test a single service credential."""
    config = SERVICES.get(service_name)
    if not config:
        return {
            'success': False,
            'service': service_name,
            'status': 'unknown',
            'error': f'Unknown service: {service_name}',
            'suggestion': f'Supported services: {", ".join(SERVICES.keys())}',
        }

    if not token:
        return {
            'success': False,
            'service': service_name,
            'status': 'missing',
            'error': f'No token provided. Set {config["env"]} or pass --token.',
        }

    try:
        # Build URL
        if service_name == 'evolution':
            base_url = os.environ.get(config.get('env_url', ''), 'http://localhost:8080')
            url = base_url.rstrip('/') + config['test_path']
        else:
            url = config['test_url'].replace('{token}', token)

        # Build headers
        headers = {}
        for k, v in config.get('headers', {}).items():
            headers[k] = v.replace('{token}', token)

        req = urllib.request.Request(url, headers=headers, method=config['method'])
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())

        # Extract useful info per service
        info = {}
        if service_name == 'apify':
            info['username'] = data.get('data', {}).get('username', 'unknown')
        elif service_name == 'brevo':
            info['company'] = data.get('companyName', 'unknown')
            info['plan'] = data.get('plan', [{}])[0].get('type', 'unknown') if data.get('plan') else 'unknown'
        elif service_name == 'phantombuster':
            info['email'] = data.get('data', {}).get('email', 'unknown')

        return {
            'success': True,
            'service': service_name,
            'status': 'connected',
            'token_hint': mask_token(token),
            'info': info,
        }

    except urllib.error.HTTPError as e:
        status_map = {
            401: 'Invalid or expired token.',
            403: 'Token lacks required permissions.',
            429: 'Rate limited. Try again later.',
        }
        return {
            'success': False,
            'service': service_name,
            'status': 'auth_error',
            'error': status_map.get(e.code, f'HTTP {e.code}'),
            'token_hint': mask_token(token),
        }

    except urllib.error.URLError as e:
        return {
            'success': False,
            'service': service_name,
            'status': 'unreachable',
            'error': f'Cannot reach service: {e.reason}',
            'suggestion': 'Check network connection or service URL.',
        }

    except Exception as e:
        return {
            'success': False,
            'service': service_name,
            'status': 'error',
            'error': str(e),
            'error_type': type(e).__name__,
        }


def check_all() -> dict:
    """Check all services using environment variables."""
    results = []
    for name, config in SERVICES.items():
        token = os.environ.get(config['env'], '')
        result = test_service(name, token) if token else {
            'success': False,
            'service': name,
            'status': 'not_configured',
            'env_var': config['env'],
        }
        results.append(result)

    connected = sum(1 for r in results if r['success'])
    return {
        'success': True,
        'total': len(SERVICES),
        'connected': connected,
        'not_configured': len(SERVICES) - connected,
        'services': results,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--service', default=None,
                        choices=list(SERVICES.keys()),
                        help='Service to test')
    parser.add_argument('--token', default=None,
                        help='API token to test')
    parser.add_argument('--check-all', action='store_true',
                        help='Check all services using env vars')
    args = parser.parse_args()

    if args.check_all:
        result = check_all()
    elif args.service:
        token = args.token or os.environ.get(SERVICES[args.service]['env'], '')
        result = test_service(args.service, token)
    else:
        result = {
            'success': False,
            'error': 'Specify --service <name> --token <token> or --check-all',
        }

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
