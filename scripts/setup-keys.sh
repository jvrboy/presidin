#!/usr/bin/env bash
# PRESIDIN — AI provider key setup helper
# Usage: bash scripts/setup-keys.sh
#
# Prompts for each provider's API key and writes to .env
# Existing values are preserved (just press Enter to skip).

set -e

ENV_FILE="/home/z/my-project/.env"
BACKUP="$ENV_FILE.bak.$(date +%s)"
cp "$ENV_FILE" "$BACKUP"
echo "✓ Backed up .env to $BACKUP"

update_env() {
  local key="$1"
  local value="$2"
  if grep -q "^$key=" "$ENV_FILE"; then
    sed -i "s|^$key=.*|$key=$value|" "$ENV_FILE"
  else
    echo "$key=$value" >> "$ENV_FILE"
  fi
}

prompt_key() {
  local key="$1"
  local label="$2"
  local docs="$3"
  local current=$(grep "^$key=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)
  if [ -n "$current" ]; then
    read -p "$label [current: ${current:0:8}...${current: -4}] (Enter to keep): " value
    [ -z "$value" ] && value="$current"
  else
    read -p "$label ($docs): " value
  fi
  update_env "$key" "$value"
}

echo ""
echo "=== AI Providers ==="
echo "Press Enter to skip any provider you don't have a key for."
echo ""

prompt_key "OPENAI_API_KEY" "OpenAI API key" "https://platform.openai.com/api-keys"
prompt_key "ANTHROPIC_API_KEY" "Anthropic API key" "https://console.anthropic.com/settings/keys"
prompt_key "GEMINI_API_KEY" "Google Gemini API key" "https://aistudio.google.com/apikey"
prompt_key "GROQ_API_KEY" "Groq API key" "https://console.groq.com/keys"
prompt_key "OPENROUTER_API_KEY" "OpenRouter API key" "https://openrouter.ai/keys"
prompt_key "MISTRAL_API_KEY" "Mistral API key" "https://console.mistral.ai/api-keys"
prompt_key "COHERE_API_KEY" "Cohere API key" "https://dashboard.cohere.com/api-keys"
prompt_key "TOGETHER_API_KEY" "Together AI API key" "https://api.together.xyz/settings/api-keys"
prompt_key "FIREWORKS_API_KEY" "Fireworks AI API key" "https://fireworks.ai/account/api-keys"
prompt_key "REPLICATE_API_KEY" "Replicate API key" "https://replicate.com/account/api-tokens"
prompt_key "PERPLEXITY_API_KEY" "Perplexity API key" "https://www.perplexity.ai/settings/api"
prompt_key "DEEPSEEK_API_KEY" "DeepSeek API key" "https://platform.deepseek.com/api_keys"
prompt_key "XAI_API_KEY" "xAI (Grok) API key" "https://console.x.ai"
prompt_key "HUGGINGFACE_API_KEY" "HuggingFace API key" "https://huggingface.co/settings/tokens"

echo ""
echo "=== Custom Endpoints (optional) ==="
prompt_key "CUSTOM_OPENAI_ENDPOINT" "Custom OpenAI-compatible endpoint URL" "http://localhost:1234/v1"
prompt_key "CUSTOM_OPENAI_API_KEY" "Custom OpenAI API key (blank for local)" ""
prompt_key "CUSTOM_OPENAI_MODEL" "Custom OpenAI model name" "llama-3.1-70b-instruct"
prompt_key "CUSTOM_ANTHROPIC_ENDPOINT" "Custom Anthropic-compatible endpoint URL" ""
prompt_key "CUSTOM_ANTHROPIC_API_KEY" "Custom Anthropic API key" ""
prompt_key "CUSTOM_ANTHROPIC_MODEL" "Custom Anthropic model name" "claude-3-5-sonnet"

echo ""
echo "=== Market Data (optional) ==="
prompt_key "DERIV_API_TOKEN" "Deriv API token (for live trading)" "https://app.deriv.com/account/api-token"
prompt_key "OANDA_API_KEY" "OANDA API key" ""
prompt_key "FINNHUB_API_KEY" "Finnhub API key" "https://finnhub.io/dashboard"
prompt_key "TWELVEDATA_API_KEY" "Twelve Data API key" "https://twelvedata.com/account/api-keys"
prompt_key "ALPHAVANTAGE_API_KEY" "Alpha Vantage API key" "https://www.alphavantage.co/support/#api-key"
prompt_key "POLYGON_API_KEY" "Polygon API key" "https://polygon.io/dashboard/api-keys"

echo ""
echo "=== Notifications (optional) ==="
prompt_key "TELEGRAM_BOT_TOKEN" "Telegram bot token" "https://t.me/BotFather"
read -p "Telegram chat ID: " tg_chat
[ -n "$tg_chat" ] && update_env "TELEGRAM_CHAT_ID" "$tg_chat"
prompt_key "DISCORD_WEBHOOK_URL" "Discord webhook URL" "https://discord.com/channels/.../integrations"

echo ""
echo "=== NextAuth (optional — for user accounts) ==="
echo "Generate AUTH_SECRET: openssl rand -base64 32"
prompt_key "AUTH_GITHUB_ID" "GitHub OAuth client ID" "https://github.com/settings/developers"
prompt_key "AUTH_GITHUB_SECRET" "GitHub OAuth client secret" ""
prompt_key "AUTH_GOOGLE_ID" "Google OAuth client ID" "https://console.cloud.google.com/apis/credentials"
prompt_key "AUTH_GOOGLE_SECRET" "Google OAuth client secret" ""

echo ""
echo "✓ .env updated. Restart the dev server to apply:"
echo "  bun run dev"
echo ""
echo "Backup at: $BACKUP"
