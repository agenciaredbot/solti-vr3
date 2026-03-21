#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Test WhatsApp Campaign — End-to-end test script
#
# Tests the full flow: Hub API → BullMQ → Evolution API → WhatsApp delivery
#
# Prerequisites:
#   1. Hub must be running on Railway (or locally on port 4000)
#   2. At least one WhatsApp instance must be CONNECTED
#   3. Evolution API must be reachable
#
# Usage:
#   chmod +x scripts/test-whatsapp-campaign.sh
#   ./scripts/test-whatsapp-campaign.sh
#
# Environment overrides:
#   HUB_URL=http://localhost:4000 ./scripts/test-whatsapp-campaign.sh
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Config ──
HUB_URL="${HUB_URL:-https://solti-vr3-production.up.railway.app}"
API_KEY="${API_KEY:-sk_solti_d8b50141c2be30446f32abaa664da6caeda75dc71b602b50}"
TENANT_ID="ece67bfc-9fcd-45fb-b7cc-853c854626bf"
TEST_PHONE="+573042651486"
TEST_PHONE_CLEAN="573042651486"

echo "═══════════════════════════════════════════════════"
echo "  Solti VR3 — WhatsApp Campaign Test"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Hub URL:    $HUB_URL"
echo "Tenant:     $TENANT_ID"
echo "Test phone: $TEST_PHONE"
echo ""

# ── Step 0: Health check ──
echo "▸ Step 0: Checking Hub health..."
HEALTH=$(curl -s -w "\n%{http_code}" "$HUB_URL/health" 2>&1)
HTTP_CODE=$(echo "$HEALTH" | tail -1)

if [ "$HTTP_CODE" != "200" ]; then
  echo "  ✗ Hub is not reachable (HTTP $HTTP_CODE)"
  echo "  → Make sure Railway is running or set HUB_URL=http://localhost:4000"
  exit 1
fi
echo "  ✓ Hub is healthy"
echo ""

# ── Step 1: Check connected WhatsApp instances ──
echo "▸ Step 1: Checking connected WhatsApp instances..."
INSTANCES=$(curl -s -H "x-api-key: $API_KEY" "$HUB_URL/api/v1/whatsapp/instances")
CONNECTED=$(echo "$INSTANCES" | jq '[.data[] | select(.status == "CONNECTED")] | length' 2>/dev/null || echo "0")

if [ "$CONNECTED" = "0" ]; then
  echo "  ✗ No connected WhatsApp instances found"
  echo "  → Connect an instance via the Dashboard first"
  echo ""
  echo "  All instances:"
  echo "$INSTANCES" | jq '.data[] | {id, instanceName, status, phoneNumber}' 2>/dev/null || echo "$INSTANCES"
  exit 1
fi

echo "  ✓ $CONNECTED connected instance(s):"
echo "$INSTANCES" | jq -r '.data[] | select(.status == "CONNECTED") | "    • \(.instanceName) (\(.phoneNumber // "no phone"))"' 2>/dev/null
INSTANCE_IDS=$(echo "$INSTANCES" | jq -r '[.data[] | select(.status == "CONNECTED") | .id] | join(",")' 2>/dev/null)
FIRST_INSTANCE_ID=$(echo "$INSTANCES" | jq -r '.data[] | select(.status == "CONNECTED") | .id' 2>/dev/null | head -1)
echo ""

# ── Step 2: Create or find a test contact ──
echo "▸ Step 2: Creating test contact ($TEST_PHONE_CLEAN)..."
CONTACT=$(curl -s -X POST -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  "$HUB_URL/api/v1/contacts" \
  -d "{
    \"firstName\": \"Test\",
    \"lastName\": \"Campaign\",
    \"phone\": \"$TEST_PHONE_CLEAN\",
    \"whatsapp\": \"$TEST_PHONE_CLEAN\",
    \"source\": \"manual\"
  }")
CONTACT_ID=$(echo "$CONTACT" | jq -r '.data.id // .id // empty' 2>/dev/null)

if [ -z "$CONTACT_ID" ]; then
  echo "  → Contact may already exist, searching..."
  SEARCH=$(curl -s -H "x-api-key: $API_KEY" "$HUB_URL/api/v1/contacts?search=$TEST_PHONE_CLEAN")
  CONTACT_ID=$(echo "$SEARCH" | jq -r '.data[0].id // empty' 2>/dev/null)
fi

if [ -z "$CONTACT_ID" ]; then
  echo "  ✗ Could not create or find contact"
  echo "  Response: $CONTACT"
  exit 1
fi
echo "  ✓ Contact ID: $CONTACT_ID"
echo ""

# ── Step 3: Create a test list with the contact ──
echo "▸ Step 3: Creating test list..."
LIST=$(curl -s -X POST -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  "$HUB_URL/api/v1/lists" \
  -d "{
    \"name\": \"test-wa-campaign-$(date +%s)\",
    \"description\": \"Temporary test list for WhatsApp campaign\"
  }")
LIST_ID=$(echo "$LIST" | jq -r '.data.id // .id // empty' 2>/dev/null)

if [ -z "$LIST_ID" ]; then
  echo "  ✗ Could not create list"
  echo "  Response: $LIST"
  exit 1
fi
echo "  ✓ List ID: $LIST_ID"

# Add contact to list
echo "  Adding contact to list..."
ADD_RESULT=$(curl -s -X POST -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  "$HUB_URL/api/v1/lists/$LIST_ID/contacts" \
  -d "{\"contactIds\": [\"$CONTACT_ID\"]}")
echo "  ✓ Contact added to list"
echo ""

# ── Step 4: Create WhatsApp campaign ──
echo "▸ Step 4: Creating WhatsApp campaign..."
CAMPAIGN=$(curl -s -X POST -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  "$HUB_URL/api/v1/campaigns" \
  -d "{
    \"name\": \"Test WA Campaign $(date '+%Y-%m-%d %H:%M')\",
    \"type\": \"whatsapp\",
    \"listId\": \"$LIST_ID\"
  }")
CAMPAIGN_ID=$(echo "$CAMPAIGN" | jq -r '.data.id // .id // empty' 2>/dev/null)

if [ -z "$CAMPAIGN_ID" ]; then
  echo "  ✗ Could not create campaign"
  echo "  Response: $CAMPAIGN"
  exit 1
fi
echo "  ✓ Campaign ID: $CAMPAIGN_ID"
echo ""

# ── Step 5: Add message step ──
echo "▸ Step 5: Adding WhatsApp message step..."
STEP=$(curl -s -X POST -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  "$HUB_URL/api/v1/campaigns/$CAMPAIGN_ID/steps" \
  -d '{
    "stepNumber": 1,
    "delayDays": 0,
    "type": "initial",
    "channel": "whatsapp",
    "body": "Hola {{firstName}}, este es un mensaje de prueba de la campaña Solti VR3. Puedes ignorar este mensaje. 🧪",
    "condition": "always"
  }')
STEP_ID=$(echo "$STEP" | jq -r '.data.id // .id // empty' 2>/dev/null)

if [ -z "$STEP_ID" ]; then
  echo "  ✗ Could not create step"
  echo "  Response: $STEP"
  exit 1
fi
echo "  ✓ Step ID: $STEP_ID"
echo ""

# ── Step 6: Launch campaign ──
echo "▸ Step 6: Launching WhatsApp campaign..."
echo "  Instance IDs: $FIRST_INSTANCE_ID"
LAUNCH=$(curl -s -X POST -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  "$HUB_URL/api/v1/campaigns/$CAMPAIGN_ID/launch-whatsapp" \
  -d "{
    \"instanceIds\": [\"$FIRST_INSTANCE_ID\"],
    \"delaySeconds\": 3,
    \"maxPerHourPerInstance\": 60,
    \"maxPerDayPerInstance\": 500,
    \"sendingWindowStart\": 0,
    \"sendingWindowEnd\": 24,
    \"maxConsecutiveFailures\": 3,
    \"timezone\": \"America/Bogota\"
  }")

echo "  Launch response:"
echo "$LAUNCH" | jq '.' 2>/dev/null || echo "$LAUNCH"
echo ""

LAUNCH_SUCCESS=$(echo "$LAUNCH" | jq -r '.success // false' 2>/dev/null)

if [ "$LAUNCH_SUCCESS" != "true" ]; then
  echo "  ✗ Campaign launch failed"
  echo ""
  echo "  Attempting fallback: regular launch endpoint..."
  LAUNCH_FALLBACK=$(curl -s -X POST -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
    "$HUB_URL/api/v1/campaigns/$CAMPAIGN_ID/launch")
  echo "  Fallback response:"
  echo "$LAUNCH_FALLBACK" | jq '.' 2>/dev/null || echo "$LAUNCH_FALLBACK"
else
  echo "  ✓ Campaign launched successfully!"
fi
echo ""

# ── Step 7: Monitor ──
echo "▸ Step 7: Waiting 15 seconds for processing..."
sleep 15

echo "  Checking campaign status..."
STATUS=$(curl -s -H "x-api-key: $API_KEY" "$HUB_URL/api/v1/campaigns/$CAMPAIGN_ID")
echo "$STATUS" | jq '{status: .data.status, stats: .data.stats}' 2>/dev/null || echo "$STATUS"
echo ""

echo "  Checking recipient status..."
RECIPIENTS=$(curl -s -H "x-api-key: $API_KEY" "$HUB_URL/api/v1/campaigns/$CAMPAIGN_ID/recipients")
echo "$RECIPIENTS" | jq '.data[] | {phone, status, failReason, instanceUsed}' 2>/dev/null || echo "$RECIPIENTS"
echo ""

# ── Summary ──
echo "═══════════════════════════════════════════════════"
echo "  Test complete!"
echo ""
echo "  Campaign:   $CAMPAIGN_ID"
echo "  List:       $LIST_ID"
echo "  Contact:    $CONTACT_ID"
echo ""
echo "  Check the message on WhatsApp ($TEST_PHONE)"
echo "  Monitor:    $HUB_URL/api/v1/campaigns/$CAMPAIGN_ID"
echo "═══════════════════════════════════════════════════"
