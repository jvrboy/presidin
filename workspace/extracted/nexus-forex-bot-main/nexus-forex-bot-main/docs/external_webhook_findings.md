# Verified webhook capabilities

## Telegram Bot API
Source: https://core.telegram.org/bots/api

The official Bot API documents outgoing webhooks through `setWebhook`, which sends HTTPS POST requests containing JSON updates. It supports a `secret_token`; Telegram includes it in the `X-Telegram-Bot-Api-Secret-Token` header. The same API documents bot message delivery through `sendMessage`.

## Discord Webhook API
Source: https://docs.discord.com/developers/resources/webhook

The official Discord documentation documents `POST /webhooks/{webhook.id}/{webhook.token}` for executing incoming webhooks. A request must include at least one of `content`, `embeds`, `components`, `file`, or `poll`; content is limited to 2000 characters and embeds are supported. Incoming webhooks are tied to a channel and do not require a bot user for delivery.
