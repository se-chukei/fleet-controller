#!/usr/bin/env bash

# Exit immediately if a command fails
set -e

# ==============================================================================
# CONFIGURATION
# ==============================================================================
ACCOUNT="shinnyo-en_104_demo@tvu.networks.com"
# Plaintext password for shinnyo-en_104_demo@tvu.networks.com
PLAINTEXT_PASSWORD="shinnyo-en_104_demo123"
SOURCE_OBJECT_ID="1531668548454322176"
FUNNEL_URL="https://fvflv29g1wfy.tail80c2fc.ts.net/api/webhook/tvu"

# ==============================================================================
# 1. GENERATE UPPERCASE SHA-512 HASH
# ==============================================================================
echo "==> Generating uppercase SHA-512 password hash..."
PASS_HASH=$(printf '%s' "$PLAINTEXT_PASSWORD" | shasum -a 512 | awk '{print toupper($1)}')
echo "PASS_HASH=$PASS_HASH"

# ==============================================================================
# 2. LOGIN (GET SID)
# ==============================================================================
echo "==> Logging in to TVU Command Center..."
LOGIN_RESPONSE=$(curl -sS -X POST "https://cc-ms.tvunetworks.com/login-service/login/signIn" \
  -H "Content-Type: application/json" \
  --data "{\"account\":\"$ACCOUNT\",\"password\":\"$PASS_HASH\",\"serverName\":\"Command Center\"}")

echo "[DEBUG] Raw login response:"
echo "$LOGIN_RESPONSE"
echo "[DEBUG] End raw login response"

SID=$(printf '%s' "$LOGIN_RESPONSE" | node -e '
  const fs = require("fs");
  const input = fs.readFileSync(0, "utf8");
  try {
    const parsed = JSON.parse(input);
    if (parsed && parsed.errorCode === "0x0" && parsed.result && parsed.result.session) {
      console.log(parsed.result.session);
    } else {
      console.error("No session found in login response");
      process.exit(1);
    }
  } catch (err) {
    console.error("Failed to parse JSON login response");
    console.error(String(err));
    process.exit(1);
  }
')

if [ -z "$SID" ]; then
  echo "[-] Login failed! Response was:"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

echo "[+] Successfully logged in. SID: $SID"
echo "[+] Using SID for webhook registration: $SID"

# ==============================================================================
# 3. FORCE RE-REGISTER WEBHOOK
# ==============================================================================
echo "==> Overwriting existing Webhook registration with Funnel URL..."
REGISTER_RESPONSE=$(curl -sS -X POST "https://mma.tvunetworks.com/api/metadataproto/MetadataUploader.RegisterWebhook" \
  -H "Content-Type: application/json" \
  -H "SID: $SID" \
  --data "{\"webhookURL\":\"$FUNNEL_URL\",\"operation\":\"register\",\"sourceObject\":[\"$SOURCE_OBJECT_ID\"]}")

echo "[+] Response from TVU Registration:"
echo "$REGISTER_RESPONSE"
echo ""
echo "==> Done. Your Funnel URL is now the active webhook receiver."