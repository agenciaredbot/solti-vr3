#!/usr/bin/env python3
"""Score leads against ICP (Ideal Customer Profile) criteria.

Usage:
  python3 score_lead.py --input .tmp/enriched.json --icp context/my-icp.md --output .tmp/scored.json

Scoring is done locally (no API calls, no cost). Reads ICP criteria from
the my-icp.md file and scores each lead 0-100.

Output: JSON with {success, count, score_distribution, data}
"""

import argparse
import json
import os
import re
import sys


def parse_icp(icp_path: str) -> dict:
    """Parse ICP criteria from markdown file."""
    criteria = {
        'industries': [],
        'locations': [],
        'company_sizes': [],
        'qualifying': [],
        'disqualifying': [],
        'titles': [],
        'keywords': [],
    }

    if not os.path.exists(icp_path):
        return criteria

    with open(icp_path, 'r') as f:
        content = f.read()

    # Extract industries
    ind_match = re.search(r'\*\*Industry:\*\*\s*(.+)', content)
    if ind_match:
        criteria['industries'] = [i.strip().lower() for i in ind_match.group(1).split(',')]

    # Extract locations
    loc_match = re.search(r'\*\*Location:\*\*\s*(.+)', content)
    if loc_match:
        criteria['locations'] = [l.strip().lower() for l in loc_match.group(1).split(',')]

    # Extract company sizes
    size_match = re.search(r'\*\*Company size:\*\*\s*(.+)', content)
    if size_match:
        criteria['company_sizes'] = [s.strip().lower() for s in size_match.group(1).split(',')]

    # Extract job titles
    title_section = re.findall(r'Job Titles.*?\n((?:- .+\n)+)', content, re.DOTALL)
    if title_section:
        criteria['titles'] = [
            t.strip('- \n').lower()
            for t in title_section[0].strip().split('\n')
            if t.strip('- \n')
        ]

    # Extract qualifying criteria (checked items)
    qual_section = re.findall(r'Qualifying Criteria.*?\n((?:- \[.\] .+\n)+)', content, re.DOTALL)
    if qual_section:
        criteria['qualifying'] = [
            q.strip('- [] \n').lower()
            for q in qual_section[0].strip().split('\n')
            if q.strip('- [] \n')
        ]

    # Extract disqualifying criteria
    disq_section = re.findall(r'Disqualifying Criteria.*?\n((?:- \[.\] .+\n)+)', content, re.DOTALL)
    if disq_section:
        criteria['disqualifying'] = [
            d.strip('- [] \n').lower()
            for d in disq_section[0].strip().split('\n')
            if d.strip('- [] \n')
        ]

    # Collect all keywords from all criteria
    for key in ['industries', 'locations', 'titles', 'qualifying']:
        criteria['keywords'].extend(criteria[key])

    return criteria


def score_lead(lead: dict, icp: dict) -> int:
    """Score a single lead against ICP. Returns 0-100."""
    score = 50  # Base score

    # Serialize lead data for keyword matching
    lead_text = json.dumps(lead, ensure_ascii=False).lower()

    # +15: Has email (critical for outreach)
    if lead.get('email'):
        score += 15

    # +10: Has phone
    if lead.get('phone') or lead.get('phoneNumber') or lead.get('telephone'):
        score += 10

    # +10: Has website
    if lead.get('website') or lead.get('url') or lead.get('webUrl'):
        score += 5

    # +10: Location match
    for location in icp.get('locations', []):
        if location and location in lead_text:
            score += 10
            break

    # +10: Industry match
    for industry in icp.get('industries', []):
        if industry and industry in lead_text:
            score += 10
            break

    # +5 per keyword match (max +15)
    keyword_bonus = 0
    for keyword in icp.get('keywords', []):
        if keyword and len(keyword) > 2 and keyword in lead_text:
            keyword_bonus += 5
    score += min(keyword_bonus, 15)

    # +5: Has social presence
    social_fields = ['instagram', 'linkedin', 'facebook', 'tiktok']
    if any(lead.get(f) for f in social_fields):
        score += 5

    # +5: Has reviews/rating (for Google Maps leads)
    rating = lead.get('totalScore', 0) or lead.get('rating', 0)
    if rating and float(rating) >= 4.0:
        score += 5

    # -20: Disqualifying criteria match
    for disq in icp.get('disqualifying', []):
        if disq and disq in lead_text:
            score -= 20
            break

    # Clamp to 0-100
    return max(0, min(100, score))


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--input', required=True,
                        help='Input JSON file with leads')
    parser.add_argument('--icp', default='context/my-icp.md',
                        help='Path to ICP definition file')
    parser.add_argument('--output', default=None,
                        help='Output file path')
    args = parser.parse_args()

    try:
        # Load ICP criteria
        icp = parse_icp(args.icp)

        # Load leads
        with open(args.input) as f:
            input_data = json.load(f)

        if isinstance(input_data, list):
            leads = input_data
        elif isinstance(input_data, dict) and 'data' in input_data:
            leads = input_data['data']
        else:
            leads = [input_data]

        # Score each lead
        scored_leads = []
        for lead in leads:
            lead_score = score_lead(lead, icp)
            scored = dict(lead)
            scored['score'] = lead_score
            scored['score_category'] = (
                'hot' if lead_score >= 80
                else 'warm' if lead_score >= 60
                else 'cold'
            )
            scored_leads.append(scored)

        # Sort by score descending
        scored_leads.sort(key=lambda x: x['score'], reverse=True)

        # Calculate distribution
        hot = sum(1 for l in scored_leads if l['score'] >= 80)
        warm = sum(1 for l in scored_leads if 60 <= l['score'] < 80)
        cold = sum(1 for l in scored_leads if l['score'] < 60)

        output = {
            "success": True,
            "count": len(scored_leads),
            "score_distribution": {
                "hot": hot,
                "warm": warm,
                "cold": cold,
                "avg_score": round(sum(l['score'] for l in scored_leads) / max(len(scored_leads), 1), 1),
            },
            "data": scored_leads,
        }

        out_str = json.dumps(output, indent=2, ensure_ascii=False)

        if args.output:
            os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
            with open(args.output, 'w') as f:
                f.write(out_str)
            print(json.dumps({
                "success": True,
                "output_file": args.output,
                "count": len(scored_leads),
                "score_distribution": output['score_distribution'],
            }))
        else:
            print(out_str)

    except FileNotFoundError as e:
        print(json.dumps({
            "success": False,
            "error": f"File not found: {e.filename}",
            "suggestion": "Run enrich_lead.py first, or check that the ICP file exists at context/my-icp.md"
        }))
        sys.exit(1)

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__,
            "suggestion": "Check input file format (should be JSON with lead data)."
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
