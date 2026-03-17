#!/usr/bin/env bash
# Solti VR3 — One-command setup
# Usage: ./setup.sh
#
# This script:
# 1. Verifies Python 3 is available
# 2. Creates necessary directories
# 3. Makes bin/ scripts executable
# 4. Initializes the local CRM database
# 5. Prints getting-started instructions

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║        SOLTI VR3 — SETUP             ║"
echo "╚══════════════════════════════════════╝"
echo ""

# 1. Check Python 3
echo "→ Checking Python 3..."
if ! command -v python3 &>/dev/null; then
  echo "✗ Python 3 not found. Please install Python 3.8+ first."
  exit 1
fi
PYTHON_VERSION=$(python3 --version 2>&1)
echo "  ✓ $PYTHON_VERSION"

# 2. Create directories
echo "→ Creating directories..."
mkdir -p memory/logs memory/.markers .tmp data
echo "  ✓ memory/, .tmp/, data/"

# 3. Make bin/ scripts executable
echo "→ Setting permissions..."
chmod +x bin/solti-hub-check bin/solti-cost-check bin/solti-update-check
echo "  ✓ bin/ scripts are executable"

# 4. Initialize local CRM database
echo "→ Initializing local CRM..."
python3 skills/crm/scripts/crm_local.py --action stats >/dev/null 2>&1
echo "  ✓ SQLite database ready at data/contacts.db"

# 5. Verify hooks
echo "→ Verifying hooks..."
for hook in hooks/guardrail_check.py hooks/cost_guard.py hooks/validate_output.py hooks/memory_capture.py; do
  if python3 -c "import py_compile; py_compile.compile('$hook', doraise=True)" 2>/dev/null; then
    echo "  ✓ $hook"
  else
    echo "  ✗ $hook has syntax errors!"
  fi
done

# 6. Check version
echo "→ Version check..."
VERSION=$(cat VERSION 2>/dev/null || echo "unknown")
echo "  ✓ Solti v${VERSION}"

# Done
echo ""
echo "╔══════════════════════════════════════╗"
echo "║        SETUP COMPLETE ✓              ║"
echo "╠══════════════════════════════════════╣"
echo "║                                      ║"
echo "║  Next steps:                         ║"
echo "║  1. Open Claude Code in this folder  ║"
echo "║  2. Say: /onboard                    ║"
echo "║  3. Follow the setup wizard          ║"
echo "║                                      ║"
echo "║  Or if already configured:           ║"
echo "║  • /prospect — Find leads            ║"
echo "║  • /crm — Manage contacts            ║"
echo "║  • /outreach — Send campaigns        ║"
echo "║                                      ║"
echo "╚══════════════════════════════════════╝"
echo ""
