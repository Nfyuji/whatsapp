"""Business logic — ask, reply, manager report."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from notify import configure_webhook, is_enabled, load_config, phone_digits, save_config, send_message
from store import (
    dashboard,
    find_pending_reply,
    list_daily,
    list_employees,
    load_settings,
    local_now,
    local_today,
    mark_manager_reported,
    save_settings,
    upsert_daily,
)


def run_daily_ask(*, force: bool = False) -> dict[str, Any]:
    settings = load_settings()
    if not settings.get("enabled") and not force:
        return {"ok": False, "error": "فعّل الأتمتة من الإعدادات"}

    cfg = load_config()
    if not is_enabled(cfg):
        return {"ok": False, "error": "WhatsApp معطّل — أضف Green API في الإعدادات"}

    tz = int(settings["timezone_offset_hours"])
    today = local_today(tz)
    if not force and settings.get("last_ask_date") == today:
        return {"ok": True, "skipped": True, "reason": "تم الإرسال اليوم"}

    tpl = settings.get("ask_message") or "السلام عليكم {name}\nماذا أنجزت اليوم؟"
    sent, errors = [], []

    for emp in list_employees():
        phone = emp.get("phone") or ""
        if not phone:
            continue
        msg = tpl.replace("{name}", emp.get("name", "الموظف"))
        try:
            send_message(msg, phone, cfg)
            upsert_daily(
                today, emp["id"],
                employee_name=emp["name"], phone=phone,
                question_sent=1, question_sent_at=datetime.now(timezone.utc).isoformat(),
            )
            sent.append(emp["name"])
        except Exception as exc:
            errors.append({"name": emp["name"], "error": str(exc)})

    save_settings({"last_ask_run": datetime.now(timezone.utc).isoformat(), "last_ask_date": today})
    return {"ok": bool(sent), "sent": len(sent), "errors": errors, "date": today}


def handle_reply(phone: str, text: str) -> dict[str, Any]:
    digits = re.sub(r"\D", "", phone)
    row = find_pending_reply(digits)
    if not row:
        return {"ok": False, "skipped": True, "reason": "لا يوجد سؤال معلّق لهذا الرقم"}

    text = (text or "").strip()
    if len(text) < 2:
        return {"ok": False, "skipped": True, "reason": "رسالة فارغة"}

    upsert_daily(
        row["report_date"], row["employee_id"],
        employee_name=row.get("employee_name", ""), phone=row.get("phone", ""),
        question_sent=1, reply_text=text, reply_at=datetime.now(timezone.utc).isoformat(),
    )

    settings = load_settings()
    cfg = load_config()
    thank = settings.get("thank_message") or "شكراً لكم 🙏"
    thank_ok = False
    try:
        send_message(thank, row.get("phone") or digits, cfg)
        thank_ok = True
        upsert_daily(row["report_date"], row["employee_id"], thank_sent=1)
    except Exception:
        pass

    return {"ok": True, "employee": row.get("employee_name"), "thank_sent": thank_ok}


def build_report_text(report_date: str) -> str:
    settings = load_settings()
    rows = list_daily(report_date)
    lines = [
        settings.get("manager_report_header") or "📊 تقرير يومي",
        f"📅 {report_date}",
        "─────────────────",
    ]
    if not rows:
        lines.append("لا توجد بيانات.")
        return "\n".join(lines)

    for r in rows:
        name = r.get("employee_name") or "موظف"
        if r.get("reply_text"):
            lines += [f"✅ *{name}*", r["reply_text"].strip(), ""]
        elif r.get("question_sent"):
            lines += [f"⏳ *{name}* — لم يرد", ""]
        else:
            lines += [f"❌ *{name}* — لم يُسأل", ""]

    n = sum(1 for r in rows if r.get("reply_text"))
    lines.append(f"📈 {n}/{len(rows)} ردوا")
    return "\n".join(lines).strip()


def run_manager_report(*, report_date: str | None = None, force: bool = False) -> dict[str, Any]:
    settings = load_settings()
    if not settings.get("enabled") and not force:
        return {"ok": False, "error": "فعّل الأتمتة"}

    cfg = load_config()
    tz = int(settings["timezone_offset_hours"])
    date = report_date or settings.get("last_ask_date") or local_today(tz)
    phone = (settings.get("manager_phone") or "").strip()
    if not phone:
        return {"ok": False, "error": "أضف رقم المدير في الإعدادات"}

    msg = build_report_text(date)
    try:
        send_message(msg, phone, cfg)
        mark_manager_reported(date)
        save_settings({
            "last_report_run": datetime.now(timezone.utc).isoformat(),
            "last_report_date": date,
        })
        return {"ok": True, "report_date": date, "preview": msg[:500]}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def parse_green_webhook(body: dict) -> tuple[str, str] | None:
    wh = (body.get("typeWebhook") or "").lower()
    if wh and "incoming" not in wh:
        return None
    sender = body.get("senderData") or {}
    if body.get("fromMe") or sender.get("fromMe"):
        return None
    chat = sender.get("chatId") or sender.get("sender") or ""
    phone = re.sub(r"\D", "", chat.split("@")[0] if "@" in chat else chat)
    md = body.get("messageData") or {}
    tmd = md.get("textMessageData") or md.get("extendedTextMessageData") or {}
    text = tmd.get("textMessage") or tmd.get("text") or md.get("text") or ""
    if phone and text:
        return phone, text.strip()
    return None


def setup_webhook(public_url: str) -> dict[str, Any]:
    cfg = load_config()
    cfg["public_base_url"] = public_url.rstrip("/")
    save_config(cfg)
    result = configure_webhook(public_url, cfg)
    if result.get("ok"):
        save_settings({
            "webhook_url": result["webhook_url"],
            "webhook_configured_at": datetime.now(timezone.utc).isoformat(),
        })
    return result


def should_run_ask() -> bool:
    s = load_settings()
    if not s.get("enabled"):
        return False
    tz = int(s["timezone_offset_hours"])
    now = local_now(tz)
    if now.weekday() not in s.get("days_of_week", list(range(7))):
        return False
    if now.hour != int(s.get("ask_hour", 19)):
        return False
    m = int(s.get("ask_minute", 0))
    if now.minute < m or now.minute > m + 14:
        return False
    return s.get("last_ask_date") != now.date().isoformat()


def should_run_report() -> bool:
    s = load_settings()
    if not s.get("enabled"):
        return False
    tz = int(s["timezone_offset_hours"])
    now = local_now(tz)
    if now.weekday() not in s.get("days_of_week", list(range(7))):
        return False
    if now.hour != int(s.get("report_hour", 0)):
        return False
    m = int(s.get("report_minute", 0))
    if now.minute < m or now.minute > m + 14:
        return False
    rd = s.get("last_ask_date") or (now.date()).isoformat()
    return s.get("last_report_date") != rd
