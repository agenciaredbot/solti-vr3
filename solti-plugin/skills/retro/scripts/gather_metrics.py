#!/usr/bin/env python3
"""Gather weekly metrics from Hub for /retro skill.

Actions:
  weekly     — This week's aggregated metrics (default)
  compare    — This week vs last week comparison

Options:
  --offset N — Shift the week window by N days (default 0 = current week)
  --days N   — Window size (default 7)

Usage:
  python3 gather_metrics.py --action weekly
  python3 gather_metrics.py --action weekly --offset 7     # last week
  python3 gather_metrics.py --action compare               # this vs last
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta

SKILLS_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(SKILLS_DIR, 'connect', 'scripts'))

from hub_client import HubClient


def get_week_metrics(client: HubClient, days: int = 7, offset: int = 0) -> dict:
    """Get aggregated metrics for a time window."""
    result = client.get('/analytics/metrics', params={'days': str(days + offset)})
    metrics_list = result.get('data', [])

    # If offset, slice to only the relevant window
    if offset > 0 and len(metrics_list) > days:
        metrics_list = metrics_list[offset:offset + days]
    elif offset == 0:
        metrics_list = metrics_list[:days]

    # Aggregate
    agg = {
        'leadsGenerated': 0,
        'leadsEnriched': 0,
        'emailsSent': 0,
        'emailsOpened': 0,
        'dmsSent': 0,
        'dmsReplied': 0,
        'whatsappMessagesIn': 0,
        'whatsappMessagesOut': 0,
        'postsPublished': 0,
        'totalCreditsUsed': 0.0,
    }

    for m in metrics_list:
        for key in agg:
            agg[key] += m.get(key, 0)

    # Calculate rates
    agg['emailOpenRate'] = round(agg['emailsOpened'] / agg['emailsSent'] * 100, 1) if agg['emailsSent'] > 0 else 0
    agg['dmReplyRate'] = round(agg['dmsReplied'] / agg['dmsSent'] * 100, 1) if agg['dmsSent'] > 0 else 0
    agg['costPerLead'] = round(agg['totalCreditsUsed'] / agg['leadsGenerated'], 4) if agg['leadsGenerated'] > 0 else 0

    return {
        'days': len(metrics_list),
        'start': metrics_list[-1].get('date', '') if metrics_list else '',
        'end': metrics_list[0].get('date', '') if metrics_list else '',
        'metrics': agg,
        'daily': metrics_list,
    }


def compare_weeks(client: HubClient, days: int = 7) -> dict:
    """Compare current week to previous week."""
    current = get_week_metrics(client, days=days, offset=0)
    previous = get_week_metrics(client, days=days, offset=days)

    comparison = {}
    for key in current['metrics']:
        curr_val = current['metrics'][key]
        prev_val = previous['metrics'].get(key, 0)

        if prev_val > 0:
            change_pct = round((curr_val - prev_val) / prev_val * 100, 1)
        elif curr_val > 0:
            change_pct = 100.0
        else:
            change_pct = 0.0

        if change_pct > 50:
            trend = '🔥'
        elif change_pct > 10:
            trend = '↑'
        elif change_pct >= -10:
            trend = '→'
        elif change_pct >= -50:
            trend = '↓'
        else:
            trend = '💀'

        comparison[key] = {
            'current': curr_val,
            'previous': prev_val,
            'change_pct': change_pct,
            'trend': trend,
        }

    # Determine overall health
    improving = sum(1 for v in comparison.values() if v['trend'] in ('↑', '🔥'))
    declining = sum(1 for v in comparison.values() if v['trend'] in ('↓', '💀'))
    if improving > declining * 2:
        overall = 'GROWING'
    elif declining > improving * 2:
        overall = 'DECLINING'
    else:
        overall = 'STABLE'

    return {
        'action': 'compare',
        'current_week': {
            'start': current['start'],
            'end': current['end'],
            'days': current['days'],
        },
        'previous_week': {
            'start': previous['start'],
            'end': previous['end'],
            'days': previous['days'],
        },
        'comparison': comparison,
        'overall_trend': overall,
        'improving_metrics': improving,
        'declining_metrics': declining,
    }


def action_weekly(client: HubClient, days: int, offset: int) -> dict:
    """Get weekly metrics."""
    week = get_week_metrics(client, days=days, offset=offset)

    # Also get CRM snapshot
    crm = client.get('/contacts', params={'limit': '1'})
    total_contacts = crm.get('pagination', {}).get('total', 0)

    # Campaign snapshot
    campaigns = client.get('/campaigns')
    campaign_list = campaigns.get('data', [])
    active_campaigns = sum(1 for c in campaign_list if c.get('status') == 'SENDING')

    return {
        'action': 'weekly',
        'period': {
            'start': week['start'],
            'end': week['end'],
            'days': week['days'],
            'offset': offset,
        },
        'metrics': week['metrics'],
        'snapshots': {
            'total_contacts': total_contacts,
            'total_campaigns': len(campaign_list),
            'active_campaigns': active_campaigns,
        },
    }


def main():
    parser = argparse.ArgumentParser(description='Gather weekly metrics from Hub')
    parser.add_argument('--action', default='weekly', choices=['weekly', 'compare'],
                        help='Action to perform')
    parser.add_argument('--days', type=int, default=7, help='Window size in days')
    parser.add_argument('--offset', type=int, default=0, help='Offset in days from today')
    args = parser.parse_args()

    try:
        client = HubClient()
    except RuntimeError as e:
        print(json.dumps({'success': False, 'error': str(e)}, indent=2))
        sys.exit(1)

    if args.action == 'weekly':
        result = action_weekly(client, args.days, args.offset)
    elif args.action == 'compare':
        result = compare_weeks(client, args.days)
    else:
        result = {'error': f'Unknown action: {args.action}'}

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
