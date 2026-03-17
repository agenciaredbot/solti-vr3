#!/usr/bin/env python3
"""PreToolUse hook: Block dangerous commands before execution.

Exit codes:
  0 = allow (proceed)
  2 = BLOCK (unbypassable, cannot be overridden by Claude)
"""

import json
import re
import sys

DANGEROUS_BASH_PATTERNS = [
    # Destructive file operations
    r'rm\s+(-[rf]+\s+)*/',
    r'rm\s+(-[rf]+\s+)*~',
    r'rm\s+(-[rf]+\s+)*\.',
    r'>\s*/dev/sd',
    r'mkfs\.',
    r'dd\s+if=',

    # Dangerous git operations
    r'git\s+push\s+.*--force',
    r'git\s+reset\s+--hard',
    r'git\s+clean\s+-[fd]',

    # System modifications
    r'chmod\s+777',
    r'chown\s+root',
    r'sudo\s+',

    # Network exfiltration with credentials
    r'curl\s+.*-d\s+.*password',
    r'curl\s+.*-d\s+.*api.key',
    r'wget\s+.*password',

    # Environment manipulation
    r'unset\s+(PATH|HOME|USER)',
    r'export\s+PATH=',

    # Process killing
    r'kill\s+-9\s+1\b',
    r'killall\s+',
]

DANGEROUS_WRITE_PATTERNS = [
    r'/etc/',
    r'/usr/',
    r'\.env$',
    r'\.ssh/',
    r'/\.aws/',
    r'credentials\.json',
]


def check_bash_command(command: str) -> tuple:
    """Check if a bash command is dangerous. Returns (is_safe, reason)."""
    for pattern in DANGEROUS_BASH_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            return False, f"Blocked dangerous command matching pattern: {pattern}"
    return True, ""


def check_write_path(path: str) -> tuple:
    """Check if a file write target is safe."""
    for pattern in DANGEROUS_WRITE_PATTERNS:
        if re.search(pattern, path):
            return False, f"Blocked write to protected path matching: {pattern}"
    return True, ""


def main():
    try:
        hook_input = json.loads(sys.stdin.read())
        tool_name = hook_input.get('tool_name', '')
        tool_input = hook_input.get('tool_input', {})

        if tool_name == 'Bash':
            command = tool_input.get('command', '')
            is_safe, reason = check_bash_command(command)
            if not is_safe:
                print(json.dumps({"error": reason}), file=sys.stderr)
                sys.exit(2)

        elif tool_name == 'Write':
            path = tool_input.get('file_path', '')
            is_safe, reason = check_write_path(path)
            if not is_safe:
                print(json.dumps({"error": reason}), file=sys.stderr)
                sys.exit(2)

        sys.exit(0)

    except Exception as e:
        # Fail open on hook errors — log warning but don't block
        print(json.dumps({"warning": f"Guardrail hook error: {e}"}), file=sys.stderr)
        sys.exit(0)


if __name__ == '__main__':
    main()
