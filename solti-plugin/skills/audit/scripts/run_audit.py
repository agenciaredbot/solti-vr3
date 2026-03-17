#!/usr/bin/env python3
"""Run system audit — gathers health data from Hub.

Actions:
  full       — Run all audit checks
  crm        — CRM contact health
  campaigns  — Campaign performance health
  services   — Service credential & API health
  costs      — Cost analysis

Usage:
  python3 run_audit.py --action full
  python3 run_audit.py --action crm
  python3 run_audit.py --action campaigns
"""

import argparse
import json
import os
import sys
from datetime import datetime

SKILLS_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(SKILLS_DIR, 'connect', 'scripts'))

from hub_client import HubClient


def audit_crm(client: HubClient) -> dict:
    """Audit CRM health."""
    findings = []

    # Get all contacts
    result = client.get('/contacts', params={'limit': '100', 'sortBy': 'created_at', 'sortDir': 'desc'})
    contacts = result.get('data', [])
    total = result.get('pagination', {}).get('total', len(contacts))

    # Status distribution
    statuses = {}
    no_email = 0
    no_phone = 0
    low_score = 0

    for c in contacts:
        s = c.get('status', 'UNKNOWN')
        statuses[s] = statuses.get(s, 0) + 1
        if not c.get('email'):
            no_email += 1
        if not c.get('phone') and not c.get('whatsapp'):
            no_phone += 1
        if c.get('score', 0) < 30:
            low_score += 1

    # Check for stale NEW contacts (would need createdAt comparison in production)
    new_count = statuses.get('NEW', 0)
    if new_count > total * 0.7 and total > 10:
        findings.append({
            'severity': 'WARNING',
            'category': 'crm',
            'title': 'Demasiados leads sin contactar',
            'detail': f'{new_count}/{total} contacts ({int(new_count/total*100)}%) still in NEW status',
            'action': 'Run /outreach to create campaigns for these leads',
        })

    if no_email > total * 0.5 and total > 5:
        findings.append({
            'severity': 'WARNING',
            'category': 'crm',
            'title': 'Muchos contactos sin email',
            'detail': f'{no_email}/{total} contacts have no email address',
            'action': 'Run /prospect ENRICH to find emails, or use WhatsApp/IG DM instead',
        })

    if no_phone > total * 0.6 and total > 5:
        findings.append({
            'severity': 'INFO',
            'category': 'crm',
            'title': 'Contactos sin teléfono',
            'detail': f'{no_phone}/{total} contacts have no phone/whatsapp',
            'action': 'Consider enrichment or manual research',
        })

    if total == 0:
        findings.append({
            'severity': 'CRITICAL',
            'category': 'crm',
            'title': 'CRM vacío',
            'detail': 'No contacts in the CRM',
            'action': 'Run /prospect to generate leads',
        })

    if not findings:
        findings.append({
            'severity': 'OK',
            'category': 'crm',
            'title': 'CRM saludable',
            'detail': f'{total} contacts, distribution looks healthy',
        })

    return {
        'category': 'crm',
        'total_contacts': total,
        'by_status': statuses,
        'no_email': no_email,
        'no_phone': no_phone,
        'low_score': low_score,
        'findings': findings,
    }


def audit_campaigns(client: HubClient) -> dict:
    """Audit campaign health."""
    findings = []

    result = client.get('/campaigns')
    campaigns = result.get('data', [])

    active = [c for c in campaigns if c.get('status') == 'SENDING']
    draft = [c for c in campaigns if c.get('status') == 'DRAFT']
    completed = [c for c in campaigns if c.get('status') == 'COMPLETED']
    failed = [c for c in campaigns if c.get('status') == 'FAILED']

    if failed:
        findings.append({
            'severity': 'WARNING',
            'category': 'campaigns',
            'title': f'{len(failed)} campañas fallidas',
            'detail': ', '.join(c.get('name', 'unnamed') for c in failed),
            'action': 'Review failed campaigns and fix issues before retrying',
        })

    if len(draft) > 5:
        findings.append({
            'severity': 'INFO',
            'category': 'campaigns',
            'title': f'{len(draft)} borradores sin lanzar',
            'detail': 'Many draft campaigns sitting idle',
            'action': 'Review and launch or delete stale drafts',
        })

    # Check campaigns with stats
    for c in campaigns:
        stats = c.get('stats', {})
        if isinstance(stats, str):
            try:
                stats = json.loads(stats)
            except Exception:
                stats = {}
        sent = stats.get('sent', 0)
        bounced = stats.get('bounced', 0)
        opened = stats.get('opened', 0)

        if sent > 10:
            bounce_rate = bounced / sent * 100
            open_rate = opened / sent * 100

            if bounce_rate > 10:
                findings.append({
                    'severity': 'CRITICAL',
                    'category': 'campaigns',
                    'title': f'Alta tasa de rebote: {c.get("name")}',
                    'detail': f'{bounce_rate:.1f}% bounce rate ({bounced}/{sent})',
                    'action': 'Verify email addresses. Consider cleaning the list.',
                })
            elif bounce_rate > 5:
                findings.append({
                    'severity': 'WARNING',
                    'category': 'campaigns',
                    'title': f'Tasa de rebote elevada: {c.get("name")}',
                    'detail': f'{bounce_rate:.1f}% bounce rate',
                    'action': 'Monitor and clean bounced emails',
                })

            if open_rate < 15 and sent > 20:
                findings.append({
                    'severity': 'WARNING',
                    'category': 'campaigns',
                    'title': f'Baja tasa de apertura: {c.get("name")}',
                    'detail': f'{open_rate:.1f}% open rate',
                    'action': 'Improve subject lines or segment better',
                })

    if not findings:
        findings.append({
            'severity': 'OK',
            'category': 'campaigns',
            'title': 'Campañas saludables',
            'detail': f'{len(campaigns)} total, {len(active)} active',
        })

    return {
        'category': 'campaigns',
        'total': len(campaigns),
        'active': len(active),
        'draft': len(draft),
        'completed': len(completed),
        'failed': len(failed),
        'findings': findings,
    }


def audit_services(client: HubClient) -> dict:
    """Audit service credential health."""
    findings = []

    result = client.get('/credentials')
    credentials = result.get('data', [])

    if not credentials:
        findings.append({
            'severity': 'CRITICAL',
            'category': 'services',
            'title': 'Sin credenciales configuradas',
            'detail': 'No API credentials stored in vault',
            'action': 'Run /connect to set up API keys',
        })
        return {'category': 'services', 'credentials': [], 'findings': findings}

    for cred in credentials:
        service = cred.get('service', 'unknown')
        is_valid = cred.get('isValid')
        last_tested = cred.get('lastTestedAt')

        if is_valid is False:
            findings.append({
                'severity': 'CRITICAL',
                'category': 'services',
                'title': f'Credencial inválida: {service}',
                'detail': f'Last tested: {last_tested or "never"}',
                'action': f'Update API key via /connect or POST /credentials',
            })
        elif is_valid is None:
            findings.append({
                'severity': 'INFO',
                'category': 'services',
                'title': f'Credencial sin verificar: {service}',
                'detail': 'Never been tested',
                'action': f'Test with: python3 skills/connect/scripts/services_hub.py --action test-credential --service {service}',
            })

    if not findings:
        findings.append({
            'severity': 'OK',
            'category': 'services',
            'title': 'Servicios saludables',
            'detail': f'{len(credentials)} credentials configured and valid',
        })

    return {
        'category': 'services',
        'total_credentials': len(credentials),
        'services': [c.get('service') for c in credentials],
        'findings': findings,
    }


def audit_costs(client: HubClient) -> dict:
    """Audit cost health."""
    findings = []

    usage = client.get('/analytics/usage', params={'limit': '100'})
    logs = usage.get('data', [])

    total_cost = sum(float(l.get('realCostUsd', 0) or 0) for l in logs)
    by_service = {}
    for l in logs:
        svc = l.get('service', 'unknown')
        cost = float(l.get('realCostUsd', 0) or 0)
        by_service[svc] = by_service.get(svc, 0) + cost

    credits = client.get('/analytics/credits')
    credit_data = credits.get('data', {})
    remaining = credit_data.get('remaining', 'unknown')

    if isinstance(remaining, (int, float)) and remaining < 5:
        findings.append({
            'severity': 'WARNING',
            'category': 'costs',
            'title': 'Créditos bajos',
            'detail': f'Only {remaining} credits remaining',
            'action': 'Consider upgrading plan or purchasing credits',
        })

    if total_cost > 10:
        findings.append({
            'severity': 'INFO',
            'category': 'costs',
            'title': 'Gasto acumulado significativo',
            'detail': f'${total_cost:.2f} total spend across {len(logs)} API calls',
            'action': 'Review cost breakdown and optimize high-spend services',
        })

    if not findings:
        findings.append({
            'severity': 'OK',
            'category': 'costs',
            'title': 'Costos saludables',
            'detail': f'${total_cost:.2f} total, {len(logs)} API calls',
        })

    return {
        'category': 'costs',
        'total_cost_usd': round(total_cost, 4),
        'api_calls': len(logs),
        'by_service': {k: round(v, 4) for k, v in by_service.items()},
        'credit_balance': credit_data,
        'findings': findings,
    }


def main():
    parser = argparse.ArgumentParser(description='Run system audit')
    parser.add_argument('--action', required=True,
                        choices=['full', 'crm', 'campaigns', 'services', 'costs'],
                        help='Audit scope')
    args = parser.parse_args()

    try:
        client = HubClient()
    except RuntimeError as e:
        print(json.dumps({'success': False, 'error': str(e)}, indent=2))
        sys.exit(1)

    results = {}
    all_findings = []

    actions = ['crm', 'campaigns', 'services', 'costs'] if args.action == 'full' else [args.action]

    for action in actions:
        if action == 'crm':
            r = audit_crm(client)
        elif action == 'campaigns':
            r = audit_campaigns(client)
        elif action == 'services':
            r = audit_services(client)
        elif action == 'costs':
            r = audit_costs(client)
        else:
            continue
        results[action] = r
        all_findings.extend(r.get('findings', []))

    critical = sum(1 for f in all_findings if f.get('severity') == 'CRITICAL')
    warnings = sum(1 for f in all_findings if f.get('severity') == 'WARNING')
    info = sum(1 for f in all_findings if f.get('severity') == 'INFO')

    output = {
        'audit_timestamp': datetime.utcnow().isoformat() + 'Z',
        'summary': {
            'total_findings': len(all_findings),
            'critical': critical,
            'warnings': warnings,
            'info': info,
            'health': 'CRITICAL' if critical > 0 else 'WARNING' if warnings > 0 else 'HEALTHY',
        },
        'results': results,
        'all_findings': all_findings,
    }

    print(json.dumps(output, indent=2, ensure_ascii=False))

    if critical > 0:
        sys.exit(2)
    elif warnings > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
