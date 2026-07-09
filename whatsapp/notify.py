"""Green API WhatsApp send — standalone."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"


def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    ex = ROOT / "config.example.json"
    if ex.exists():
        return json.loads(ex.read_text(encoding="utf-8"))
    return {}


def save_config(data: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def wa_cfg(config: dict | None = None) -> dict:
    return (config or load_config()).get("whatsapp") or {}


def is_enabled(config: dict | None = None) -> bool:
    return bool(wa_cfg(config).get("enabled"))


def default_country(config: dict | None = None) -> str:
    wa = wa_cfg(config)
    c = (wa.get("default_country_code") or "").strip()
    if c:
        return re.sub(r"\D", "", c)
    return "967"


def normalize_phone(phone: str, country: str | None = None) -> str:
    if "@" in (phone or ""):
        return phone
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        return ""
    cc = country or "967"
    if digits.startswith("0"):
        digits = cc + digits[1:]
    elif len(digits) <= 10:
        digits = cc + digits.lstrip("0")
    return f"{digits}@c.us"


def phone_digits(phone: str, config: dict | None = None) -> str:
    raw = (phone or "").strip()
    if not raw:
        return ""
    if "@" in raw:
        return raw.replace("@c.us", "")
    return normalize_phone(raw, default_country(config)).replace("@c.us", "")


def _api_base(inst: dict) -> str:
    host = (inst.get("api_host") or "api.green-api.com").strip().replace("https://", "").replace("http://", "")
    return f"https://{host}/waInstance{inst.get('instance_id', '').strip()}"


def send_message(message: str, phone: str, config: dict | None = None) -> dict[str, Any]:
    cfg = config or load_config()
    wa = wa_cfg(cfg)
    if not wa.get("enabled"):
        return {"skipped": True, "reason": "whatsapp disabled"}

    inst = wa.get("green_api") or {}
    token = inst.get("api_token", "").strip()
    if not inst.get("instance_id") or not token:
        raise RuntimeError("Green API: أضف instance_id و api_token")

    chat_id = phone if "@" in phone else normalize_phone(phone, default_country(cfg))
    resp = requests.post(
        f"{_api_base(inst)}/sendMessage/{token}",
        json={"chatId": chat_id, "message": message},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def configure_webhook(public_base_url: str, config: dict | None = None) -> dict[str, Any]:
    cfg = config or load_config()
    wa = wa_cfg(cfg)
    inst = wa.get("green_api") or {}
    token = inst.get("api_token", "").strip()
    if not inst.get("instance_id") or not token:
        return {"ok": False, "error": "Green API غير مضبوط"}

    webhook_url = f"{public_base_url.rstrip('/')}/api/webhook/green"
    payload = {
        "webhookUrl": webhook_url,
        "delaySendMessagesMilliseconds": 500,
        "markIncomingMessagesReaded": "yes",
        "markIncomingMessagesReadedOnReply": "yes",
        "incomingWebhook": "yes",
        "outgoingWebhook": "yes",
        "stateWebhook": "yes",
    }
    resp = requests.post(f"{_api_base(inst)}/setSettings/{token}", json=payload, timeout=30)
    resp.raise_for_status()
    return {"ok": True, "webhook_url": webhook_url, "response": resp.text[:200]}
