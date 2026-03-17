#!/usr/bin/env python3
"""Analyze email content for spam triggers and quality issues.

Usage:
  python3 analyze_content.py --input .tmp/email_body.html
  python3 analyze_content.py --body "Hola {firstName}, tenemos una oferta..."
"""

import argparse
import json
import re
import sys
import urllib.request


# Spam trigger words (Spanish + English)
SPAM_TRIGGERS = [
    # Spanish
    'gratis', 'gratuito', 'oferta exclusiva', 'oportunidad única',
    'dinero rápido', 'ingreso extra', 'ganar dinero', 'trabaja desde casa',
    'sin inversión', 'últimos cupos', 'no te lo pierdas', 'actúa ahora',
    'tiempo limitado', 'plazas limitadas', 'descuento especial',
    # English
    'free', 'act now', 'limited time', 'exclusive offer', 'earn money',
    'click here', 'buy now', 'order now', 'special promotion',
    'congratulations', 'winner', 'selected', 'urgent',
    # Symbols
    '!!!', '???', '$$$', '100% free', '100% gratis',
]


def analyze_spam_triggers(text: str) -> list:
    """Find spam trigger words/phrases."""
    text_lower = text.lower()
    found = []
    for trigger in SPAM_TRIGGERS:
        if trigger.lower() in text_lower:
            found.append(trigger)
    return found


def analyze_caps(text: str) -> dict:
    """Check for excessive capitalization."""
    # Remove HTML tags
    clean = re.sub(r'<[^>]+>', '', text)
    words = clean.split()
    if not words:
        return {'caps_ratio': 0, 'status': 'OK'}

    caps_words = sum(1 for w in words if w.isupper() and len(w) > 2)
    ratio = caps_words / len(words) * 100

    return {
        'caps_ratio': round(ratio, 1),
        'caps_words': caps_words,
        'total_words': len(words),
        'status': 'WARNING' if ratio > 15 else 'OK',
    }


def analyze_links(html: str) -> list:
    """Extract and check links."""
    urls = re.findall(r'href=["\']([^"\']+)["\']', html)
    results = []

    for url in urls[:20]:  # Max 20 links
        if url.startswith('mailto:') or url.startswith('#') or url.startswith('{'):
            results.append({'url': url, 'status': 'SKIP', 'type': 'special'})
            continue

        try:
            req = urllib.request.Request(url, method='HEAD')
            req.add_header('User-Agent', 'Solti-QA/1.0')
            with urllib.request.urlopen(req, timeout=5) as resp:
                results.append({
                    'url': url[:100],
                    'status': 'OK',
                    'http_code': resp.status,
                })
        except urllib.error.HTTPError as e:
            results.append({
                'url': url[:100],
                'status': 'BROKEN' if e.code >= 400 else 'REDIRECT',
                'http_code': e.code,
            })
        except Exception as e:
            results.append({
                'url': url[:100],
                'status': 'ERROR',
                'error': str(e)[:50],
            })

    return results


def analyze_personalization(text: str) -> dict:
    """Check for personalization tokens."""
    tokens = re.findall(r'\{(\w+)\}', text)
    has_name = any(t.lower() in ('firstname', 'name', 'fullname', 'nombre') for t in tokens)

    return {
        'tokens_found': tokens,
        'has_name_personalization': has_name,
        'status': 'OK' if has_name else 'WARNING',
        'note': 'Name personalization found' if has_name else 'Consider adding {firstName} for personalization',
    }


def analyze_unsubscribe(html: str) -> dict:
    """Check for unsubscribe link."""
    html_lower = html.lower()
    has_unsub = any(word in html_lower for word in [
        'unsubscribe', 'desuscribir', 'darse de baja', 'cancelar suscripción',
        'opt-out', 'opt out', 'remove me', 'eliminar suscripción',
    ])

    return {
        'has_unsubscribe': has_unsub,
        'status': 'OK' if has_unsub else 'WARNING',
        'note': 'Unsubscribe link found' if has_unsub else 'Add unsubscribe link (required by law in most countries)',
    }


def analyze_image_text_ratio(html: str) -> dict:
    """Check image-to-text ratio."""
    images = len(re.findall(r'<img\s', html, re.IGNORECASE))
    clean_text = re.sub(r'<[^>]+>', '', html)
    text_length = len(clean_text.strip())

    if text_length < 50 and images > 0:
        return {
            'images': images,
            'text_chars': text_length,
            'status': 'WARNING',
            'note': 'Too little text relative to images — may trigger spam filters',
        }

    return {
        'images': images,
        'text_chars': text_length,
        'status': 'OK',
        'note': f'{images} images, {text_length} chars of text',
    }


def main():
    parser = argparse.ArgumentParser(description='Analyze email content')
    parser.add_argument('--input', help='Path to HTML file')
    parser.add_argument('--body', help='Inline content text')
    parser.add_argument('--check-links', action='store_true', help='Check links (makes HTTP requests)')
    args = parser.parse_args()

    if args.input:
        try:
            with open(args.input, 'r') as f:
                content = f.read()
        except FileNotFoundError:
            print(json.dumps({'error': f'File not found: {args.input}'}, indent=2))
            sys.exit(1)
    elif args.body:
        content = args.body
    else:
        print(json.dumps({'error': 'Provide --input or --body'}, indent=2))
        sys.exit(1)

    results = {
        'action': 'content_analysis',
        'content_length': len(content),
        'spam_triggers': {
            'found': analyze_spam_triggers(content),
            'status': 'WARNING' if analyze_spam_triggers(content) else 'OK',
        },
        'capitalization': analyze_caps(content),
        'personalization': analyze_personalization(content),
        'unsubscribe': analyze_unsubscribe(content),
        'image_text_ratio': analyze_image_text_ratio(content),
    }

    if args.check_links:
        links = analyze_links(content)
        broken = [l for l in links if l['status'] == 'BROKEN']
        results['links'] = {
            'total': len(links),
            'broken': len(broken),
            'details': links,
            'status': 'FAIL' if broken else 'OK',
        }

    # Overall score
    issues = []
    for key, check in results.items():
        if isinstance(check, dict) and check.get('status') in ('WARNING', 'FAIL'):
            issues.append(key)

    results['summary'] = {
        'total_issues': len(issues),
        'issue_categories': issues,
        'verdict': 'PASS' if not issues else 'REVIEW_NEEDED',
    }

    print(json.dumps(results, indent=2, ensure_ascii=False))

    if issues:
        sys.exit(1)


if __name__ == '__main__':
    main()
