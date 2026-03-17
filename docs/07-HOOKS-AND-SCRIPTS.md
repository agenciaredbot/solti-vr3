# SOLTI VR3 — Hooks & Scripts Reference

> Version: 1.0.0 | Last updated: 2026-03-15

---

## Hook System Overview

Hooks are Python scripts that fire automatically during Claude Code's lifecycle. They provide safety guardrails, cost control, and automatic memory management without requiring AI reasoning.

### Hook Types

| Hook | When it fires | Exit codes | Purpose |
|------|--------------|------------|---------|
| **PreToolUse** | Before any tool execution | 0=allow, 2=BLOCK (unbypassable) | Safety + cost guard |
| **PostToolUse** | After tool returns output | 0=valid, 1=warning | Output validation |
| **Stop** | After Claude generates response | 0 always (non-blocking) | Memory capture |

### Configuration

In `plugin.json`:
```json
{
  "hooks": {
    "PreToolUse": [
      "hooks/guardrail_check.py",
      "hooks/cost_guard.py"
    ],
    "PostToolUse": [
      "hooks/validate_output.py"
    ],
    "Stop": [
      "hooks/memory_capture.py"
    ]
  }
}
```

---

## Hook 1: guardrail_check.py (PreToolUse)

### Purpose
Block dangerous commands before they execute. Exit code 2 cannot be overridden by Claude.

### Input (stdin JSON)
```json
{
  "tool_name": "Bash",
  "tool_input": {
    "command": "rm -rf /important/directory"
  }
}
```

### Blocked Patterns

```python
DANGEROUS_PATTERNS = [
    # Destructive file operations
    r'rm\s+(-[rf]+\s+)*/',           # rm -rf /
    r'rm\s+(-[rf]+\s+)*~',           # rm -rf ~
    r'rm\s+(-[rf]+\s+)*\.',          # rm -rf .
    r'>\s*/dev/sd',                    # Write to disk device

    # Dangerous git operations
    r'git\s+push\s+.*--force',        # Force push
    r'git\s+reset\s+--hard',          # Hard reset
    r'git\s+clean\s+-[fd]',           # Clean untracked

    # System modifications
    r'chmod\s+777',                    # World-writable
    r'chown\s+root',                   # Change ownership to root
    r'sudo\s+',                        # Any sudo command

    # Network exfiltration
    r'curl\s+.*-d\s+.*password',      # POST with password
    r'wget\s+.*password',             # Download with creds in URL

    # Environment manipulation
    r'unset\s+(PATH|HOME|USER)',      # Unset critical vars
    r'export\s+PATH=',               # Override PATH
]

DANGEROUS_TOOL_INPUTS = {
    'Write': [
        r'/etc/',                      # System config files
        r'/usr/',                      # System binaries
        r'\.env$',                     # Environment files (use .env.local)
        r'\.ssh/',                     # SSH keys
    ]
}
```

### Implementation Skeleton

```python
#!/usr/bin/env python3
"""PreToolUse hook: Block dangerous commands."""

import json
import re
import sys

DANGEROUS_PATTERNS = [
    # ... patterns above ...
]

def check_bash_command(command: str) -> tuple[bool, str]:
    """Check if a bash command is dangerous. Returns (is_safe, reason)."""
    for pattern in DANGEROUS_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            return False, f"Blocked: matches dangerous pattern '{pattern}'"
    return True, ""

def check_write_path(path: str) -> tuple[bool, str]:
    """Check if a file write target is safe."""
    for pattern in DANGEROUS_TOOL_INPUTS.get('Write', []):
        if re.search(pattern, path):
            return False, f"Blocked: writing to protected path matching '{pattern}'"
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
                sys.exit(2)  # EXIT 2 = UNBYPASSABLE BLOCK

        elif tool_name == 'Write':
            path = tool_input.get('file_path', '')
            is_safe, reason = check_write_path(path)
            if not is_safe:
                print(json.dumps({"error": reason}), file=sys.stderr)
                sys.exit(2)

        sys.exit(0)  # Allow

    except Exception as e:
        # On hook error, allow (fail open, log error)
        print(json.dumps({"warning": f"Guardrail hook error: {e}"}), file=sys.stderr)
        sys.exit(0)

if __name__ == '__main__':
    main()
```

---

## Hook 2: cost_guard.py (PreToolUse)

### Purpose
Require user confirmation before executing actions that cost money (>$1 per action).

### How it works
1. Intercepts Bash calls to scripts that make API calls
2. Parses estimated cost from script arguments
3. If cost > threshold → Exit 2 (block) with explanation
4. User confirms in chat → Claude reruns with `--confirmed` flag

### Implementation Skeleton

```python
#!/usr/bin/env python3
"""PreToolUse hook: Require confirmation for expensive operations."""

import json
import re
import sys

COST_THRESHOLD = 1.00  # USD - require confirmation above this

# Scripts that have cost implications
COST_SCRIPTS = {
    'scrape_apify.py': lambda args: estimate_apify_cost(args),
    'scrape_phantom.py': lambda args: estimate_phantom_cost(args),
    'send_email_campaign.py': lambda args: estimate_email_cost(args),
    'send_instagram_dm.py': lambda args: estimate_dm_cost(args),
    'send_linkedin_dm.py': lambda args: estimate_linkedin_cost(args),
}

def estimate_apify_cost(args: str) -> float:
    """Estimate Apify actor run cost from CLI args."""
    max_results = 100  # default
    match = re.search(r'--max[_-]results?\s+(\d+)', args)
    if match:
        max_results = int(match.group(1))
    return max_results * 0.005  # ~$0.005 per result

def estimate_email_cost(args: str) -> float:
    """Estimate email campaign cost."""
    recipients = 100
    match = re.search(r'--recipients?\s+(\d+)', args)
    if match:
        recipients = int(match.group(1))
    return recipients * 0.0004  # ~$0.0004 per email (Brevo)

def estimate_dm_cost(args: str) -> float:
    """Estimate DM campaign cost."""
    recipients = 50
    match = re.search(r'--recipients?\s+(\d+)', args)
    if match:
        recipients = int(match.group(1))
    return recipients * 0.016  # ~$0.016 per DM

def main():
    try:
        hook_input = json.loads(sys.stdin.read())
        tool_name = hook_input.get('tool_name', '')
        tool_input = hook_input.get('tool_input', {})

        if tool_name != 'Bash':
            sys.exit(0)

        command = tool_input.get('command', '')

        # Check if it's a cost-bearing script
        for script, estimator in COST_SCRIPTS.items():
            if script in command:
                # Skip if already confirmed
                if '--confirmed' in command:
                    sys.exit(0)

                estimated_cost = estimator(command)
                if estimated_cost > COST_THRESHOLD:
                    print(json.dumps({
                        "error": (
                            f"Cost guard: This action costs ~${estimated_cost:.2f}. "
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
```

---

## Hook 3: validate_output.py (PostToolUse)

### Purpose
Validate that Python scripts return valid JSON with expected structure.

### Implementation Skeleton

```python
#!/usr/bin/env python3
"""PostToolUse hook: Validate script output is valid JSON."""

import json
import sys

def main():
    try:
        hook_input = json.loads(sys.stdin.read())
        tool_name = hook_input.get('tool_name', '')
        tool_output = hook_input.get('tool_output', '')

        # Only validate Bash calls to our scripts
        tool_input = hook_input.get('tool_input', {})
        command = tool_input.get('command', '') if isinstance(tool_input, dict) else ''

        if tool_name != 'Bash' or 'scripts/' not in command:
            sys.exit(0)

        # Try to parse output as JSON
        if tool_output.strip():
            try:
                parsed = json.loads(tool_output)

                # Check for success field
                if isinstance(parsed, dict) and 'success' in parsed:
                    if not parsed['success']:
                        print(json.dumps({
                            "warning": f"Script returned error: {parsed.get('error', 'unknown')}"
                        }), file=sys.stderr)

            except json.JSONDecodeError:
                print(json.dumps({
                    "warning": "Script output is not valid JSON"
                }), file=sys.stderr)

        sys.exit(0)

    except Exception:
        sys.exit(0)

if __name__ == '__main__':
    main()
```

---

## Hook 4: memory_capture.py (Stop)

### Purpose
Automatically capture session learnings after each Claude response. Non-blocking (runs async).

### Implementation Skeleton

```python
#!/usr/bin/env python3
"""Stop hook: Auto-capture session events to daily log."""

import json
import os
import sys
from datetime import datetime

MEMORY_DIR = os.path.join(os.getcwd(), 'memory')
LOGS_DIR = os.path.join(MEMORY_DIR, 'logs')
MARKERS_DIR = os.path.join(MEMORY_DIR, '.markers')

def ensure_dirs():
    """Create memory directories if they don't exist."""
    os.makedirs(LOGS_DIR, exist_ok=True)
    os.makedirs(MARKERS_DIR, exist_ok=True)

def get_today_log_path() -> str:
    """Get path to today's daily log."""
    today = datetime.now().strftime('%Y-%m-%d')
    return os.path.join(LOGS_DIR, f'{today}.md')

def init_daily_log(path: str):
    """Create daily log if it doesn't exist."""
    if not os.path.exists(path):
        today = datetime.now()
        header = f"# Daily Log: {today.strftime('%Y-%m-%d')}\n\n"
        header += f"> Session log for {today.strftime('%A, %B %d, %Y')}\n\n---\n\n"
        header += "## Events & Notes\n\n"
        with open(path, 'w') as f:
            f.write(header)

def append_to_log(path: str, entry_type: str, content: str):
    """Append an entry to the daily log."""
    now = datetime.now().strftime('%H:%M')
    with open(path, 'a') as f:
        f.write(f"- {now} [{entry_type}] {content}\n")

def get_marker_path(session_id: str) -> str:
    """Get marker file path for tracking transcript position."""
    return os.path.join(MARKERS_DIR, f'{session_id}.marker')

def get_last_position(session_id: str) -> int:
    """Get last read position in transcript."""
    marker = get_marker_path(session_id)
    if os.path.exists(marker):
        with open(marker, 'r') as f:
            return int(f.read().strip())
    return 0

def save_position(session_id: str, position: int):
    """Save current read position."""
    marker = get_marker_path(session_id)
    with open(marker, 'w') as f:
        f.write(str(position))

def extract_session_summary(transcript_path: str, last_position: int) -> tuple[str, int]:
    """Extract new content from transcript since last read."""
    if not transcript_path or not os.path.exists(transcript_path):
        return "", last_position

    with open(transcript_path, 'r') as f:
        content = f.read()

    new_content = content[last_position:]
    if not new_content.strip():
        return "", last_position

    # Simple extraction: look for key events
    events = []

    # Look for skill invocations
    if '/prospect' in new_content:
        events.append("Ran /prospect skill")
    if '/outreach' in new_content:
        events.append("Ran /outreach skill")
    if '/deploy' in new_content:
        events.append("Ran /deploy skill")

    # Look for script executions
    import re
    scripts = re.findall(r'python3\s+scripts/(\w+\.py)', new_content)
    for script in set(scripts):
        events.append(f"Executed {script}")

    # Look for errors
    errors = re.findall(r'"error":\s*"([^"]+)"', new_content)
    for error in errors[:3]:  # Max 3 errors
        events.append(f"Error: {error[:100]}")

    summary = "; ".join(events) if events else "Session activity (no notable events)"
    return summary, len(content)

def main():
    try:
        hook_input = json.loads(sys.stdin.read())
        session_id = hook_input.get('session_id', 'unknown')
        transcript_path = hook_input.get('transcript_path', '')

        ensure_dirs()

        # Get daily log
        log_path = get_today_log_path()
        init_daily_log(log_path)

        # Extract new session content
        last_pos = get_last_position(session_id)
        summary, new_pos = extract_session_summary(transcript_path, last_pos)

        if summary and new_pos > last_pos:
            append_to_log(log_path, 'session', summary)
            save_position(session_id, new_pos)

    except Exception:
        pass  # Never block on memory errors

    sys.exit(0)

if __name__ == '__main__':
    main()
```

---

## Script Design Patterns

### Pattern: One Job Per Script

Every script does exactly one thing. Decompose complex pipelines into multiple scripts.

```
BAD:  scrape_and_enrich_and_import.py  (too many responsibilities)
GOOD: scrape_apify.py → enrich_lead.py → import_to_crm.py (pipeline)
```

### Pattern: JSON I/O

All scripts accept CLI args and output JSON to stdout. Errors go to stderr.

```python
#!/usr/bin/env python3
"""Template for Solti VR3 scripts."""

import argparse
import json
import sys

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, help='Input file path or value')
    parser.add_argument('--output', help='Output file path (default: stdout)')
    parser.add_argument('--confirmed', action='store_true', help='Skip cost confirmation')
    args = parser.parse_args()

    try:
        # Read input
        if args.input.endswith('.json'):
            with open(args.input) as f:
                data = json.load(f)
        else:
            data = args.input

        # Process
        result = {"success": True, "data": process(data), "metadata": {}}

        # Output
        output = json.dumps(result, indent=2, ensure_ascii=False)
        if args.output:
            with open(args.output, 'w') as f:
                f.write(output)
            print(json.dumps({"success": True, "output_file": args.output}))
        else:
            print(output)

    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__,
            "suggestion": "Check input format and try again."  # AI-friendly error
        }
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)

def process(data):
    """Replace with actual logic."""
    return data

if __name__ == '__main__':
    main()
```

### Pattern: Error Messages for AI

Every error includes a suggestion for what the AI should do next:

```python
# BAD
raise Exception("Connection refused")

# GOOD
raise Exception(
    "Apify API returned 401 Unauthorized. "
    "The API key may be invalid or expired. "
    "Ask the user to check their Apify API key at https://console.apify.com/settings"
)
```

### Pattern: Parallel Execution

For batch operations, use ThreadPoolExecutor:

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

def batch_process(items, max_workers=5):
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_one, item): item for item in items}
        for future in as_completed(futures):
            item = futures[future]
            try:
                result = future.result(timeout=30)
                results.append({"item": item, "success": True, "data": result})
            except Exception as e:
                results.append({"item": item, "success": False, "error": str(e)})
    return results
```

---

## bin/ CLI Utilities

### bin/solti-hub-check

```bash
#!/usr/bin/env bash
# Check if Service Hub is online and responsive

HUB_URL="${SOLTI_HUB_URL:-http://localhost:4000}"
API_KEY="${SOLTI_API_KEY:-}"

response=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  "$HUB_URL/health" 2>/dev/null)

if [ "$response" = "200" ]; then
  echo "Hub: ONLINE ($HUB_URL)"
  exit 0
elif [ "$response" = "000" ]; then
  echo "Hub: OFFLINE - Cannot connect to $HUB_URL. Start with: docker compose up -d"
  exit 1
elif [ "$response" = "401" ]; then
  echo "Hub: AUTH ERROR - API key invalid. Update SOLTI_API_KEY in preferences."
  exit 1
else
  echo "Hub: ERROR ($response) - Unexpected response from $HUB_URL"
  exit 1
fi
```

### bin/solti-cost-check

```bash
#!/usr/bin/env bash
# Show today's accumulated spend

HUB_URL="${SOLTI_HUB_URL:-http://localhost:4000}"
API_KEY="${SOLTI_API_KEY:-}"

if [ -z "$API_KEY" ]; then
  echo "Cost: UNKNOWN - No API key configured"
  exit 0
fi

result=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$HUB_URL/api/analytics/today-cost" 2>/dev/null)

if [ $? -eq 0 ] && [ -n "$result" ]; then
  echo "$result" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"Today's spend: \${data.get('total_cost', 0):.2f} ({data.get('credits_used', 0)} credits)\")
print(f\"Credits remaining: {data.get('credits_remaining', '?')}\")
" 2>/dev/null || echo "Cost: Unable to parse response"
else
  echo "Cost: Unable to reach Hub"
fi
```

### bin/solti-update-check

```bash
#!/usr/bin/env bash
# Check for plugin updates (24h cache)

CACHE_DIR="${HOME}/.solti"
CACHE_FILE="${CACHE_DIR}/update-check-cache"
VERSION_FILE="$(dirname "$0")/../VERSION"
REPO_URL="https://raw.githubusercontent.com/yourorg/solti-vr3/main/plugin/VERSION"

mkdir -p "$CACHE_DIR"

# Check cache freshness (24 hours)
if [ -f "$CACHE_FILE" ]; then
  cache_age=$(($(date +%s) - $(stat -f %m "$CACHE_FILE" 2>/dev/null || stat -c %Y "$CACHE_FILE" 2>/dev/null)))
  if [ "$cache_age" -lt 86400 ]; then
    cat "$CACHE_FILE"
    exit 0
  fi
fi

# Read local version
LOCAL_VERSION=$(cat "$VERSION_FILE" 2>/dev/null || echo "0.0.0")

# Fetch remote version
REMOTE_VERSION=$(curl -s --max-time 3 "$REPO_URL" 2>/dev/null)

if [ -z "$REMOTE_VERSION" ]; then
  echo "Version: $LOCAL_VERSION (update check failed)" | tee "$CACHE_FILE"
  exit 0
fi

if [ "$LOCAL_VERSION" = "$REMOTE_VERSION" ]; then
  echo "Version: $LOCAL_VERSION (up to date)" | tee "$CACHE_FILE"
else
  echo "Version: $LOCAL_VERSION → $REMOTE_VERSION available. Run /upgrade to update." | tee "$CACHE_FILE"
fi
```
