#!/usr/bin/env python3
"""Check email deliverability for a sender domain.

Checks:
  - SPF record
  - DKIM selector (common selectors)
  - DMARC policy
  - MX records
  - Brevo sender verification status

Usage:
  python3 check_deliverability.py --domain theredbot.com
  python3 check_deliverability.py --domain theredbot.com --selector brevo
"""

import argparse
import json
import os
import subprocess
import sys

SKILLS_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(SKILLS_DIR, 'connect', 'scripts'))


def dns_lookup(record_type: str, domain: str) -> list:
    """Perform DNS lookup using dig or nslookup."""
    try:
        result = subprocess.run(
            ['dig', '+short', record_type, domain],
            capture_output=True, text=True, timeout=10
        )
        lines = [l.strip().strip('"') for l in result.stdout.strip().split('\n') if l.strip()]
        return lines
    except FileNotFoundError:
        # dig not available, try nslookup
        try:
            result = subprocess.run(
                ['nslookup', '-type=' + record_type, domain],
                capture_output=True, text=True, timeout=10
            )
            return [result.stdout]
        except Exception:
            return []
    except Exception:
        return []


def check_spf(domain: str) -> dict:
    """Check SPF record."""
    records = dns_lookup('TXT', domain)
    spf_records = [r for r in records if 'v=spf1' in r]

    if spf_records:
        spf = spf_records[0]
        includes_brevo = 'sendinblue' in spf or 'brevo' in spf
        return {
            'status': 'PASS',
            'record': spf,
            'includes_brevo': includes_brevo,
            'note': 'Brevo/Sendinblue included in SPF' if includes_brevo else 'Consider adding Brevo to SPF',
        }
    else:
        return {
            'status': 'FAIL',
            'record': None,
            'note': 'No SPF record found. Add TXT record: v=spf1 include:sendinblue.com ~all',
        }


def check_dkim(domain: str, selector: str = 'brevo') -> dict:
    """Check DKIM record."""
    common_selectors = [selector, 'brevo', 'mail', 'google', 'default', 'k1']
    found = []

    for sel in common_selectors:
        dkim_domain = f'{sel}._domainkey.{domain}'
        records = dns_lookup('TXT', dkim_domain)
        dkim_records = [r for r in records if 'DKIM' in r.upper() or 'v=DKIM' in r or 'p=' in r]
        if dkim_records:
            found.append({
                'selector': sel,
                'record': dkim_records[0][:100] + '...' if len(dkim_records[0]) > 100 else dkim_records[0],
            })

    if found:
        return {
            'status': 'PASS',
            'selectors': found,
            'note': f'{len(found)} DKIM selector(s) found',
        }
    else:
        return {
            'status': 'FAIL',
            'selectors': [],
            'note': f'No DKIM record found for common selectors ({", ".join(common_selectors)})',
        }


def check_dmarc(domain: str) -> dict:
    """Check DMARC record."""
    dmarc_domain = f'_dmarc.{domain}'
    records = dns_lookup('TXT', dmarc_domain)
    dmarc_records = [r for r in records if 'v=DMARC1' in r]

    if dmarc_records:
        record = dmarc_records[0]
        policy = 'none'
        if 'p=reject' in record:
            policy = 'reject'
        elif 'p=quarantine' in record:
            policy = 'quarantine'
        elif 'p=none' in record:
            policy = 'none'

        return {
            'status': 'PASS' if policy != 'none' else 'WARN',
            'record': record,
            'policy': policy,
            'note': f'Policy: {policy}' + (' (consider upgrading to quarantine/reject)' if policy == 'none' else ''),
        }
    else:
        return {
            'status': 'FAIL',
            'record': None,
            'note': 'No DMARC record. Add TXT record at _dmarc: v=DMARC1; p=quarantine; rua=mailto:...',
        }


def check_mx(domain: str) -> dict:
    """Check MX records."""
    records = dns_lookup('MX', domain)
    if records:
        return {
            'status': 'PASS',
            'records': records[:5],
            'note': f'{len(records)} MX record(s) found',
        }
    else:
        return {
            'status': 'WARN',
            'records': [],
            'note': 'No MX records — domain may not receive email replies',
        }


def check_brevo_senders(domain: str) -> dict:
    """Check Brevo verified senders."""
    try:
        from hub_client import HubClient
        client = HubClient()
        result = client.post('/services/execute', json_data={
            'service': 'brevo',
            'action': 'list_senders',
            'params': {},
        })
        if result.get('data', {}).get('success'):
            senders = result.get('data', {}).get('data', {}).get('senders', [])
            domain_senders = [s for s in senders if domain in s.get('email', '')]
            return {
                'status': 'PASS' if domain_senders else 'WARN',
                'senders': [{'email': s['email'], 'name': s.get('name', '')} for s in domain_senders],
                'note': f'{len(domain_senders)} verified sender(s) for {domain}' if domain_senders else f'No verified senders for {domain} in Brevo',
            }
        return {'status': 'SKIP', 'note': 'Could not check Brevo senders'}
    except Exception:
        return {'status': 'SKIP', 'note': 'Hub offline — cannot check Brevo senders'}


def main():
    parser = argparse.ArgumentParser(description='Check email deliverability')
    parser.add_argument('--domain', required=True, help='Sender domain to check')
    parser.add_argument('--selector', default='brevo', help='DKIM selector to check')
    args = parser.parse_args()

    domain = args.domain.lower().strip()

    checks = {
        'domain': domain,
        'spf': check_spf(domain),
        'dkim': check_dkim(domain, args.selector),
        'dmarc': check_dmarc(domain),
        'mx': check_mx(domain),
        'brevo_senders': check_brevo_senders(domain),
    }

    # Overall score
    passed = sum(1 for k, v in checks.items() if isinstance(v, dict) and v.get('status') == 'PASS')
    failed = sum(1 for k, v in checks.items() if isinstance(v, dict) and v.get('status') == 'FAIL')
    total = sum(1 for k, v in checks.items() if isinstance(v, dict) and v.get('status') in ('PASS', 'FAIL', 'WARN'))

    checks['summary'] = {
        'passed': passed,
        'failed': failed,
        'total': total,
        'score': f'{passed}/{total}',
        'verdict': 'READY' if failed == 0 else 'FIX_REQUIRED',
    }

    print(json.dumps(checks, indent=2, ensure_ascii=False))

    if failed > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
