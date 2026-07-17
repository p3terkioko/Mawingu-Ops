#!/usr/bin/env python3
"""Broadcast the canonical advisory to every active subscription.

Final pipeline step (after generate_advisory.py). Two kinds of send:

  weekly_digest  every active subscription, every pipeline run — the same
                 canonical advisory text every other channel shows.
  escalation     when this run's drought trigger category is worse than the
                 previous run's (e.g. mild -> moderate), an additional
                 immediate alert goes out. This is the anticipatory-action
                 moment: warn BEFORE the impact.

Every attempt is recorded in delivery_logs (status sent/failed/dry_run), so
the admin console can show exactly what went out. Without live AT/Resend keys
the senders record dry runs instead of failing (see notify.py).
"""

import os
import sys
from datetime import datetime, timezone

import psycopg2
from dotenv import load_dotenv

from notify import send_sms, send_email

load_dotenv()

LOCATION = "machakos"

# Severity order for escalation detection.
TRIGGER_RANK = {"none": 0, "mild": 1, "moderate": 2, "severe": 3, "extreme": 4}

ESCALATION_PREFIX = {
    "sw": "TAHADHARI YA UKAME",
    "en": "DROUGHT ALERT",
}


def log(message):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {message}", flush=True)


def get_connection():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        log("ERROR: DATABASE_URL is not set")
        sys.exit(1)
    return psycopg2.connect(database_url)


def get_latest_advisories(conn):
    """Latest still-valid advisory per language -> {lang: {text, alert_level}}."""
    out = {}
    with conn.cursor() as cur:
        for lang in ("sw", "en"):
            cur.execute(
                """
                SELECT advisory_text, alert_level, recommendation
                FROM advisories
                WHERE location = %s AND language = %s AND valid_until > NOW()
                ORDER BY generated_at DESC
                LIMIT 1
                """,
                (LOCATION, lang),
            )
            row = cur.fetchone()
            if row:
                out[lang] = {
                    "text": row[0],
                    "alert_level": row[1],
                    "recommendation": row[2],
                }
    return out


def get_trigger_history(conn):
    """(current, previous) trigger categories from the last two alert rows."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT trigger_category
            FROM alert_levels
            WHERE location = %s
            ORDER BY computed_at DESC
            LIMIT 2
            """,
            (LOCATION,),
        )
        rows = [r[0] for r in cur.fetchall()]
    current = rows[0] if len(rows) > 0 else None
    previous = rows[1] if len(rows) > 1 else None
    return current, previous


def get_alert_context(conn):
    """Extra context for the email template (SPI, onset)."""
    ctx = {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT alert_level, spi, spi_1month, trigger_category
            FROM alert_levels
            WHERE location = %s ORDER BY computed_at DESC LIMIT 1
            """,
            (LOCATION,),
        )
        row = cur.fetchone()
        if row:
            ctx.update(
                alert_level=row[0],
                spi=float(row[1]) if row[1] is not None else None,
                spi_1month=float(row[2]) if row[2] is not None else None,
                trigger_category=row[3],
            )
        cur.execute(
            """
            SELECT onset_status, message
            FROM onset_validation
            WHERE location = %s ORDER BY computed_at DESC LIMIT 1
            """,
            (LOCATION,),
        )
        row = cur.fetchone()
        if row:
            ctx.update(onset_status=row[0], onset_message=row[1])
    return ctx


def get_active_subscriptions(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, contact, channel, language
            FROM subscriptions
            WHERE active = TRUE AND location = %s
            ORDER BY created_at ASC
            """,
            (LOCATION,),
        )
        return [
            {"id": r[0], "contact": r[1], "channel": r[2], "language": r[3]}
            for r in cur.fetchall()
        ]


def log_delivery(conn, sub_id, channel, status, trigger_reason, text, error):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO delivery_logs
                (subscription_id, channel, status, trigger_reason, advisory_text, error_message)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (sub_id, channel, status, trigger_reason, text, error),
        )
    conn.commit()


def build_email_html(advisory, ctx, language):
    """Simple self-contained HTML digest: advisory + signal summary + attribution."""
    heading = (
        "Ushauri wa wiki hii — mahindi, Machakos"
        if language == "sw"
        else "This week's maize advisory — Machakos"
    )
    spi = ctx.get("spi")
    spi1 = ctx.get("spi_1month")
    rows = []
    if ctx.get("alert_level"):
        rows.append(("Alert level", ctx["alert_level"]))
    if ctx.get("trigger_category"):
        rows.append(("Drought trigger (SPI-based)", ctx["trigger_category"]))
    if spi is not None:
        rows.append(("SPI (30-day)", f"{spi:+.2f}"))
    if spi1 is not None:
        rows.append(("SPI-1 (calendar month, Drought Watch method)", f"{spi1:+.2f}"))
    if ctx.get("onset_status"):
        rows.append(("Growing-season onset", ctx["onset_status"].replace("_", " ")))
    table = "".join(
        f"<tr><td style='padding:4px 12px 4px 0;color:#64748b'>{k}</td>"
        f"<td style='padding:4px 0;font-weight:600'>{v}</td></tr>"
        for k, v in rows
    )
    onset_msg = ctx.get("onset_message", "")
    return f"""
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#1e293b">
  <h2 style="color:#0369a1">MawinguOps</h2>
  <h3>{heading}</h3>
  <p style="font-size:17px;line-height:1.6;background:#f1f5f9;border-radius:8px;padding:16px">
    {advisory['text']}
  </p>
  <table style="font-size:13px;border-collapse:collapse">{table}</table>
  <p style="font-size:12px;color:#64748b">{onset_msg}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0">
  <p style="font-size:11px;color:#94a3b8">
    Data: CHIRPS (UCSB-CHC), Open-Meteo &amp; ICPAC — aligned with ICPAC's East
    Africa Drought Watch (SPI) and growing-season onset products.
    Dial *384# for the USSD service. Reply STOP / use the dashboard to unsubscribe.
  </p>
</div>"""


def pick_advisory(advisories, language):
    """Advisory in the subscriber's language, falling back to the other."""
    return advisories.get(language) or advisories.get("sw") or advisories.get("en")


def send_to_subscription(conn, sub, advisories, ctx, trigger_reason, escalated_to=None):
    advisory = pick_advisory(advisories, sub["language"])
    if not advisory:
        return
    lang = sub["language"] if sub["language"] in ("sw", "en") else "sw"

    if sub["channel"] == "sms":
        text = f"MawinguOps: {advisory['text']}"
        if trigger_reason == "escalation":
            text = f"{ESCALATION_PREFIX[lang]} ({escalated_to}). {text}"
        status, error = send_sms(sub["contact"], text)
    else:
        subject = (
            "MawinguOps — ushauri wa mahindi wa wiki hii (Machakos)"
            if lang == "sw"
            else "MawinguOps — weekly maize advisory (Machakos)"
        )
        if trigger_reason == "escalation":
            subject = f"[{ESCALATION_PREFIX[lang]}] {subject}"
        text = advisory["text"]
        status, error = send_email(sub["contact"], subject, build_email_html(advisory, ctx, lang))

    log_delivery(conn, sub["id"], sub["channel"], status, trigger_reason, text, error)
    log(f"  {sub['channel']} -> {sub['contact']} [{trigger_reason}]: {status}"
        + (f" ({error})" if error else ""))


def main():
    log("Starting advisory broadcast")
    conn = get_connection()
    try:
        advisories = get_latest_advisories(conn)
        if not advisories:
            log("No valid advisory found — run generate_advisory.py first")
            sys.exit(1)

        subs = get_active_subscriptions(conn)
        log(f"Active subscriptions: {len(subs)}")
        if not subs:
            log("Nothing to send")
            return

        ctx = get_alert_context(conn)
        current, previous = get_trigger_history(conn)
        escalated = (
            current in TRIGGER_RANK
            and previous in TRIGGER_RANK
            and TRIGGER_RANK[current] > TRIGGER_RANK[previous]
        )
        log(f"Trigger category: {previous} -> {current} "
            f"({'ESCALATED — sending immediate alerts' if escalated else 'no escalation'})")

        for sub in subs:
            send_to_subscription(conn, sub, advisories, ctx, "weekly_digest")
            if escalated:
                send_to_subscription(
                    conn, sub, advisories, ctx, "escalation", escalated_to=current
                )

        log("Broadcast complete")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
