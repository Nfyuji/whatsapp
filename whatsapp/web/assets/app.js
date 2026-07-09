const API = "";
const $ = (s) => document.querySelector(s);

const esc = (t) => {
  if (!t) return "";
  const d = document.createElement("div");
  d.textContent = String(t);
  return d.innerHTML;
};

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || data.reason || "خطأ");
  return data;
}

function toast(msg, err) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("err", !!err);
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3500);
}

const DAYS = [
  { v: 0, l: "اثنين" }, { v: 1, l: "ثلاثاء" }, { v: 2, l: "أربعاء" },
  { v: 3, l: "خميس" }, { v: 4, l: "جمعة" }, { v: 5, l: "سبت" }, { v: 6, l: "أحد" },
];

function buildDayChips(containerId, selected) {
  const el = $(containerId);
  if (!el) return;
  const set = new Set(selected || [0, 1, 2, 3, 4, 5, 6]);
  el.innerHTML = DAYS.map((d) => `
    <label class="day-chip">
      <input type="checkbox" data-day="${d.v}" ${set.has(d.v) ? "checked" : ""} />
      <span>${d.l}</span>
    </label>`).join("");
}

function getSelectedDays(containerId) {
  return [...document.querySelectorAll(`#${containerId} input[data-day]:checked`)].map((x) => +x.dataset.day);
}

function renderReportFeed(rows, containerId) {
  const el = $(containerId);
  if (!el) return;
  if (!rows?.length) {
    el.innerHTML = '<p class="empty"><i class="fas fa-inbox"></i> لا بيانات — أرسل السؤال للموظفين</p>';
    return;
  }
  el.innerHTML = rows.map((r) => {
    const cls = r.reply_text ? "replied" : "";
    const badge = r.reply_text
      ? '<span class="badge badge-ok"><i class="fas fa-check"></i> رد</span>'
      : r.question_sent
        ? '<span class="badge badge-wait"><i class="fas fa-clock"></i> انتظار</span>'
        : '<span class="badge">—</span>';
    return `
      <div class="report-item ${cls}">
        <div class="avatar">${esc((r.employee_name || "?")[0])}</div>
        <div>
          <strong>${esc(r.employee_name)}</strong>
          <div class="muted">${esc(r.phone || "")}</div>
          ${r.reply_text ? `<div class="reply-box">${esc(r.reply_text)}</div>` : r.question_sent ? '<p class="muted">بانتظار الرد...</p>' : ""}
        </div>
        <div>${badge}</div>
      </div>`;
  }).join("");
}

function renderStats(d, containerId) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">الموظفون</div><div class="stat-value">${d.employees_total}</div></div>
    <div class="stat-card"><div class="stat-label">أُرسل لهم</div><div class="stat-value">${d.asked_count}</div></div>
    <div class="stat-card"><div class="stat-label">ردّوا</div><div class="stat-value green">${d.replied_count}</div></div>
    <div class="stat-card"><div class="stat-label">نسبة الرد</div><div class="stat-value green">${d.reply_rate || 0}%</div></div>
    <div class="stat-card"><div class="stat-label">بانتظار</div><div class="stat-value">${d.pending_count}</div></div>`;
}

window.WAApp = { api, toast, esc, $, buildDayChips, getSelectedDays, renderReportFeed, renderStats };
