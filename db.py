"""SQLite — standalone WhatsApp reports app."""

from __future__ import annotations

import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = Path(os.environ.get("DATABASE_PATH", str(DATA_DIR / "app.db")))

_lock = threading.RLock()
_initialized = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  department TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS daily_reports (
  id TEXT PRIMARY KEY,
  report_date TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  employee_name TEXT,
  phone TEXT,
  question_sent INTEGER DEFAULT 0,
  question_sent_at TEXT,
  reply_text TEXT,
  reply_at TEXT,
  thank_sent INTEGER DEFAULT 0,
  manager_reported INTEGER DEFAULT 0,
  UNIQUE(report_date, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_reports(report_date DESC);
"""


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=60, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    global _initialized
    with _lock:
        if _initialized:
            return
        conn = connect()
        try:
            conn.executescript(SCHEMA)
            _migrate(conn)
            conn.commit()
            _initialized = True
        finally:
            conn.close()


def _migrate(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(daily_reports)").fetchall()}
    if "first_reply_text" not in cols:
        conn.execute("ALTER TABLE daily_reports ADD COLUMN first_reply_text TEXT")
    if "awaiting_detail" not in cols:
        conn.execute("ALTER TABLE daily_reports ADD COLUMN awaiting_detail INTEGER DEFAULT 0")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
