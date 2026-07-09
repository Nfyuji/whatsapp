"""Scheduler — 7 PM ask, midnight manager report."""

import logging
import threading
import time

log = logging.getLogger("scheduler")
_started = False


def _tick():
    try:
        from engine import run_daily_ask, run_manager_report, should_run_ask, should_run_report
        if should_run_ask():
            log.info("Running daily ask")
            run_daily_ask()
        if should_run_report():
            log.info("Running manager report")
            run_manager_report()
    except Exception:
        log.exception("Scheduler tick failed")


def start(interval: float = 60.0):
    global _started
    if _started:
        return
    _started = True

    def loop():
        while True:
            time.sleep(interval)
            _tick()

    threading.Thread(target=loop, daemon=True, name="wa-scheduler").start()
    log.info("Scheduler started")
