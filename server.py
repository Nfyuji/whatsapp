#!/usr/bin/env python3
"""Standalone WhatsApp Daily Reports — deploy separately."""

from __future__ import annotations

import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from db import init_db
from engine import (
    build_report_text,
    handle_reply,
    parse_green_webhook,
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
    list_employees,
    load_settings,
    report_dates,
    save_settings,
)

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
PORT = int(os.environ.get("PORT", "8090"))

app = FastAPI(title="WhatsApp Daily Reports", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _startup():
    init_db()
    start_scheduler()


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
    manager_report_header: str = ""
    manager_phone: str = ""
    company_name: str = ""


class EmployeeBody(BaseModel):
    name: str
    phone: str
    department: str = ""


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
    return {"ok": True, "service": "whatsapp-reports"}


@app.get("/api/dashboard")
def api_dashboard(date: str | None = None):
    return dashboard(date)


@app.get("/api/settings")
def api_get_settings():
    cfg = load_config()
    return {"settings": load_settings(), "green_api": cfg.get("whatsapp", {})}


@app.put("/api/settings")
def api_save_settings(body: SettingsBody):
    payload = body.model_dump(exclude_none=True)
    for k in ("ask_message", "thank_message", "manager_report_header", "company_name"):
        if k in payload and not payload[k]:
            payload.pop(k)
    saved = save_settings(payload)
    return {"ok": True, "settings": saved}


@app.put("/api/green-api")
def api_green_api(body: GreenApiBody):
    cfg = load_config()
    existing = (cfg.get("whatsapp") or {}).get("green_api") or {}
    token = body.api_token.strip()
    if not token or "•" in token:
        token = existing.get("api_token", "")
    cfg["whatsapp"] = {
        "enabled": body.enabled,
        "provider": "green_api",
        "default_country_code": body.default_country_code,
        "green_api": {
            "instance_id": body.instance_id.strip(),
            "api_token": token,
            "api_host": body.api_host.strip(),
        },
    }
    save_config(cfg)
    return {"ok": True}


@app.get("/api/employees")
def api_employees():
    return {"employees": list_employees(active_only=False)}


@app.post("/api/employees")
def api_add_employee(body: EmployeeBody):
    if not body.name.strip() or not body.phone.strip():
        raise HTTPException(400, "الاسم والرقم مطلوبان")
    emp = add_employee(body.name, body.phone, body.department)
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
    from store import local_today
    d = date or local_today(s["timezone_offset_hours"])
    return {"date": d, "text": build_report_text(d)}


@app.post("/api/run/ask")
def api_run_ask():
    r = run_daily_ask(force=True)
    if not r.get("ok") and not r.get("skipped"):
        raise HTTPException(400, r.get("error", "فشل"))
    return r


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


if WEB.exists():
    app.mount("/assets", StaticFiles(directory=WEB / "assets"), name="assets")

    @app.get("/")
    def index():
        return FileResponse(WEB / "analysis.html")

    @app.get("/analysis.html")
    def page_analysis():
        return FileResponse(WEB / "analysis.html")

    @app.get("/reports.html")
    def page_reports():
        return FileResponse(WEB / "reports.html")

    @app.get("/settings.html")
    def page_settings():
        return FileResponse(WEB / "settings.html")


def main():
    init_db()
    start_scheduler()
    uvicorn.run(app, host="0.0.0.0", port=PORT)


if __name__ == "__main__":
    main()
