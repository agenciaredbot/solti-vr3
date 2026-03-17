#!/usr/bin/env python3
"""Solti Hub HTTP Client — Reusable base for all Plugin ↔ Hub communication.

Usage as module:
    from hub_client import HubClient
    client = HubClient()
    result = client.get('/contacts', params={'limit': 20})
    result = client.post('/services/execute', json={...})

Usage standalone (test connection):
    python3 hub_client.py
    python3 hub_client.py --endpoint /health
    python3 hub_client.py --endpoint /api/v1/credentials --method GET

Env vars:
    SOLTI_HUB_URL   — Hub base URL (default: http://localhost:4000)
    SOLTI_API_KEY    — Plugin API key (sk_solti_...)
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional


class HubClient:
    """HTTP client for Solti Hub REST API."""

    def __init__(self, base_url: str = None, api_key: str = None):
        self.base_url = (base_url or os.environ.get('SOLTI_HUB_URL', 'http://localhost:4000')).rstrip('/')
        self.api_key = api_key or os.environ.get('SOLTI_API_KEY', '')

        if not self.api_key:
            raise RuntimeError(
                "SOLTI_API_KEY not set. Run /connect to configure, "
                "or set SOLTI_API_KEY in your shell profile."
            )

    @property
    def api_base(self) -> str:
        return f"{self.base_url}/api/v1"

    def _headers(self) -> dict:
        return {
            'X-Api-Key': self.api_key,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }

    def _request(self, method: str, path: str, json_data: dict = None,
                 params: dict = None, timeout: int = 30) -> dict:
        """Make HTTP request to Hub API."""
        url = f"{self.api_base}{path}"

        if params:
            qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
            url = f"{url}?{qs}"

        body = json.dumps(json_data).encode('utf-8') if json_data else None
        req = urllib.request.Request(url, data=body, headers=self._headers(), method=method)

        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode('utf-8')
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8', errors='replace')
            try:
                error_json = json.loads(error_body)
            except json.JSONDecodeError:
                error_json = {'error': error_body}
            return {
                'success': False,
                'http_status': e.code,
                'error': error_json.get('error', str(e)),
                'details': error_json,
            }
        except urllib.error.URLError as e:
            return {
                'success': False,
                'error': f"Cannot connect to Hub at {self.base_url}: {e.reason}",
                'suggestion': 'Is the Hub running? Start with: docker compose up -d',
            }
        except TimeoutError:
            return {
                'success': False,
                'error': f"Request timed out after {timeout}s",
                'suggestion': 'Hub may be overloaded or unreachable.',
            }

    def get(self, path: str, params: dict = None, timeout: int = 30) -> dict:
        return self._request('GET', path, params=params, timeout=timeout)

    def post(self, path: str, json_data: dict = None, timeout: int = 60) -> dict:
        return self._request('POST', path, json_data=json_data, timeout=timeout)

    def patch(self, path: str, json_data: dict = None, timeout: int = 30) -> dict:
        return self._request('PATCH', path, json_data=json_data, timeout=timeout)

    def put(self, path: str, json_data: dict = None, timeout: int = 30) -> dict:
        return self._request('PUT', path, json_data=json_data, timeout=timeout)

    def delete(self, path: str, timeout: int = 30) -> dict:
        return self._request('DELETE', path, timeout=timeout)

    # ═══ Convenience methods ═══

    def health(self) -> dict:
        """Check Hub health (no auth required)."""
        url = f"{self.base_url}/health"
        req = urllib.request.Request(url, headers={'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            return {'status': 'offline', 'error': str(e)}

    def is_online(self) -> bool:
        """Quick check if Hub is reachable."""
        h = self.health()
        return h.get('status') == 'ok'


def main():
    """CLI test mode."""
    import argparse
    parser = argparse.ArgumentParser(description='Test Solti Hub connection')
    parser.add_argument('--endpoint', default='/health', help='Endpoint to call')
    parser.add_argument('--method', default='GET', help='HTTP method')
    parser.add_argument('--data', default=None, help='JSON body for POST/PATCH')
    args = parser.parse_args()

    try:
        client = HubClient()
    except RuntimeError as e:
        # For /health, API key is not required
        if args.endpoint == '/health':
            url = os.environ.get('SOLTI_HUB_URL', 'http://localhost:4000').rstrip('/')
            req = urllib.request.Request(f"{url}/health")
            try:
                with urllib.request.urlopen(req, timeout=5) as resp:
                    result = json.loads(resp.read().decode('utf-8'))
                    print(json.dumps(result, indent=2))
                    return
            except Exception as e2:
                print(json.dumps({'success': False, 'error': str(e2)}, indent=2))
                sys.exit(1)
        else:
            print(json.dumps({'success': False, 'error': str(e)}, indent=2))
            sys.exit(1)

    body = json.loads(args.data) if args.data else None

    if args.method.upper() == 'GET':
        result = client.get(args.endpoint)
    elif args.method.upper() == 'POST':
        result = client.post(args.endpoint, json_data=body)
    elif args.method.upper() == 'PATCH':
        result = client.patch(args.endpoint, json_data=body)
    elif args.method.upper() == 'DELETE':
        result = client.delete(args.endpoint)
    else:
        result = {'error': f'Unsupported method: {args.method}'}

    print(json.dumps(result, indent=2, ensure_ascii=False))

    if result.get('success') is False or result.get('http_status', 200) >= 400:
        sys.exit(1)


if __name__ == '__main__':
    main()
