"""Outbound notification helpers: SMS (Africa's Talking) + email (Resend).

Used by broadcast_advisory.py. Both senders degrade to a dry run when their
credentials are missing (or BROADCAST_DRY_RUN=true), returning status
'dry_run' instead of failing — so the demo/dev environment works end-to-end
without live keys and every would-be message still lands in delivery_logs.

Each sender returns (status, error_message):
    status  'sent' | 'failed' | 'dry_run'
"""

import os

import requests
from dotenv import load_dotenv

load_dotenv()

AT_API_KEY = os.getenv("AT_API_KEY")
AT_USERNAME = os.getenv("AT_USERNAME")
AT_SENDER_ID = os.getenv("AT_SENDER_ID")  # optional alphanumeric sender / shortcode

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
EMAIL_FROM = os.getenv("EMAIL_FROM", "MawinguOps <onboarding@resend.dev>")

# Force dry-run regardless of credentials (useful for demos/tests).
DRY_RUN = os.getenv("BROADCAST_DRY_RUN", "").lower() in ("1", "true", "yes")


def _at_endpoint():
    """Africa's Talking sandbox and production use different hosts."""
    if AT_USERNAME == "sandbox":
        return "https://api.sandbox.africastalking.com/version1/messaging"
    return "https://api.africastalking.com/version1/messaging"


def send_sms(to, message):
    """Send one SMS via the Africa's Talking REST API (same account as USSD)."""
    if DRY_RUN or not AT_API_KEY or not AT_USERNAME:
        return "dry_run", None
    payload = {"username": AT_USERNAME, "to": to, "message": message}
    if AT_SENDER_ID:
        payload["from"] = AT_SENDER_ID
    try:
        resp = requests.post(
            _at_endpoint(),
            data=payload,
            headers={"apiKey": AT_API_KEY, "Accept": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        recipients = resp.json().get("SMSMessageData", {}).get("Recipients", [])
        if recipients and str(recipients[0].get("status", "")).lower() == "success":
            return "sent", None
        detail = recipients[0].get("status") if recipients else "no recipients in response"
        return "failed", f"AT response: {detail}"
    except Exception as exc:  # noqa: BLE001 - callers log per-recipient failures
        return "failed", str(exc)


def send_email(to, subject, html):
    """Send one email via Resend's transactional API."""
    if DRY_RUN or not RESEND_API_KEY:
        return "dry_run", None
    try:
        resp = requests.post(
            "https://api.resend.com/emails",
            json={"from": EMAIL_FROM, "to": [to], "subject": subject, "html": html},
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            timeout=30,
        )
        resp.raise_for_status()
        return "sent", None
    except Exception as exc:  # noqa: BLE001
        return "failed", str(exc)
