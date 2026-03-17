#!/usr/bin/env python3
"""Gather strategic data from Hub for /strategy skill.

Actions:
  dashboard   — Key metrics (contacts, campaigns, credits, jobs)
  channels    — Channel performance breakdown
  top-leads   — Top scored leads in CRM
  costs       — Cost breakdown by service
  trends      — Daily metrics for trend analysis (last 30 days)

Usage:
  python3 gather_strategy_data.py --action dashboard
  python3 gather_strategy_data.py --action channels
  python3 gather_strategy_data.py --action top-leads --limit 20
  python3 gather_strategy_data.py --action costs --days 30
  python3 gather_strategy_data.py --action trends --days 30
"""

import argparse
import json
import os
import sys

# Import hub_client from connect/scripts
SKILLS_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(SKILLS_DIR, 'connect', 'scripts'))

from hub_client import HubClient


def action_dashboard(client: HubClient) -> dict:
    """Get dashboard summary metrics."""
    result = client.get('/analytics/dashboard')
    if result.get('success') is False:
        return result

    data = result.get('data', result)
    return {
        'action': 'dashboard',
        'metrics': data,
    }


def action_channels(client: HubClient) -> dict:
    """Get channel performance breakdown from campaigns."""
    campaigns = client.get('/campaigns')
    if campaigns.get('success') is False:
        return campaigns

    campaign_list = campaigns.get('data', [])

    channels = {}
    for c in campaign_list:
        ch = c.get('type', 'unknown')
        if ch not in channels:
            channels[ch] = {'count': 0, 'statuses': {}, 'total_recipients': 0}
        channels[ch]['count'] += 1
        status = c.get('status', 'UNKNOWN')
        channels[ch]['statuses'][status] = channels[ch]['statuses'].get(status, 0) + 1
        channels[ch]['total_recipients'] += c.get('_count', {}).get('recipients', 0)

    return {
        'action': 'channels',
        'total_campaigns': len(campaign_list),
        'by_channel': channels,
    }


def action_top_leads(client: HubClient, limit: int = 20) -> dict:
    """Get top scored leads from CRM."""
    result = client.get('/contacts', params={
        'sortBy': 'score',
        'sortDir': 'desc',
        'limit': str(limit),
    })
    if result.get('success') is False:
        return result

    contacts = result.get('data', [])
    leads = []
    for c in contacts:
        leads.append({
            'name': f"{c.get('firstName', '')} {c.get('lastName', '')}".strip(),
            'score': c.get('score', 0),
            'status': c.get('status', 'NEW'),
            'email': c.get('email', ''),
            'source': c.get('source', ''),
            'city': c.get('city', ''),
        })

    # Score distribution
    all_contacts = client.get('/contacts', params={'limit': '100', 'sortBy': 'score', 'sortDir': 'desc'})
    all_list = all_contacts.get('data', [])
    total = all_contacts.get('pagination', {}).get('total', len(all_list))

    hot = sum(1 for c in all_list if c.get('score', 0) >= 80)
    warm = sum(1 for c in all_list if 60 <= c.get('score', 0) < 80)
    cold = sum(1 for c in all_list if c.get('score', 0) < 60)

    return {
        'action': 'top_leads',
        'top_leads': leads,
        'distribution': {
            'total': total,
            'hot_80plus': hot,
            'warm_60_79': warm,
            'cold_below_60': cold,
        },
    }


def action_costs(client: HubClient, days: int = 30) -> dict:
    """Get cost breakdown by service."""
    result = client.get('/analytics/usage', params={'limit': '200'})
    if result.get('success') is False:
        return result

    logs = result.get('data', [])
    by_service = {}
    total_cost = 0.0

    for log in logs:
        service = log.get('service', 'unknown')
        cost = float(log.get('realCostUsd', 0) or 0)
        if service not in by_service:
            by_service[service] = {'calls': 0, 'cost': 0.0, 'actions': {}}
        by_service[service]['calls'] += 1
        by_service[service]['cost'] += cost
        total_cost += cost

        action = log.get('action', 'unknown')
        by_service[service]['actions'][action] = by_service[service]['actions'].get(action, 0) + 1

    return {
        'action': 'costs',
        'period_days': days,
        'total_cost_usd': round(total_cost, 4),
        'by_service': {k: {**v, 'cost': round(v['cost'], 4)} for k, v in by_service.items()},
    }


def action_trends(client: HubClient, days: int = 30) -> dict:
    """Get daily metrics for trend analysis."""
    result = client.get('/analytics/metrics', params={'days': str(days)})
    if result.get('success') is False:
        return result

    metrics = result.get('data', [])
    return {
        'action': 'trends',
        'period_days': days,
        'daily_metrics': metrics,
        'summary': {
            'total_days': len(metrics),
            'total_leads': sum(m.get('leadsGenerated', 0) for m in metrics),
            'total_emails_sent': sum(m.get('emailsSent', 0) for m in metrics),
            'total_emails_opened': sum(m.get('emailsOpened', 0) for m in metrics),
            'total_dms_sent': sum(m.get('dmsSent', 0) for m in metrics),
            'total_dms_replied': sum(m.get('dmsReplied', 0) for m in metrics),
            'total_whatsapp_in': sum(m.get('whatsappMessagesIn', 0) for m in metrics),
            'total_whatsapp_out': sum(m.get('whatsappMessagesOut', 0) for m in metrics),
        },
    }


def main():
    parser = argparse.ArgumentParser(description='Gather strategy data from Hub')
    parser.add_argument('--action', required=True,
                        choices=['dashboard', 'channels', 'top-leads', 'costs', 'trends'],
                        help='Data to gather')
    parser.add_argument('--limit', type=int, default=20, help='Limit for top-leads')
    parser.add_argument('--days', type=int, default=30, help='Days for costs/trends')
    args = parser.parse_args()

    try:
        client = HubClient()
    except RuntimeError as e:
        print(json.dumps({'success': False, 'error': str(e)}, indent=2))
        sys.exit(1)

    if args.action == 'dashboard':
        result = action_dashboard(client)
    elif args.action == 'channels':
        result = action_channels(client)
    elif args.action == 'top-leads':
        result = action_top_leads(client, args.limit)
    elif args.action == 'costs':
        result = action_costs(client, args.days)
    elif args.action == 'trends':
        result = action_trends(client, args.days)
    else:
        result = {'error': f'Unknown action: {args.action}'}

    print(json.dumps(result, indent=2, ensure_ascii=False))

    if result.get('success') is False:
        sys.exit(1)


if __name__ == '__main__':
    main()
