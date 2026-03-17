#!/usr/bin/env python3
"""Scrape data using Apify actors.

Usage:
  python3 scrape_apify.py --platform google_maps --query "restaurantes" --location "bogota" --max-results 100 --output .tmp/results.json

Supported platforms: google_maps, linkedin, instagram, tiktok, website

Output: JSON with {success, platform, query, location, count, run_id, data}
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error

ACTORS = {
    'google_maps': 'compass/crawler-google-places',
    'linkedin': 'anchor/linkedin-search',
    'instagram': 'apify/instagram-scraper',
    'tiktok': 'clockworks/tiktok-scraper',
    'website': 'apify/web-scraper',
}

BASE_URL = 'https://api.apify.com/v2'


def api_request(url: str, data: dict = None, token: str = '') -> dict:
    """Make an API request to Apify."""
    if '?' in url:
        url += f'&token={token}'
    else:
        url += f'?token={token}'

    if data is not None:
        payload = json.dumps(data).encode()
        req = urllib.request.Request(
            url, data=payload,
            headers={'Content-Type': 'application/json'}
        )
    else:
        req = urllib.request.Request(url)

    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def start_actor(actor_id: str, input_data: dict, token: str) -> dict:
    """Start an Apify actor run."""
    # Apify API requires ~ instead of / in actor IDs within URL paths
    safe_id = actor_id.replace('/', '~')
    url = f"{BASE_URL}/acts/{safe_id}/runs"
    result = api_request(url, data=input_data, token=token)
    return result['data']


def wait_for_run(run_id: str, token: str, timeout: int = 300) -> dict:
    """Poll until actor run completes."""
    url = f"{BASE_URL}/actor-runs/{run_id}"
    start = time.time()
    while time.time() - start < timeout:
        result = api_request(url, token=token)
        run = result['data']
        status = run['status']
        if status in ('SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'):
            return run
        # Progress indicator to stderr (not captured as output)
        elapsed = int(time.time() - start)
        print(f"  Waiting for results... ({elapsed}s, status: {status})", file=sys.stderr)
        time.sleep(5)
    raise TimeoutError(
        f"Actor run {run_id} timed out after {timeout}s. "
        "The scraping job may still be running on Apify. "
        "Check status at https://console.apify.com/actors/runs"
    )


def get_results(dataset_id: str, token: str) -> list:
    """Fetch results from completed dataset."""
    url = f"{BASE_URL}/datasets/{dataset_id}/items"
    return api_request(url, token=token)


def build_input(platform: str, query: str, location: str, max_results: int) -> dict:
    """Build actor-specific input configuration."""
    if platform == 'google_maps':
        return {
            'searchStringsArray': [query],
            'locationQuery': location,
            'maxCrawledPlacesPerSearch': max_results,
            'language': 'es',
        }
    elif platform == 'instagram':
        return {
            'usernames': [query] if not query.startswith('#') else [],
            'hashtags': [query.lstrip('#')] if query.startswith('#') else [],
            'resultsLimit': max_results,
        }
    elif platform == 'linkedin':
        return {
            'searchUrl': query,
            'maxResults': max_results,
        }
    elif platform == 'tiktok':
        return {
            'searchQueries': [query],
            'resultsPerPage': max_results,
        }
    elif platform == 'website':
        return {
            'startUrls': [{'url': query}],
            'maxPagesPerCrawl': max_results,
        }
    return {'query': query, 'maxResults': max_results}


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--platform', required=True, choices=ACTORS.keys(),
                        help='Platform to scrape')
    parser.add_argument('--query', required=True,
                        help='Search query or URL')
    parser.add_argument('--location', default='',
                        help='Geographic filter (e.g., "bogota")')
    parser.add_argument('--max-results', type=int, default=100,
                        help='Maximum number of results')
    parser.add_argument('--token', default=None,
                        help='Apify API token (or set APIFY_API_TOKEN env)')
    parser.add_argument('--output', default=None,
                        help='Output file path (default: stdout)')
    parser.add_argument('--confirmed', action='store_true',
                        help='Bypass cost confirmation (set by cost_guard hook)')
    args = parser.parse_args()

    token = args.token or os.environ.get('APIFY_API_TOKEN', '')
    if not token:
        print(json.dumps({
            "success": False,
            "error": "No Apify API token provided.",
            "suggestion": "Run /connect to configure your Apify API token, or set APIFY_API_TOKEN environment variable."
        }))
        sys.exit(1)

    try:
        actor_id = ACTORS[args.platform]
        actor_input = build_input(args.platform, args.query, args.location, args.max_results)

        print(f"Starting {args.platform} scrape via Apify ({actor_id})...", file=sys.stderr)

        # Start actor run
        run = start_actor(actor_id, actor_input, token)
        run_id = run['id']
        dataset_id = run['defaultDatasetId']

        # Wait for completion
        completed = wait_for_run(run_id, token)
        if completed['status'] != 'SUCCEEDED':
            print(json.dumps({
                "success": False,
                "error": f"Apify actor run failed with status: {completed['status']}",
                "run_id": run_id,
                "suggestion": "Check the Apify dashboard for details. The actor may need different input parameters."
            }))
            sys.exit(1)

        # Fetch results
        results = get_results(dataset_id, token)

        output = {
            "success": True,
            "platform": args.platform,
            "query": args.query,
            "location": args.location,
            "count": len(results),
            "run_id": run_id,
            "data": results,
        }

        out_str = json.dumps(output, indent=2, ensure_ascii=False)

        if args.output:
            os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
            with open(args.output, 'w') as f:
                f.write(out_str)
            # Print summary to stdout (not full data)
            print(json.dumps({
                "success": True,
                "output_file": args.output,
                "count": len(results),
                "run_id": run_id,
                "platform": args.platform,
            }))
        else:
            print(out_str)

    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ''
        if e.code == 401:
            suggestion = "Your Apify API token is invalid or expired. Get a new one at https://console.apify.com/settings"
        elif e.code == 402:
            suggestion = "Insufficient Apify credits. Check your balance at https://console.apify.com/billing"
        else:
            suggestion = f"Apify API returned HTTP {e.code}. Check the Apify dashboard for details."
        print(json.dumps({
            "success": False,
            "error": f"Apify API error (HTTP {e.code}): {error_body[:200]}",
            "suggestion": suggestion,
        }))
        sys.exit(1)

    except TimeoutError as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "suggestion": "Try with fewer results (--max-results 50) or check Apify dashboard."
        }))
        sys.exit(1)

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__,
            "suggestion": "Check network connection and Apify API token validity."
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
