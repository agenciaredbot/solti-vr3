#!/usr/bin/env python3
"""PreToolUse hook: Require user confirmation for expensive operations (>$1).

When a cost-bearing script is detected and estimated cost exceeds the threshold,
this hook blocks execution (exit 2) and asks Claude to confirm with the user.
Rerun the command with --confirmed flag to bypass after user approval.

Exit codes:
  0 = allow
  2 = BLOCK (requires confirmation)
"""

import json
import re
import sys

COST_THRESHOLD = 1.00  # USD

COST_SCRIPTS = {
    'scrape_apify.py': 0.005,       # ~$0.005 per result
    'scrape_phantom.py': 0.006,     # ~$0.006 per result
    'send_email_campaign.py': 0.0004,  # ~$0.0004 per email
    'send_instagram_dm.py': 0.016,  # ~$0.016 per DM
    'send_linkedin_dm.py': 0.012,   # ~$0.012 per DM
    'send_whatsapp.py': 0.01,       # ~$0.01 per message
    'schedule_post.py': 0.10,       # ~$0.10 per post
}


def extract_count_from_args(command: str) -> int:
    """Extract the item count from script CLI arguments."""
    # Try --max-results, --max, --recipients, --count patterns
    for pattern in [
        r'--max[-_]results?\s+(\d+)',
        r'--max\s+(\d+)',
        r'--recipients?\s+(\d+)',
        r'--count\s+(\d+)',
        r'-n\s+(\d+)',
    ]:
        match = re.search(pattern, command)
        if match:
            return int(match.group(1))
    return 100  # default estimate


def estimate_cost(script_name: str, command: str) -> float:
    """Estimate the cost of running a script based on its arguments."""
    per_unit = COST_SCRIPTS.get(script_name, 0)
    if per_unit == 0:
        return 0
    count = extract_count_from_args(command)
    return per_unit * count


def main():
    try:
        hook_input = json.loads(sys.stdin.read())
        tool_name = hook_input.get('tool_name', '')
        tool_input = hook_input.get('tool_input', {})

        if tool_name != 'Bash':
            sys.exit(0)

        command = tool_input.get('command', '')

        # Check if it's a cost-bearing script
        for script_name in COST_SCRIPTS:
            if script_name in command:
                # Skip if already confirmed by user
                if '--confirmed' in command:
                    sys.exit(0)

                estimated = estimate_cost(script_name, command)
                if estimated > COST_THRESHOLD:
                    print(json.dumps({
                        "error": (
                            f"Cost guard: This action ({script_name}) costs ~${estimated:.2f}. "
                            f"Ask the user to confirm, then rerun with --confirmed flag."
                        )
                    }), file=sys.stderr)
                    sys.exit(2)
                break

        sys.exit(0)

    except Exception:
        sys.exit(0)  # Fail open


if __name__ == '__main__':
    main()
