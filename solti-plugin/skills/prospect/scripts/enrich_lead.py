#!/usr/bin/env python3
"""Enrich leads with additional data (email, phone, social profiles).

Usage:
  python3 enrich_lead.py --input .tmp/scrape_results.json --enrich email,phone --output .tmp/enriched.json

Enrichment sources:
  - Website scraping for contact info (epctex/contact-info-scraper on Apify)
  - Domain-based email guessing
  - Social profile cross-referencing

Output: JSON with {success, count, enriched_count, data}
"""

import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.error
import time

BASE_URL = 'https://api.apify.com/v2'
ENRICHMENT_ACTOR = 'epctex/contact-info-scraper'


def extract_domain(url: str) -> str:
    """Extract domain from URL."""
    if not url:
        return ''
    url = url.lower().strip()
    if not url.startswith('http'):
        url = 'http://' + url
    try:
        from urllib.parse import urlparse
        return urlparse(url).netloc.replace('www.', '')
    except Exception:
        return ''


def guess_email(name: str, domain: str) -> str:
    """Generate email guess from name and domain."""
    if not name or not domain:
        return ''
    parts = name.lower().strip().split()
    if len(parts) >= 2:
        # first.last@domain.com is the most common pattern
        first = re.sub(r'[^a-z]', '', parts[0])
        last = re.sub(r'[^a-z]', '', parts[-1])
        if first and last:
            return f"{first}.{last}@{domain}"
    return ''


def enrich_via_apify(websites: list, token: str) -> dict:
    """Enrich contacts via Apify contact info scraper."""
    if not websites or not token:
        return {}

    # Filter valid URLs
    urls = [{'url': w} for w in websites if w and w.startswith('http')]
    if not urls:
        return {}

    try:
        # Start enrichment actor
        safe_actor = ENRICHMENT_ACTOR.replace('/', '~')
        url = f"{BASE_URL}/acts/{safe_actor}/runs?token={token}"
        input_data = {'startUrls': urls[:50]}  # Max 50 per batch
        payload = json.dumps(input_data).encode()
        req = urllib.request.Request(
            url, data=payload,
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            run = json.loads(resp.read())['data']

        run_id = run['id']
        dataset_id = run['defaultDatasetId']

        # Wait for completion (max 120s for enrichment)
        start = time.time()
        while time.time() - start < 120:
            check_url = f"{BASE_URL}/actor-runs/{run_id}?token={token}"
            with urllib.request.urlopen(check_url, timeout=10) as resp:
                status = json.loads(resp.read())['data']['status']
            if status in ('SUCCEEDED', 'FAILED', 'ABORTED'):
                break
            time.sleep(3)

        if status != 'SUCCEEDED':
            return {}

        # Get results
        results_url = f"{BASE_URL}/datasets/{dataset_id}/items?token={token}"
        with urllib.request.urlopen(results_url, timeout=30) as resp:
            results = json.loads(resp.read())

        # Index by domain
        enrichment = {}
        for item in results:
            domain = extract_domain(item.get('url', ''))
            if domain:
                enrichment[domain] = {
                    'emails': item.get('emails', []),
                    'phones': item.get('phones', []),
                    'social': item.get('socialLinks', {}),
                }
        return enrichment

    except Exception as e:
        print(f"Enrichment API error: {e}", file=sys.stderr)
        return {}


def enrich_lead(lead: dict, enrichment_data: dict, enrich_types: set) -> dict:
    """Enrich a single lead with additional data."""
    enriched = dict(lead)
    website = lead.get('website', '') or lead.get('url', '') or lead.get('webUrl', '')
    domain = extract_domain(website)
    name = lead.get('name', '') or lead.get('title', '')

    # Get enrichment from API results
    api_data = enrichment_data.get(domain, {})

    if 'email' in enrich_types and not enriched.get('email'):
        # Try API enrichment first
        api_emails = api_data.get('emails', [])
        if api_emails:
            enriched['email'] = api_emails[0]
            enriched['email_source'] = 'website'
        elif domain:
            # Fall back to email guessing
            guessed = guess_email(name, domain)
            if guessed:
                enriched['email'] = guessed
                enriched['email_source'] = 'guessed'

    if 'phone' in enrich_types and not enriched.get('phone'):
        # From scrape data
        phone = lead.get('phone', '') or lead.get('phoneNumber', '') or lead.get('telephone', '')
        if phone:
            enriched['phone'] = phone
            enriched['phone_source'] = 'scrape'
        else:
            api_phones = api_data.get('phones', [])
            if api_phones:
                enriched['phone'] = api_phones[0]
                enriched['phone_source'] = 'website'

    if 'social' in enrich_types:
        social = api_data.get('social', {})
        if social:
            for platform, url in social.items():
                if url and platform not in enriched:
                    enriched[platform] = url

    return enriched


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--input', required=True,
                        help='Input JSON file with scraped leads')
    parser.add_argument('--enrich', default='email,phone',
                        help='Comma-separated enrichment types: email,phone,social')
    parser.add_argument('--output', default=None,
                        help='Output file path')
    parser.add_argument('--token', default=None,
                        help='Apify API token for enrichment actor')
    parser.add_argument('--confirmed', action='store_true')
    args = parser.parse_args()

    token = args.token or os.environ.get('APIFY_API_TOKEN', '')
    enrich_types = set(args.enrich.split(','))

    try:
        # Load input data
        with open(args.input) as f:
            input_data = json.load(f)

        # Handle both raw array and {data: [...]} format
        if isinstance(input_data, list):
            leads = input_data
        elif isinstance(input_data, dict) and 'data' in input_data:
            leads = input_data['data']
        else:
            leads = [input_data]

        # Collect websites for API enrichment
        websites = []
        for lead in leads:
            url = lead.get('website', '') or lead.get('url', '') or lead.get('webUrl', '')
            if url:
                if not url.startswith('http'):
                    url = 'https://' + url
                websites.append(url)

        # Run API enrichment if we have websites and token
        enrichment_data = {}
        if websites and token and 'email' in enrich_types:
            print(f"Enriching {len(websites)} websites via Apify...", file=sys.stderr)
            enrichment_data = enrich_via_apify(websites, token)

        # Enrich each lead
        enriched_leads = []
        enriched_count = 0
        for lead in leads:
            original_keys = set(lead.keys())
            enriched = enrich_lead(lead, enrichment_data, enrich_types)
            if set(enriched.keys()) - original_keys:
                enriched_count += 1
            enriched_leads.append(enriched)

        # Count enrichment stats
        email_count = sum(1 for l in enriched_leads if l.get('email'))
        phone_count = sum(1 for l in enriched_leads if l.get('phone'))

        output = {
            "success": True,
            "count": len(enriched_leads),
            "enriched_count": enriched_count,
            "email_count": email_count,
            "phone_count": phone_count,
            "data": enriched_leads,
        }

        out_str = json.dumps(output, indent=2, ensure_ascii=False)

        if args.output:
            os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
            with open(args.output, 'w') as f:
                f.write(out_str)
            print(json.dumps({
                "success": True,
                "output_file": args.output,
                "count": len(enriched_leads),
                "enriched_count": enriched_count,
                "email_count": email_count,
                "phone_count": phone_count,
            }))
        else:
            print(out_str)

    except FileNotFoundError:
        print(json.dumps({
            "success": False,
            "error": f"Input file not found: {args.input}",
            "suggestion": "Run scrape_apify.py first to generate the input file."
        }))
        sys.exit(1)

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__,
            "suggestion": "Check input file format (should be JSON array of leads)."
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
