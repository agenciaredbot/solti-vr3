#!/usr/bin/env python3
"""Generate a weekly content calendar.

Usage:
  python3 content_calendar.py --platforms linkedin,instagram \
    --posts-per-week 5 --voice context/my-voice.md --output .tmp/calendar.json

Generates a structured content plan with topics, pillars, and scheduling
suggestions. Claude fills in the actual content using prompt templates.

Output: JSON with {success, calendar}
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta

CONTENT_PILLARS = {
    'educate': {
        'description': 'Industry insights, tips, how-tos',
        'frequency': 0.30,  # 30% of content
    },
    'showcase': {
        'description': 'Product demos, features, results',
        'frequency': 0.25,
    },
    'social_proof': {
        'description': 'Testimonials, case studies, metrics',
        'frequency': 0.15,
    },
    'behind_scenes': {
        'description': 'Team, process, culture, founder story',
        'frequency': 0.15,
    },
    'engage': {
        'description': 'Questions, polls, opinions, trends',
        'frequency': 0.15,
    },
}

BEST_TIMES = {
    'linkedin': ['09:00', '12:00', '17:00'],
    'instagram': ['08:00', '12:00', '18:00', '20:00'],
    'twitter': ['08:00', '12:00', '17:00'],
    'facebook': ['09:00', '13:00', '16:00'],
    'tiktok': ['10:00', '14:00', '19:00'],
}

WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']


def generate_calendar(platforms: list, posts_per_week: int,
                      start_date: datetime) -> dict:
    """Generate a content calendar structure."""
    # Distribute pillars across posts
    pillar_names = list(CONTENT_PILLARS.keys())
    posts = []

    for i in range(posts_per_week):
        # Rotate through pillars
        pillar = pillar_names[i % len(pillar_names)]
        # Rotate through platforms
        platform = platforms[i % len(platforms)]
        # Assign to weekday (Mon-Fri, skip weekends unless >5 posts)
        day_offset = i if i < 5 else i
        post_date = start_date + timedelta(days=day_offset)
        weekday = WEEKDAYS[post_date.weekday()]

        # Pick best time for platform
        times = BEST_TIMES.get(platform, ['10:00'])
        time_slot = times[i % len(times)]

        posts.append({
            'day': i + 1,
            'date': post_date.strftime('%Y-%m-%d'),
            'weekday': weekday,
            'time': time_slot,
            'platform': platform,
            'pillar': pillar,
            'pillar_description': CONTENT_PILLARS[pillar]['description'],
            'topic': f'[Claude: generate topic for {pillar} on {platform}]',
            'status': 'draft',
        })

    return {
        'success': True,
        'calendar': {
            'week_start': start_date.strftime('%Y-%m-%d'),
            'week_end': (start_date + timedelta(days=6)).strftime('%Y-%m-%d'),
            'platforms': platforms,
            'total_posts': len(posts),
            'posts': posts,
            'instructions': (
                'For each post, Claude should: '
                '1) Read context/my-voice.md for tone, '
                '2) Read context/my-business.md for topics, '
                '3) Generate a specific topic based on the pillar, '
                '4) Write the full post content matching platform specs.'
            ),
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--platforms', default='linkedin,instagram',
                        help='Comma-separated platforms')
    parser.add_argument('--posts-per-week', type=int, default=5,
                        help='Number of posts per week (default: 5)')
    parser.add_argument('--start-date', default=None,
                        help='Week start date (YYYY-MM-DD, default: next Monday)')
    parser.add_argument('--voice', default='context/my-voice.md')
    parser.add_argument('--business', default='context/my-business.md')
    parser.add_argument('--output', default=None)
    args = parser.parse_args()

    platforms = [p.strip() for p in args.platforms.split(',')]

    if args.start_date:
        start = datetime.strptime(args.start_date, '%Y-%m-%d')
    else:
        today = datetime.now()
        days_ahead = 7 - today.weekday()  # Next Monday
        if days_ahead <= 0:
            days_ahead += 7
        start = today + timedelta(days=days_ahead)

    result = generate_calendar(platforms, args.posts_per_week, start)

    out_str = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
        with open(args.output, 'w') as f:
            f.write(out_str)
        print(json.dumps({
            'success': True,
            'output_file': args.output,
            'total_posts': result['calendar']['total_posts'],
        }))
    else:
        print(out_str)


if __name__ == '__main__':
    main()
