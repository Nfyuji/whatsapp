(function () {
  const API = "";

  function $(s) {
    return document.querySelector(s);
  }

  function esc(t) {
    if (!t) return "";
    const d = document.createElement("div");
    d.textContent = String(t);
    return d.innerHTML;
  }

  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.detail || data.error || data.reason || "خطأ في الحفظ";
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return data;
  }

  function toast(msg, err) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("err", !!err);
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 3500);
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

  function to12(h24) {
    const h = (parseInt(h24, 10) || 0) % 24;
    return { hour: h % 12 || 12, ampm: h >= 12 ? "pm" : "am" };
  }

  function to24(h12, ampm) {
    let h = parseInt(h12, 10) || 12;
    const pm = ampm === "pm" || ampm === "م";
    if (pm) {
      if (h !== 12) h += 12;
    } else if (h === 12) {
      h = 0;
    }
    return h;
  }

  function formatTime12Ar(h24, minute) {
    const { hour, ampm } = to12(h24);
    const mm = String(minute ?? 0).padStart(2, "0");
    return `${hour}:${mm} ${ampm === "pm" ? "م" : "ص"}`;
  }

  function setTime12(prefix, h24, minute) {
    const t = to12(h24);
    const hEl = document.getElementById(`${prefix}-hour-12`);
    const mEl = document.getElementById(`${prefix}-minute`);
    const aEl = document.getElementById(`${prefix}-ampm`);
    if (hEl) hEl.value = String(t.hour);
    if (mEl) mEl.value = String(minute ?? 0);
    if (aEl) aEl.value = t.ampm;
  }

  function getTime24(prefix) {
    const h12 = document.getElementById(`${prefix}-hour-12`)?.value;
    const minute = document.getElementById(`${prefix}-minute`)?.value;
    const ampm = document.getElementById(`${prefix}-ampm`)?.value;
    return {
      hour: to24(h12, ampm),
      minute: Math.max(0, Math.min(59, parseInt(minute, 10) || 0)),
    };
  }

  function buildHour12Options(selected) {
    return Array.from({ length: 12 }, (_, i) => i + 1)
      .map((h) => `<option value="${h}"${+selected === h ? " selected" : ""}>${h}</option>`)
      .join("");
  }

  function buildMinuteOptions(selected) {
    return Array.from({ length: 60 }, (_, i) => i)
      .map((m) => `<option value="${m}"${+selected === m ? " selected" : ""}>${String(m).padStart(2, "0")}</option>`)
      .join("");
  }

  function initTime12Pickers() {
    ["ask", "report"].forEach((p) => {
      const hEl = document.getElementById(`${p}-hour-12`);
      const mEl = document.getElementById(`${p}-minute`);
      if (hEl && !hEl.options.length) hEl.innerHTML = buildHour12Options(7);
      if (mEl && !mEl.options.length) mEl.innerHTML = buildMinuteOptions(0);
    });
  }

  window.WAApp = {
    api, toast, esc, $, buildDayChips, getSelectedDays,
    to12, to24, formatTime12Ar, setTime12, getTime24, initTime12Pickers,
  };
})();
