#!/usr/bin/env python3
"""Standalone WhatsApp Daily Reports — deploy separately."""

from __future__ import annotations

import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from db import init_db
from engine import (
    build_report_text,
    handle_reply,
    parse_green_webhook,
    run_ask_employee,
    run_daily_ask,
    run_manager_report,
    setup_webhook,
)
from notify import load_config, save_config
from scheduler import start as start_scheduler
from store import (
    add_employee,
    dashboard,
    delete_employee,
    employee_calendar,
    get_employee,
    list_employees,
    load_settings,
    local_today,
    report_dates,
    save_settings,
    schedule_summary,
    system_status,
    update_employee,
)

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
PORT = int(os.environ.get("PORT", "8090"))

app = FastAPI(title="WhatsApp Daily Reports", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _serve_page(filename: str):
    path = (WEB / filename).resolve()
    if not str(path).startswith(str(WEB.resolve())):
        raise HTTPException(403, "Forbidden")
    if not path.is_file():
        raise HTTPException(
            503,
            f"ملف الواجهة غير موجود على السيرفر ({filename}). "
            "تأكد من رفع مجلد web/ إلى GitHub ثم أعد النشر.",
        )
    return FileResponse(path)


@app.on_event("startup")
def _startup():
    init_db()
    start_scheduler()
    if WEB.is_dir():
        print(f"[startup] web folder OK: {WEB}")
    else:
        print(f"[startup] WARNING: web folder MISSING at {WEB}")


class SettingsBody(BaseModel):
    enabled: bool = False
    ask_hour: int = Field(19, ge=0, le=23)
    ask_minute: int = Field(0, ge=0, le=59)
    report_hour: int = Field(0, ge=0, le=23)
    report_minute: int = Field(0, ge=0, le=59)
    timezone_offset_hours: int = Field(3, ge=-12, le=14)
    days_of_week: list[int] = Field(default_factory=lambda: list(range(7)))
    ask_message: str = ""
    thank_message: str = ""
    follow_up_enabled: bool = True
    follow_up_message: str = ""
    manager_report_header: str = ""
    manager_phone: str = ""
    company_name: str = ""


class EmployeeBody(BaseModel):
    name: str
    phone: str
    department: str = ""


class EmployeeUpdateBody(BaseModel):
    name: str | None = None
    phone: str | None = None
    department: str | None = None
    active: bool | None = None


class GreenApiBody(BaseModel):
    instance_id: str
    api_token: str
    api_host: str = "7107.api.greenapi.com"
    enabled: bool = True
    default_country_code: str = "967"


class WebhookBody(BaseModel):
    public_base_url: str


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "service": "whatsapp-reports",
        "web_folder": WEB.is_dir(),
        "pages": {
            "analysis": (WEB / "analysis.html").is_file(),
            "reports": (WEB / "reports.html").is_file(),
            "settings": (WEB / "settings.html").is_file(),
        },
    }


@app.get("/api/dashboard")
def api_dashboard(date: str | None = None):
    return dashboard(date)


@app.get("/api/settings")
def api_get_settings():
    cfg = load_config()
    s = load_settings()
    wa = dict(cfg.get("whatsapp") or {})
    ga = dict((wa.get("green_api") or {}))
    if ga.get("api_token"):
        ga = {**ga, "api_token": "••••••••", "has_token": True}
    else:
        ga = {**ga, "has_token": False}
    wa["green_api"] = ga
    return {"settings": s, "green_api": wa, "schedule": schedule_summary(s)}


@app.put("/api/settings")
def api_save_settings(body: SettingsBody):
    payload = body.model_dump(exclude_none=True)
    payload["timezone_offset_hours"] = 3
    for k in ("ask_message", "thank_message", "follow_up_message", "manager_report_header", "company_name"):
        if k in payload and not payload[k]:
            payload.pop(k)
    saved = save_settings(payload)
    return {"ok": True, "settings": saved, "schedule": schedule_summary(saved)}


@app.put("/api/green-api")
def api_green_api(body: GreenApiBody):
    instance_id = body.instance_id.strip()
    if not instance_id:
        raise HTTPException(400, "Instance ID مطلوب")

    cfg = load_config()
    existing = (cfg.get("whatsapp") or {}).get("green_api") or {}
    token = body.api_token.strip()
    if not token or "•" in token:
        token = (existing.get("api_token") or "").strip()
    if not token:
        raise HTTPException(400, "API Token مطلوب — الصق التوكن الكامل ثم احفظ")

    cfg["whatsapp"] = {
        "enabled": body.enabled,
        "provider": "green_api",
        "default_country_code": body.default_country_code.strip() or "967",
        "green_api": {
            "instance_id": instance_id,
            "api_token": token,
            "api_host": body.api_host.strip() or "7107.api.greenapi.com",
        },
    }
    cfg["public_base_url"] = cfg.get("public_base_url") or ""
    try:
        save_config(cfg)
    except OSError as exc:
        raise HTTPException(500, f"تعذر حفظ الإعدادات على السيرفر: {exc}") from exc
    return {"ok": True, "message": "تم حفظ Green API", "instance_id": instance_id}


@app.get("/api/employees")
def api_employees():
    return {"employees": list_employees(active_only=False)}


@app.post("/api/employees")
def api_add_employee(body: EmployeeBody):
    if not body.name.strip() or not body.phone.strip():
        raise HTTPException(400, "الاسم والرقم مطلوبان")
    emp = add_employee(body.name, body.phone, body.department)
    return {"ok": True, "employee": emp}


@app.put("/api/employees/{eid}")
def api_update_employee(eid: str, body: EmployeeUpdateBody):
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(400, "لا توجد بيانات للتحديث")
    emp = update_employee(eid, **payload)
    if not emp:
        raise HTTPException(404, "الموظف غير موجود")
    return {"ok": True, "employee": emp}


@app.delete("/api/employees/{eid}")
def api_del_employee(eid: str):
    delete_employee(eid)
    return {"ok": True}


@app.get("/api/reports/dates")
def api_report_dates():
    return {"dates": report_dates()}


@app.get("/api/reports/preview")
def api_preview(date: str | None = None):
    s = load_settings()
    d = date or local_today(s["timezone_offset_hours"])
    return {"date": d, "text": build_report_text(d)}


@app.get("/api/reports/pdf")
def api_report_pdf(date: str | None = None):
    from pdf_report import generate_pdf

    s = load_settings()
    d = date or local_today(s["timezone_offset_hours"])
    try:
        pdf = generate_pdf(d)
    except Exception as exc:
        raise HTTPException(500, f"فشل PDF: {exc}") from exc
    fname = f"report-{d}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@app.get("/api/employees/{eid}/calendar")
def api_employee_calendar(eid: str, year: int | None = None, month: int | None = None):
    s = load_settings()
    now = __import__("store").local_now(int(s["timezone_offset_hours"]))
    y = year or now.year
    m = month or now.month
    data = employee_calendar(eid, y, m)
    if not data.get("ok"):
        raise HTTPException(404, data.get("error", "غير موجود"))
    return data


@app.post("/api/run/ask")
def api_run_ask():
    r = run_daily_ask(force=True)
    if not r.get("ok") and not r.get("skipped"):
        raise HTTPException(400, r.get("error", "فشل"))
    return r


@app.post("/api/run/ask/{eid}")
def api_run_ask_one(eid: str):
    r = run_ask_employee(eid, force=True)
    if not r.get("ok"):
        raise HTTPException(400, r.get("error", "فشل"))
    return r


@app.get("/api/status")
def api_status():
    s = load_settings()
    return {"ok": True, "status": system_status(s), "schedule": schedule_summary(s)}


@app.post("/api/run/report")
def api_run_report(date: str | None = None):
    r = run_manager_report(report_date=date, force=True)
    if not r.get("ok") and not r.get("skipped"):
        raise HTTPException(400, r.get("error", "فشل"))
    return r


@app.post("/api/webhook/configure")
def api_configure_webhook(body: WebhookBody):
    r = setup_webhook(body.public_base_url.strip())
    if not r.get("ok"):
        raise HTTPException(400, r.get("error", "فشل"))
    return r


@app.post("/api/webhook/green")
async def green_webhook(request: Request):
    try:
        body = await request.json()
    except Exception:
        return {"ok": False}
    if not isinstance(body, dict):
        return {"ok": False}
    parsed = parse_green_webhook(body)
    if not parsed:
        return {"ok": True, "ignored": True}
    phone, text = parsed
    return handle_reply(phone, text)


if (WEB / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=WEB / "assets"), name="assets")


@app.get("/")
def index():
    return _serve_page("index.html")


@app.get("/analysis.html")
def page_analysis():
    return RedirectResponse("/", status_code=302)


@app.get("/reports.html")
def page_reports():
    return RedirectResponse("/#reports", status_code=302)


@app.get("/settings.html")
def page_settings():
    return RedirectResponse("/#settings", status_code=302)


@app.get("/favicon.svg")
def favicon():
    return _serve_page("favicon.svg")


def main():
    init_db()
    start_scheduler()
    uvicorn.run(app, host="0.0.0.0", port=PORT)


if __name__ == "__main__":
    main()
