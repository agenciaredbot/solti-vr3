#!/usr/bin/env python3
"""Stop hook: Auto-capture session events to daily log.

Fires after each Claude response. Non-blocking (exit 0 always).
Reads new transcript content since last capture and appends summary
to today's daily log file.

Input (stdin JSON):
  - session_id: Current session identifier
  - transcript_path: Path to conversation transcript
  - cwd: Current working directory
"""

import json
import os
import re
import sys
from datetime import datetime

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEMORY_DIR = os.path.join(PLUGIN_DIR, 'memory')
LOGS_DIR = os.path.join(MEMORY_DIR, 'logs')
MARKERS_DIR = os.path.join(MEMORY_DIR, '.markers')

# Patterns that indicate secrets — strip before logging
SECRET_PATTERNS = [
    r'(api[_-]?key|api[_-]?token|apikey)\s*[=:]\s*\S+',
    r'(password|passwd|secret)\s*[=:]\s*\S+',
    r'Bearer\s+[A-Za-z0-9\-._~+/]+=*',
    r'sk-[a-zA-Z0-9]{20,}',
    r'xkeysib-[a-zA-Z0-9]+',
    r'apify_api_[a-zA-Z0-9]+',
    r'whsec_[a-zA-Z0-9]+',
    r'eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+',
]


def sanitize_text(text: str) -> str:
    """Remove potential secrets from text before logging."""
    for pattern in SECRET_PATTERNS:
        text = re.sub(pattern, '[REDACTED]', text, flags=re.IGNORECASE)
    return text


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
    """Append a sanitized entry to the daily log."""
    now = datetime.now().strftime('%H:%M')
    safe_content = sanitize_text(content)
    with open(path, 'a') as f:
        f.write(f"- {now} [{entry_type}] {safe_content}\n")


def get_last_position(session_id: str) -> int:
    """Get last read position in transcript."""
    marker = os.path.join(MARKERS_DIR, f'{session_id}.marker')
    if os.path.exists(marker):
        try:
            with open(marker, 'r') as f:
                return int(f.read().strip())
        except (ValueError, IOError):
            return 0
    return 0


def save_position(session_id: str, position: int):
    """Save current read position."""
    marker = os.path.join(MARKERS_DIR, f'{session_id}.marker')
    with open(marker, 'w') as f:
        f.write(str(position))


def extract_session_summary(transcript_path: str, last_position: int) -> tuple:
    """Extract new content from transcript since last read."""
    if not transcript_path or not os.path.exists(transcript_path):
        return "", last_position

    try:
        with open(transcript_path, 'r') as f:
            content = f.read()
    except IOError:
        return "", last_position

    new_content = content[last_position:]
    if not new_content.strip():
        return "", last_position

    events = []

    # Detect skill invocations
    skill_patterns = {
        '/prospect': 'Ran /prospect skill',
        '/outreach': 'Ran /outreach skill',
        '/deploy': 'Ran /deploy skill',
        '/publish': 'Ran /publish skill',
        '/crm': 'Ran /crm skill',
        '/onboard': 'Ran /onboard skill',
        '/whatsapp': 'Ran /whatsapp skill',
        '/connect': 'Ran /connect skill',
        '/pipeline': 'Ran /pipeline skill',
        '/strategy': 'Ran /strategy skill',
        '/audit': 'Ran /audit skill',
        '/retro': 'Ran /retro skill',
        '/qa': 'Ran /qa skill',
    }
    for trigger, event in skill_patterns.items():
        if trigger in new_content:
            events.append(event)

    # Detect script executions
    scripts = re.findall(r'python3\s+\S*scripts/(\w+\.py)', new_content)
    for script in set(scripts):
        events.append(f"Executed {script}")

    # Detect errors (max 3)
    errors = re.findall(r'"error":\s*"([^"]{1,100})"', new_content)
    for error in errors[:3]:
        events.append(f"Error: {error}")

    # Detect cost reports
    costs = re.findall(r'[Cc]ost:\s*\$?([\d.]+)', new_content)
    for cost in costs[:2]:
        events.append(f"Cost: ${cost}")

    summary = "; ".join(events) if events else "Session activity (no notable events)"
    return summary, len(content)


def main():
    try:
        hook_input = json.loads(sys.stdin.read())
        session_id = hook_input.get('session_id', 'unknown')
        transcript_path = hook_input.get('transcript_path', '')

        ensure_dirs()

        log_path = get_today_log_path()
        init_daily_log(log_path)

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
