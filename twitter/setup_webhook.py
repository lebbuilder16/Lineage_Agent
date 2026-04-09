"""
One-time setup: register Telegram webhook with secret token validation.
Run: python -m twitter.setup_webhook
"""

import httpx
import sys
from config import TELEGRAM_TOKEN, TELEGRAM_WEBHOOK_SECRET

WEBHOOK_URL = "https://YOUR_DOMAIN/twitter/telegram-webhook"


def setup():
    url = WEBHOOK_URL
    if len(sys.argv) > 1:
        url = sys.argv[1]

    resp = httpx.post(
        f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/setWebhook",
        json={
            "url": url,
            "secret_token": TELEGRAM_WEBHOOK_SECRET,  # Telegram sends this as X-Telegram-Bot-Api-Secret-Token
            "allowed_updates": ["message", "callback_query"],
        }
    )
    print(resp.json())


if __name__ == "__main__":
    setup()
