#!/usr/bin/env python3
"""
Browse Page — Scrape, screenshot, or interact with a webpage via Apify.

Usage:
  python browse_page.py --mode scrape --url https://example.com --extract "pricing tiers"
  python browse_page.py --mode screenshot --url https://example.com --viewport desktop
  python browse_page.py --mode monitor --url https://example.com --selector ".pricing"

Environment: APIFY_API_KEY required for cloud mode.
"""

import json
import sys
import os
import argparse
import hashlib
from datetime import datetime
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description='Browse and interact with webpages')
    parser.add_argument('--mode', choices=['scrape', 'screenshot', 'monitor', 'interact'], required=True)
    parser.add_argument('--url', required=True, help='Target URL')
    parser.add_argument('--extract', help='What to extract (for scrape mode)')
    parser.add_argument('--selector', help='CSS selector to focus on')
    parser.add_argument('--viewport', choices=['mobile', 'desktop', 'tablet'], default='desktop')
    parser.add_argument('--output', help='Output file path')
    args = parser.parse_args()

    api_key = os.environ.get('APIFY_API_KEY')
    if not api_key:
        print(json.dumps({
            'success': False,
            'error': 'APIFY_API_KEY not set. Add your Apify key via /connect.'
        }))
        sys.exit(1)

    if args.mode == 'scrape':
        result = scrape_page(api_key, args.url, args.extract, args.selector)
    elif args.mode == 'screenshot':
        result = take_screenshot(api_key, args.url, args.viewport, args.output)
    elif args.mode == 'monitor':
        result = monitor_page(api_key, args.url, args.selector)
    elif args.mode == 'interact':
        result = {'success': False, 'error': 'Interactive mode requires step-by-step instructions via the skill.'}
    else:
        result = {'success': False, 'error': f'Unknown mode: {args.mode}'}

    print(json.dumps(result, indent=2, ensure_ascii=False))


def scrape_page(api_key: str, url: str, extract: str | None, selector: str | None) -> dict:
    """Scrape a webpage using Apify's web scraper actor."""
    import urllib.request

    actor_id = 'apify~web-scraper'
    run_input = {
        'startUrls': [{'url': url}],
        'pageFunction': f'''
async function pageFunction(context) {{
    const {{ page, request }} = context;
    await page.waitForTimeout(3000);
    {'const el = await page.$("' + selector + '"); const text = el ? await el.textContent() : "";' if selector else 'const text = await page.evaluate(() => document.body.innerText);'}
    return {{
        url: request.url,
        title: await page.title(),
        text: text.substring(0, 10000),
        timestamp: new Date().toISOString()
    }};
}}''',
        'maxPagesPerCrawl': 1,
    }

    data = json.dumps(run_input).encode()
    req = urllib.request.Request(
        f'https://api.apify.com/v2/acts/{actor_id}/runs?token={api_key}',
        data=data,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            return {
                'success': True,
                'runId': result.get('data', {}).get('id'),
                'status': result.get('data', {}).get('status'),
                'message': f'Scraping started for {url}. Check job status for results.',
                'extract': extract,
            }
    except Exception as e:
        return {'success': False, 'error': str(e)}


def take_screenshot(api_key: str, url: str, viewport: str, output: str | None) -> dict:
    """Take a screenshot using Apify's screenshot actor."""
    import urllib.request

    viewports = {
        'desktop': {'width': 1920, 'height': 1080},
        'mobile': {'width': 375, 'height': 812},
        'tablet': {'width': 768, 'height': 1024},
    }

    actor_id = 'apify~screenshot-url'
    run_input = {
        'urls': [{'url': url}],
        'viewportWidth': viewports[viewport]['width'],
        'viewportHeight': viewports[viewport]['height'],
        'fullPage': True,
        'output': 'png',
    }

    data = json.dumps(run_input).encode()
    req = urllib.request.Request(
        f'https://api.apify.com/v2/acts/{actor_id}/runs?token={api_key}',
        data=data,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            return {
                'success': True,
                'runId': result.get('data', {}).get('id'),
                'viewport': viewport,
                'message': f'Screenshot capture started for {url}. Check job for image.',
            }
    except Exception as e:
        return {'success': False, 'error': str(e)}


def monitor_page(api_key: str, url: str, selector: str | None) -> dict:
    """Monitor a page for changes. Compares with previous snapshot."""
    data_dir = Path('data/monitor')
    data_dir.mkdir(parents=True, exist_ok=True)

    url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
    snapshot_file = data_dir / f'{url_hash}.json'

    # Load previous snapshot
    previous = None
    if snapshot_file.exists():
        with open(snapshot_file) as f:
            previous = json.load(f)

    # For now, return instructions to scrape and compare
    return {
        'success': True,
        'url': url,
        'selector': selector,
        'hasPrevious': previous is not None,
        'previousDate': previous.get('timestamp') if previous else None,
        'message': 'Use SCRAPE mode first to get current state, then this script compares changes.',
    }


if __name__ == '__main__':
    main()
