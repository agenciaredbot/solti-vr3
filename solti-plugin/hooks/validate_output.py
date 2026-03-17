#!/usr/bin/env python3
"""PostToolUse hook: Validate that Solti scripts return valid JSON output.

Checks:
  - Output is valid JSON
  - Contains expected 'success' field
  - Logs warnings for failures (does not block)

Exit codes:
  0 = valid (or non-script tool call)
  1 = warning (logged but not blocking)
"""

import json
import sys


def main():
    try:
        hook_input = json.loads(sys.stdin.read())
        tool_name = hook_input.get('tool_name', '')
        tool_output = hook_input.get('tool_output', '')
        tool_input = hook_input.get('tool_input', {})

        # Only validate Bash calls to our scripts
        command = tool_input.get('command', '') if isinstance(tool_input, dict) else ''
        if tool_name != 'Bash' or 'scripts/' not in command:
            sys.exit(0)

        # Try to parse output as JSON
        if tool_output and tool_output.strip():
            try:
                parsed = json.loads(tool_output.strip())

                # Check for success field
                if isinstance(parsed, dict) and 'success' in parsed:
                    if not parsed['success']:
                        error_msg = parsed.get('error', 'unknown error')
                        suggestion = parsed.get('suggestion', '')
                        warning = f"Script returned error: {error_msg}"
                        if suggestion:
                            warning += f" | Suggestion: {suggestion}"
                        print(json.dumps({"warning": warning}), file=sys.stderr)

            except json.JSONDecodeError:
                print(json.dumps({
                    "warning": (
                        "Script output is not valid JSON. "
                        "All Solti scripts should output JSON to stdout."
                    )
                }), file=sys.stderr)

        sys.exit(0)

    except Exception:
        sys.exit(0)


if __name__ == '__main__':
    main()
