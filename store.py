"""Data layer — employees, settings, daily reports."""

from __future__ import annotations

import json
import re
import uuid
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any

from db import _lock, connect, init_db, now_iso

DEFAULT_SETTINGS: dict[str, Any] = {
    "enabled": False,
    "ask_hour": 19,
    "ask_minute": 0,
    "report_hour": 0,
    "report_minute": 0,
    "timezone_offset_hours": 3,
    "days_of_week": [0, 1, 2, 3, 4, 5, 6],
    "ask_message": "السلام عليكم {name} 🌙\n\nماذا أنجزت اليوم؟\nاكتب ملخص عملك باختصار.",
    "thank_message": "شكراً لكم 🙏\nتم تسجيل تقريرك بنجاح.",
    "manager_report_header": "📊 تقرير يومي — عمل الموظفين",
    "manager_phone": "",
    "company_name": "WhatsApp Reports",
    "webhook_url": "",
    "webhook_configured_at": None,
    "last_ask_run": None,
    "last_report_run": None,
    "last_ask_date": None,
    "last_report_date": None,
}


def _digits(phone: str) -> str:
    return re.sub(r"\D", "", phone or "")


def local_now(offset: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=offset)


def local_today(offset: int) -> str:
    return local_now(offset).date().isoformat()


def _fix_settings(raw: dict) -> dict:
    s = deepcopy(DEFAULT_SETTINGS)
    s.update({k: v for k, v in raw.items() if v is not None})
    days = s.get("days_of_week") or list(range(7))
    s["days_of_week"] = sorted(set(int(d) for d in days if 0 <= int(d) <= 6))
    return s


def load_settings() -> dict:
    init_db()
    with _lock:
        conn = connect()
        try:
            row = conn.execute("SELECT data FROM settings WHERE id=1").fetchone()
            if row:
                return _fix_settings(json.loads(row["data"]))
            d = _fix_settings({})
            conn.execute("INSERT INTO settings(id, data) VALUES(1, ?)", (json.dumps(d, ensure_ascii=False),))
            conn.commit()
            return d
        finally:
            conn.close()


def save_settings(updates: dict) -> dict:
    cur = load_settings()
    cur.update({k: v for k, v in updates.items() if v is not None})
    cur = _fix_settings(cur)
    with _lock:
        conn = connect()
        try:
            conn.execute(
                "INSERT INTO settings(id, data) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
                (json.dumps(cur, ensure_ascii=False),),
            )
            conn.commit()
        finally:
            conn.close()
    return cur


def list_employees(active_only: bool = True) -> list[dict]:
    init_db()
    with _lock:
        conn = connect()
        try:
            q = "SELECT * FROM employees"
            if active_only:
                q += " WHERE active=1"
            q += " ORDER BY name"
            return [dict(r) for r in conn.execute(q).fetchall()]
        finally:
            conn.close()


def add_employee(name: str, phone: str, department: str = "") -> dict:
    from notify import phone_digits, load_config

    init_db()
    eid = str(uuid.uuid4())
    normalized = phone_digits(phone, load_config())
    emp = {
        "id": eid,
        "name": name.strip(),
        "phone": normalized,
        "department": department.strip(),
        "active": 1,
        "created_at": now_iso(),
    }
    with _lock:
        conn = connect()
        try:
            conn.execute(
                "INSERT INTO employees(id,name,phone,department,active,created_at) VALUES(?,?,?,?,?,?)",
                (eid, emp["name"], emp["phone"], emp["department"], 1, emp["created_at"]),
            )
            conn.commit()
        finally:
            conn.close()
    return emp


def delete_employee(eid: str) -> bool:
    init_db()
    with _lock:
        conn = connect()
        try:
            conn.execute("UPDATE employees SET active=0 WHERE id=?", (eid,))
            conn.commit()
            return conn.total_changes > 0
        finally:
            conn.close()


def upsert_daily(report_date: str, employee_id: str, **kwargs) -> dict:
    init_db()
    with _lock:
        conn = connect()
        try:
            row = conn.execute(
                "SELECT * FROM daily_reports WHERE report_date=? AND employee_id=?",
                (report_date, employee_id),
            ).fetchone()
            if row:
                data = dict(row)
                for k, v in kwargs.items():
                    if v is not None:
                        data[k] = v
                conn.execute(
                    """UPDATE daily_reports SET employee_name=?, phone=?, question_sent=?,
                       question_sent_at=?, reply_text=?, reply_at=?, thank_sent=?, manager_reported=?
                       WHERE id=?""",
                    (
                        data.get("employee_name", ""),
                        data.get("phone", ""),
                        int(data.get("question_sent") or 0),
                        data.get("question_sent_at"),
                        data.get("reply_text"),
                        data.get("reply_at"),
                        int(data.get("thank_sent") or 0),
                        int(data.get("manager_reported") or 0),
                        data["id"],
                    ),
                )
            else:
                rid = str(uuid.uuid4())
                data = {
                    "id": rid,
                    "report_date": report_date,
                    "employee_id": employee_id,
                    "employee_name": kwargs.get("employee_name", ""),
                    "phone": kwargs.get("phone", ""),
                    "question_sent": int(kwargs.get("question_sent") or 0),
                    "question_sent_at": kwargs.get("question_sent_at"),
                    "reply_text": kwargs.get("reply_text"),
                    "reply_at": kwargs.get("reply_at"),
                    "thank_sent": int(kwargs.get("thank_sent") or 0),
                    "manager_reported": int(kwargs.get("manager_reported") or 0),
                }
                conn.execute(
                    """INSERT INTO daily_reports
                       (id,report_date,employee_id,employee_name,phone,question_sent,question_sent_at,
                        reply_text,reply_at,thank_sent,manager_reported)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                    tuple(data[k] for k in (
                        "id", "report_date", "employee_id", "employee_name", "phone",
                        "question_sent", "question_sent_at", "reply_text", "reply_at",
                        "thank_sent", "manager_reported",
                    )),
                )
            conn.commit()
            return data
        finally:
            conn.close()


def list_daily(report_date: str | None = None, limit: int = 200) -> list[dict]:
    init_db()
    with _lock:
        conn = connect()
        try:
            if report_date:
                rows = conn.execute(
                    "SELECT * FROM daily_reports WHERE report_date=? ORDER BY employee_name",
                    (report_date,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM daily_reports ORDER BY report_date DESC, employee_name LIMIT ?",
                    (limit,),
                ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def find_pending_reply(phone_digits: str) -> dict | None:
    settings = load_settings()
    tz = int(settings["timezone_offset_hours"])
    today = local_today(tz)
    yesterday = (local_now(tz).date() - timedelta(days=1)).isoformat()

    with _lock:
        conn = connect()
        try:
            for d in (today, yesterday):
                rows = conn.execute(
                    """SELECT * FROM daily_reports WHERE report_date=? AND question_sent=1
                       AND (reply_text IS NULL OR reply_text='') ORDER BY question_sent_at DESC""",
                    (d,),
                ).fetchall()
                for row in rows:
                    p = _digits(row["phone"] or "")
                    if p and (p == phone_digits or p.endswith(phone_digits) or phone_digits.endswith(p)):
                        return dict(row)
            return None
        finally:
            conn.close()


def mark_manager_reported(report_date: str) -> None:
    with _lock:
        conn = connect()
        try:
            conn.execute("UPDATE daily_reports SET manager_reported=1 WHERE report_date=?", (report_date,))
            conn.commit()
        finally:
            conn.close()


def dashboard(date: str | None = None) -> dict:
    settings = load_settings()
    d = date or local_today(settings["timezone_offset_hours"])
    rows = list_daily(d)
    employees = list_employees()
    replied = [r for r in rows if r.get("reply_text")]
    asked = [r for r in rows if r.get("question_sent")]
    pending = [r for r in rows if r.get("question_sent") and not r.get("reply_text")]
    rate = round(len(replied) / max(len(employees), 1) * 100, 1)
    return {
        "report_date": d,
        "employees_total": len(employees),
        "asked_count": len(asked),
        "replied_count": len(replied),
        "pending_count": len(pending),
        "reply_rate": rate,
        "rows": rows,
        "settings": settings,
    }


def report_dates(limit: int = 30) -> list[str]:
    init_db()
    with _lock:
        conn = connect()
        try:
            rows = conn.execute(
                "SELECT DISTINCT report_date FROM daily_reports ORDER BY report_date DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [r["report_date"] for r in rows]
        finally:
            conn.close()
