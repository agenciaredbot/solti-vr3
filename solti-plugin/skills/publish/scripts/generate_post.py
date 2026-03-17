#!/usr/bin/env python3
"""Generate social media post content.

Usage:
  python3 generate_post.py --platform linkedin --topic "AI in real estate" \
    --voice context/my-voice.md --output .tmp/post_draft.json

This generates the post structure and instructions for Claude to write the copy.
Claude reads the prompt template + context files to produce the final content.

Output: JSON with {success, post}
"""

import argparse
import json
import os
import sys

PLATFORM_SPECS = {
    'linkedin': {
        'max_chars': 3000,
        'max_hashtags': 5,
        'best_length': '800-1500 chars',
        'tone': 'professional but approachable',
        'prompt_file': 'skills/publish/assets/prompts/linkedin_post.txt',
    },
    'instagram': {
        'max_chars': 2200,
        'max_hashtags': 15,
        'best_length': '300-800 chars',
        'tone': 'visual, casual, emoji-friendly',
        'prompt_file': 'skills/publish/assets/prompts/instagram_caption.txt',
    },
    'twitter': {
        'max_chars': 280,
        'max_hashtags': 3,
        'best_length': '200-270 chars',
        'tone': 'punchy, provocative',
        'prompt_file': 'skills/publish/assets/prompts/thread_hook.txt',
    },
    'facebook': {
        'max_chars': 5000,
        'max_hashtags': 5,
        'best_length': '300-1000 chars',
        'tone': 'casual, community-oriented',
        'prompt_file': 'skills/publish/assets/prompts/linkedin_post.txt',
    },
    'tiktok': {
        'max_chars': 2200,
        'max_hashtags': 10,
        'best_length': '100-300 chars',
        'tone': 'fun, trending, gen-z friendly',
        'prompt_file': 'skills/publish/assets/prompts/instagram_caption.txt',
    },
}

CONTENT_PILLARS = [
    'educate',      # Industry insights, tips, how-tos
    'showcase',     # Product demos, features, results
    'social_proof', # Testimonials, case studies
    'behind_scenes',# Team, process, culture
    'engage',       # Questions, polls, opinions
]


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--platform', required=True,
                        choices=list(PLATFORM_SPECS.keys()),
                        help='Target social media platform')
    parser.add_argument('--topic', required=True,
                        help='Post topic or theme')
    parser.add_argument('--pillar', default=None,
                        choices=CONTENT_PILLARS,
                        help='Content pillar (auto-detected if not specified)')
    parser.add_argument('--voice', default='context/my-voice.md',
                        help='Voice context file')
    parser.add_argument('--business', default='context/my-business.md',
                        help='Business context file')
    parser.add_argument('--output', default=None)
    args = parser.parse_args()

    specs = PLATFORM_SPECS[args.platform]
    pillar = args.pillar or 'educate'  # Default pillar

    result = {
        'success': True,
        'post': {
            'platform': args.platform,
            'topic': args.topic,
            'pillar': pillar,
            'specs': specs,
            'context_files': {
                'voice': args.voice,
                'business': args.business,
            },
            'instructions': (
                f'Generate a {args.platform} post about: {args.topic}. '
                f'Read {args.voice} for tone and style. '
                f'Read {args.business} for business context. '
                f'Platform specs: max {specs["max_chars"]} chars, '
                f'ideal length {specs["best_length"]}, '
                f'max {specs["max_hashtags"]} hashtags. '
                f'Content pillar: {pillar}. '
                f'Tone: {specs["tone"]}.'
            ),
            'prompt_file': specs['prompt_file'],
        },
    }

    out_str = json.dumps(result, indent=2, ensure_ascii=False)

    if args.output:
        os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
        with open(args.output, 'w') as f:
            f.write(out_str)
        print(json.dumps({
            'success': True,
            'output_file': args.output,
            'platform': args.platform,
        }))
    else:
        print(out_str)


if __name__ == '__main__':
    main()
