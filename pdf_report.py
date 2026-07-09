"""PDF report generation — RTL Arabic via HTML."""

from __future__ import annotations

import io
from html import escape

from store import _merge_daily_rows, load_settings


def _status_label(r: dict) -> str:
    if r.get("reply_text"):
        return "تم الرد"
    if r.get("awaiting_detail"):
        return "بانتظار التفصيل"
    if r.get("question_sent"):
        return "بانتظار الرد"
    return "لم يُسأل"


def build_report_html(report_date: str) -> str:
    settings = load_settings()
    rows = _merge_daily_rows(report_date)
    company = escape(settings.get("company_name") or "تقارير الموظفين")
    header = escape(settings.get("manager_report_header") or "التقرير اليومي")

    body_rows = ""
    for r in rows:
        name = escape(r.get("employee_name") or "—")
        phone = escape(r.get("phone") or "—")
        status = escape(_status_label(r))
        reply = escape((r.get("reply_text") or r.get("first_reply_text") or "—").strip())
        body_rows += f"""
        <tr>
          <td><strong>{name}</strong><br/><span class="muted">{phone}</span></td>
          <td><span class="pill">{status}</span></td>
          <td class="reply">{reply}</td>
        </tr>"""

    if not body_rows:
        body_rows = '<tr><td colspan="3" class="empty">لا توجد بيانات لهذا اليوم</td></tr>'

    replied = sum(1 for r in rows if r.get("reply_text"))
    total = len(rows)

    return f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<style>
  @page {{ margin: 1.5cm; }}
  body {{ font-family: 'DejaVu Sans', Tahoma, Arial, sans-serif; color: #0f172a; font-size: 11pt; }}
  .header {{ border-bottom: 3px solid #0d9488; padding-bottom: 12px; margin-bottom: 20px; }}
  h1 {{ margin: 0; font-size: 20pt; color: #0f766e; }}
  .sub {{ color: #64748b; margin-top: 6px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
  th {{ background: #f1f5f9; text-align: right; padding: 10px; font-size: 10pt; border-bottom: 2px solid #e2e8f0; }}
  td {{ padding: 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }}
  .muted {{ color: #64748b; font-size: 9pt; }}
  .pill {{ background: #ecfdf5; color: #047857; padding: 3px 8px; border-radius: 6px; font-size: 9pt; }}
  .reply {{ white-space: pre-wrap; line-height: 1.6; }}
  .footer {{ margin-top: 24px; color: #64748b; font-size: 9pt; }}
  .stats {{ display: inline-block; background: #f0fdfa; padding: 8px 14px; border-radius: 8px; margin-top: 10px; }}
</style>
</head>
<body>
  <div class="header">
    <h1>{company}</h1>
    <div class="sub">{header} — {escape(report_date)}</div>
    <div class="stats">نسبة الرد: {replied}/{total}</div>
  </div>
  <table>
    <thead><tr><th>الموظف</th><th>الحالة</th><th>التقرير</th></tr></thead>
    <tbody>{body_rows}</tbody>
  </table>
  <div class="footer">تم التوليد آلياً — نظام تقارير واتس</div>
</body>
</html>"""


def generate_pdf(report_date: str) -> bytes:
    from xhtml2pdf import pisa

    html = build_report_html(report_date)
    buf = io.BytesIO()
    status = pisa.CreatePDF(html, dest=buf, encoding="UTF-8")
    if status.err:
        raise RuntimeError("فشل توليد PDF")
    return buf.getvalue()
