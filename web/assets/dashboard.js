(function () {
  const { api, toast, esc, $, buildDayChips, getSelectedDays, setTime12, getTime24, initTime12Pickers } = WAApp;

  let state = { dash: null, employees: [], dates: [], date: "", cal: { empId: null, year: null, month: null, days: [] } };

  const DOW = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

  function rowStatus(r) {
    if (r.reply_text) return { cls: "ok", text: "مكتمل", icon: "fa-check", item: "replied" };
    if (r.awaiting_detail) return { cls: "detail", text: "بانتظار التفصيل", icon: "fa-list", item: "detail" };
    if (r.question_sent) return { cls: "wait", text: "انتظار", icon: "fa-clock", item: "pending" };
    return { cls: "none", text: "لم يُسأل", icon: "fa-minus", item: "missing" };
  }

  function renderStats(d, containerId) {
    const el = $(containerId);
    if (!el) return;
    const cards = [
      { cls: "blue", icon: "fa-users", label: "الموظفون", value: d.employees_total },
      { cls: "green", icon: "fa-paper-plane", label: "أُرسل لهم", value: d.asked_count },
      { cls: "green", icon: "fa-reply", label: "ردّوا", value: d.replied_count },
      { cls: "orange", icon: "fa-percent", label: "نسبة الرد", value: `${d.reply_rate || 0}%` },
      { cls: "wait", icon: "fa-hourglass-half", label: "بانتظار", value: d.pending_count },
    ];
    el.innerHTML = cards.map((c) => `
      <div class="stat-card">
        <div class="stat-icon ${c.cls}"><i class="fas ${c.icon}"></i></div>
        <div><div class="stat-label">${c.label}</div><div class="stat-value">${esc(String(c.value))}</div></div>
      </div>`).join("");
    const rd = $("#report-date");
    if (rd) rd.textContent = d.report_date || "—";
  }

  function renderStatus(st) {
    const el = $("#status-row");
    if (!el || !st) return;
    const items = [
      { ok: st.green_api, label: "Green API", icon: "fa-plug" },
      { ok: st.webhook, label: "Webhook", icon: "fa-link" },
      { ok: st.scheduler, label: "الجدولة", icon: "fa-clock" },
      { ok: st.employees_count > 0, label: `${st.employees_count} موظف`, icon: "fa-users" },
    ];
    el.innerHTML = items.map((i) => `
      <div class="status-pill ${i.ok ? "on" : "off"}">
        <i class="fas ${i.icon}"></i> ${esc(i.label)}
        <i class="fas ${i.ok ? "fa-check-circle" : "fa-exclamation-circle"}"></i>
      </div>`).join("");
  }

  function renderScheduleSummary(sched) {
    if (!sched) return;
    const now = sched.now_local || "—";
    const nl = $("#now-local");
    if (nl) nl.textContent = now;
    const side = $("#side-now");
    if (side) side.textContent = now;
    const sl = $("#schedule-lines");
    if (!sl) return;
    const status = sched.enabled
      ? '<span class="badge badge-ok"><i class="fas fa-check"></i> الجدولة مفعّلة</span>'
      : '<span class="badge badge-wait"><i class="fas fa-pause"></i> الجدولة متوقفة</span>';
    const days = (sched.days || []).join(" · ") || "كل الأيام";
    sl.innerHTML = `
      ${status}
      <div class="sched-line"><i class="fas fa-paper-plane"></i> سؤال الموظفين: <strong>${esc(sched.ask_time)}</strong></div>
      <div class="sched-line"><i class="fas fa-chart-bar"></i> تقرير المدير: <strong>${esc(sched.report_time)}</strong></div>
      <div class="sched-line muted"><i class="fas fa-calendar-week"></i> ${esc(days)}</div>`;
  }

  function renderFeed(rows, containerId, limit) {
    const el = $(containerId);
    if (!el) return;
    const list = limit ? (rows || []).slice(0, limit) : (rows || []);
    if (!list.length) {
      el.innerHTML = '<p class="empty"><i class="fas fa-inbox"></i> لا بيانات — أضف موظفين وأرسل السؤال</p>';
      return;
    }
    el.innerHTML = list.map((r) => {
      const st = rowStatus(r);
      const badgeCls = st.cls === "ok" ? "ok" : st.cls === "wait" ? "wait" : st.cls === "detail" ? "detail" : "";
      return `
        <div class="report-item ${st.item}">
          <div class="avatar">${esc((r.employee_name || "?")[0])}</div>
          <div>
            <strong>${esc(r.employee_name)}</strong>
            <div class="muted"><i class="fab fa-whatsapp"></i> ${esc(r.phone || "")}</div>
            ${r.reply_text ? `<div class="reply-box">${esc(r.reply_text)}</div>` : r.first_reply_text ? `<div class="reply-box muted">رد أولي: ${esc(r.first_reply_text)}</div><p class="muted">بانتظار التفصيل الكامل...</p>` : r.question_sent ? '<p class="muted">بانتظار الرد...</p>' : ""}
          </div>
          <span class="badge badge-${badgeCls}"><i class="fas ${st.icon}"></i> ${st.text}</span>
        </div>`;
    }).join("");
  }

  function empTodayStatus(empId) {
    const r = (state.dash?.rows || []).find((x) => x.employee_id === empId);
    if (!r) return { cls: "none", text: "—" };
    return rowStatus(r);
  }

  function renderEmployeesTable(filter) {
    const q = (filter || "").trim().toLowerCase();
    const list = state.employees.filter((e) => {
      if (!e.active) return false;
      if (!q) return true;
      return (e.name || "").toLowerCase().includes(q) || (e.phone || "").includes(q) || (e.department || "").toLowerCase().includes(q);
    });
    $("#emp-count").textContent = `${state.employees.filter((e) => e.active).length} موظف`;
    const tbody = $("#emp-tbody");
    const empty = $("#emp-empty");
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = "";
      empty?.classList.remove("hidden");
      return;
    }
    empty?.classList.add("hidden");
    tbody.innerHTML = list.map((e) => {
      const st = empTodayStatus(e.id);
      return `
        <tr>
          <td><div class="emp-cell"><div class="avatar sm">${esc(e.name[0])}</div><strong>${esc(e.name)}</strong></div></td>
          <td dir="ltr">${esc(e.phone)}</td>
          <td>${esc(e.department || "—")}</td>
          <td><span class="badge badge-${st.cls === "ok" ? "ok" : st.cls === "wait" ? "wait" : st.cls === "detail" ? "detail" : ""}">${esc(st.text)}</span></td>
          <td class="emp-actions">
            <button type="button" class="btn btn-outline btn-sm" data-cal="${e.id}" title="التقويم"><i class="fas fa-calendar"></i></button>
            <button type="button" class="btn btn-outline btn-sm" data-ask="${e.id}" title="إرسال سؤال"><i class="fas fa-paper-plane"></i></button>
            <button type="button" class="btn btn-outline btn-sm" data-edit="${e.id}" title="تعديل"><i class="fas fa-pen"></i></button>
            <button type="button" class="btn btn-danger btn-sm" data-del="${e.id}" title="حذف"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`;
    }).join("");

    tbody.querySelectorAll("[data-del]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("حذف الموظف؟")) return;
        await api(`/api/employees/${b.dataset.del}`, { method: "DELETE" });
        toast("تم الحذف ✓");
        await refresh(state.date);
      };
    });
    tbody.querySelectorAll("[data-edit]").forEach((b) => {
      b.onclick = () => openEditModal(b.dataset.edit);
    });
    tbody.querySelectorAll("[data-ask]").forEach((b) => {
      b.onclick = async () => {
        try {
          const r = await api(`/api/run/ask/${b.dataset.ask}`, { method: "POST" });
          toast(`تم إرسال السؤال لـ ${r.employee || "الموظف"} ✓`);
          await refresh(state.date);
        } catch (e) { toast(e.message, true); }
      };
    });
    tbody.querySelectorAll("[data-cal]").forEach((b) => {
      b.onclick = () => openCalendar(b.dataset.cal);
    });
  }

  function updatePdfLink() {
    const a = $("#btn-pdf");
    if (a && state.date) {
      a.href = `/api/reports/pdf?date=${encodeURIComponent(state.date)}`;
      a.download = `report-${state.date}.pdf`;
    }
  }

  async function openCalendar(empId) {
    state.cal.empId = empId;
    const sel = $("#cal-emp-select");
    if (sel) sel.value = empId;
    WALayout?.showPanel("employees");
    const now = new Date();
    await loadCalendar(empId, now.getFullYear(), now.getMonth() + 1);
    $("#sec-calendar")?.scrollIntoView({ behavior: "smooth" });
  }

  async function loadCalendar(empId, year, month) {
    const wrap = $("#cal-wrap");
    if (!wrap || !empId) return;
    wrap.innerHTML = '<p class="muted"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</p>';
    try {
      const data = await api(`/api/employees/${empId}/calendar?year=${year}&month=${month}`);
      state.cal = { empId, year, month, days: data.days, employee: data.employee };
      renderCalendar();
    } catch (e) {
      wrap.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
    }
  }

  function renderCalendar() {
    const wrap = $("#cal-wrap");
    const { year, month, days, employee } = state.cal;
    if (!wrap || !days?.length) return;

    const firstWd = days[0].weekday;
    let cells = DOW.map((d) => `<div class="cal-dow">${d}</div>`).join("");
    for (let i = 0; i < firstWd; i++) cells += '<div class="cal-day empty"></div>';
    days.forEach((d) => {
      cells += `<button type="button" class="cal-day ${d.status}${state.cal.selected === d.date ? " selected" : ""}" data-date="${d.date}">
        ${d.day}${d.status !== "none" ? '<span class="dot"></span>' : ""}
      </button>`;
    });

    wrap.innerHTML = `
      <div class="cal-head">
        <button type="button" class="btn btn-outline btn-sm" id="cal-prev"><i class="fas fa-chevron-right"></i></button>
        <div class="cal-title">${esc(employee?.name || "")} — ${year}/${String(month).padStart(2, "0")}</div>
        <button type="button" class="btn btn-outline btn-sm" id="cal-next"><i class="fas fa-chevron-left"></i></button>
      </div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-legend">
        <span><i style="background:#6ee7b7"></i> رد مكتمل</span>
        <span><i style="background:#93c5fd"></i> بانتظار التفصيل</span>
        <span><i style="background:#fcd34d"></i> بانتظار رد</span>
        <span><i style="background:#e2e8f0"></i> لا سجل</span>
      </div>
      <div class="cal-detail" id="cal-detail"><p class="muted">اضغط على يوم لعرض التفاصيل</p></div>`;

    wrap.querySelectorAll(".cal-day[data-date]").forEach((btn) => {
      btn.onclick = () => showCalDay(btn.dataset.date);
    });
    $("#cal-prev").onclick = () => {
      let y = year, m = month - 1;
      if (m < 1) { m = 12; y--; }
      loadCalendar(state.cal.empId, y, m);
    };
    $("#cal-next").onclick = () => {
      let y = year, m = month + 1;
      if (m > 12) { m = 1; y++; }
      loadCalendar(state.cal.empId, y, m);
    };
  }

  function showCalDay(date) {
    state.cal.selected = date;
    const d = state.cal.days.find((x) => x.date === date);
    const el = $("#cal-detail");
    const wrap = $("#cal-wrap");
    wrap?.querySelectorAll(".cal-day.selected").forEach((x) => x.classList.remove("selected"));
    wrap?.querySelector(`.cal-day[data-date="${date}"]`)?.classList.add("selected");
    if (!el || !d) return;
    const labels = { replied: "رد مكتمل", detail: "بانتظار التفصيل", pending: "بانتظار رد", none: "لا سجل" };
    el.innerHTML = `
      <h4><i class="fas fa-calendar-day"></i> ${esc(date)} — ${labels[d.status] || ""}</h4>
      ${d.reply_text ? `<pre>${esc(d.reply_text)}</pre>` : d.first_reply_text ? `<p class="muted">رد أولي:</p><pre>${esc(d.first_reply_text)}</pre>` : '<p class="muted">لا يوجد رد في هذا اليوم</p>'}`;
  }

  function fillEmpCalendarSelect() {
    const sel = $("#cal-emp-select");
    if (!sel) return;
    const active = state.employees.filter((e) => e.active);
    sel.innerHTML = '<option value="">— اختر موظف —</option>' + active.map((e) =>
      `<option value="${e.id}">${esc(e.name)}</option>`).join("");
  }

  function openEditModal(id) {
    const emp = state.employees.find((e) => e.id === id);
    if (!emp) return;
    const f = $("#emp-edit-form");
    f.id.value = emp.id;
    f.name.value = emp.name;
    f.phone.value = emp.phone;
    f.department.value = emp.department || "";
    f.active.checked = !!emp.active;
    $("#emp-modal").classList.remove("hidden");
  }

  function closeModal() {
    $("#emp-modal")?.classList.add("hidden");
  }

  function fillSettings(settings, ga) {
    $("#enabled").checked = !!settings.enabled;
    initTime12Pickers();
    setTime12("ask", settings.ask_hour ?? 19, settings.ask_minute ?? 0);
    setTime12("report", settings.report_hour ?? 0, settings.report_minute ?? 0);
    $("#manager-phone").value = settings.manager_phone || "";
    $("#company-name").value = settings.company_name || "";
    $("#ask-msg").value = settings.ask_message || "";
    $("#follow-up-enabled").checked = settings.follow_up_enabled !== false;
    $("#follow-up-msg").value = settings.follow_up_message || "";
    $("#thank-msg").value = settings.thank_message || "";
    $("#report-header").value = settings.manager_report_header || "";
    buildDayChips("days", settings.days_of_week);
    const g = ga?.green_api || {};
    $("#ga-instance").value = g.instance_id || "";
    $("#ga-token").value = g.has_token ? "••••••••" : "";
    $("#ga-token").placeholder = g.has_token ? "اتركه أو الصق توكن جديد" : "الصق API Token كاملاً هنا";
    $("#ga-host").value = g.api_host || "7107.api.greenapi.com";
    $("#ga-country").value = ga?.default_country_code || "967";
    if (!$("#public-url").value) $("#public-url").value = location.origin;
    const wh = settings.webhook_url || `${location.origin}/api/webhook/green`;
    $("#webhook-display").textContent = "Webhook: " + wh;
  }

  function renderDates() {
    const sel = $("#date-select");
    const chips = $("#dates-list");
    if (sel) {
      sel.innerHTML = state.dates.length
        ? state.dates.map((d) => `<option value="${d}"${d === state.date ? " selected" : ""}>${d}</option>`).join("")
        : `<option value="${state.date}">${state.date}</option>`;
    }
    if (chips) {
      chips.innerHTML = state.dates.length
        ? state.dates.slice(0, 14).map((d) =>
            `<button type="button" class="date-chip${d === state.date ? " active" : ""}" data-d="${d}">${d}</button>`).join("")
        : `<span class="muted">لا سجلات سابقة</span>`;
      chips.querySelectorAll("[data-d]").forEach((b) => {
        b.onclick = () => refresh(b.dataset.d);
      });
    }
    const df = $("#date-filter");
    if (df && state.date) df.value = state.date;
  }

  async function refresh(date) {
    const q = date ? `?date=${encodeURIComponent(date)}` : "";
    const [dash, settingsRes, preview, datesRes, empRes] = await Promise.all([
      api(`/api/dashboard${q}`),
      api("/api/settings"),
      api(`/api/reports/preview${q}`),
      api("/api/reports/dates"),
      api("/api/employees"),
    ]);
    state.dash = dash;
    state.date = dash.report_date;
    state.employees = empRes.employees || [];
    state.dates = datesRes.dates || [];

    renderStats(dash, "#stats");
    renderStats(dash, "#stats-reports");
    renderStatus(dash.status);
    renderScheduleSummary(dash.schedule);
    renderFeed(dash.rows, "#feed");
    renderFeed(dash.rows, "#feed-overview", 5);
    fillSettings(settingsRes.settings, settingsRes.green_api);
    renderEmployeesTable($("#emp-search")?.value);
    fillEmpCalendarSelect();
    updatePdfLink();
    renderDates();
    const prev = $("#preview");
    if (prev) prev.textContent = preview.text || "—";
    $("#conn-status")?.classList.remove("hidden");
  }

  $("#emp-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api("/api/employees", {
        method: "POST",
        body: JSON.stringify({ name: f.name.value.trim(), phone: f.phone.value.trim(), department: f.department.value.trim() }),
      });
      toast("تمت الإضافة ✓");
      f.reset();
      await refresh(state.date);
    } catch (err) { toast(err.message, true); }
  });

  $("#emp-edit-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api(`/api/employees/${f.id.value}`, {
        method: "PUT",
        body: JSON.stringify({
          name: f.name.value.trim(),
          phone: f.phone.value.trim(),
          department: f.department.value.trim(),
          active: f.active.checked,
        }),
      });
      toast("تم التحديث ✓");
      closeModal();
      await refresh(state.date);
    } catch (err) { toast(err.message, true); }
  });

  $("#emp-search")?.addEventListener("input", (e) => renderEmployeesTable(e.target.value));

  $("#global-search")?.addEventListener("input", (e) => {
    const q = e.target.value.trim();
    if (!q) return;
    WALayout?.showPanel("employees");
    const empSearch = $("#emp-search");
    if (empSearch) empSearch.value = q;
    renderEmployeesTable(q);
  });

  $("#save-settings")?.addEventListener("click", async () => {
    const btn = $("#save-settings");
    btn.disabled = true;
    try {
      const askT = getTime24("ask");
      const reportT = getTime24("report");
      await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          enabled: $("#enabled").checked,
          ask_hour: askT.hour,
          ask_minute: askT.minute,
          report_hour: reportT.hour,
          report_minute: reportT.minute,
          timezone_offset_hours: 3,
          days_of_week: getSelectedDays("days"),
          manager_phone: $("#manager-phone").value.trim(),
          company_name: $("#company-name").value.trim(),
          ask_message: $("#ask-msg").value.trim(),
          follow_up_enabled: $("#follow-up-enabled").checked,
          follow_up_message: $("#follow-up-msg").value.trim(),
          thank_message: $("#thank-msg").value.trim(),
          manager_report_header: $("#report-header").value.trim(),
        }),
      });
      toast("تم حفظ الإعدادات ✓");
      await refresh(state.date);
    } catch (e) { toast(e.message, true); }
    finally { btn.disabled = false; }
  });

  $("#save-green")?.addEventListener("click", async () => {
    const btn = $("#save-green");
    const token = $("#ga-token").value.trim();
    const instance = $("#ga-instance").value.trim();
    if (!instance) {
      toast("أدخل Instance ID", true);
      return;
    }
    if (!token || token.includes("•")) {
      const has = state.dash?.status?.green_api;
      if (!has) {
        toast("الصق API Token كاملاً (ليس النقاط) ثم احفظ", true);
        $("#ga-token").value = "";
        $("#ga-token").focus();
        return;
      }
    }
    btn.disabled = true;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    try {
      const r = await api("/api/green-api", {
        method: "PUT",
        body: JSON.stringify({
          instance_id: instance,
          api_token: token,
          api_host: $("#ga-host").value.trim(),
          default_country_code: $("#ga-country").value.trim(),
          enabled: true,
        }),
      });
      toast(r.message || "تم حفظ Green API ✓");
      $("#ga-token").value = "••••••••";
      await refresh(state.date);
    } catch (e) {
      toast(e.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  });

  $("#setup-webhook")?.addEventListener("click", async () => {
    const btn = $("#setup-webhook");
    const base = $("#public-url").value.trim() || location.origin;
    if (!base.startsWith("http")) {
      toast("رابط السيرفر غير صحيح", true);
      return;
    }
    btn.disabled = true;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الضبط...';
    try {
      const r = await api("/api/webhook/configure", {
        method: "POST",
        body: JSON.stringify({ public_base_url: base }),
      });
      toast("تم ضبط Webhook ✓");
      $("#webhook-display").textContent = "Webhook: " + (r.webhook_url || "");
      await refresh(state.date);
    } catch (e) {
      toast(e.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  });

  async function runAskAll() {
    if (!confirm("إرسال السؤال فوراً لجميع الموظفين؟")) return;
    const btn = $("#btn-ask");
    btn.disabled = true;
    try {
      const r = await api("/api/run/ask", { method: "POST" });
      toast(r.skipped ? (r.reason || "تم تخطي") : `تم الإرسال لـ ${r.sent || 0} موظف ✓`);
      await refresh(state.date);
    } catch (e) { toast(e.message, true); }
    finally { btn.disabled = false; }
  }

  async function runReport() {
    const btn = $("#btn-report") || $("#btn-send-report");
    if (btn) btn.disabled = true;
    try {
      const q = state.date ? `?date=${encodeURIComponent(state.date)}` : "";
      const r = await api(`/api/run/report${q}`, { method: "POST" });
      toast(r.skipped ? (r.reason || "تم تخطي") : "تم إرسال التقرير للمدير ✓");
      await refresh(state.date);
    } catch (e) { toast(e.message, true); }
    finally { if (btn) btn.disabled = false; }
  }

  $("#btn-ask")?.addEventListener("click", runAskAll);
  $("#btn-report")?.addEventListener("click", runReport);
  $("#btn-send-report")?.addEventListener("click", runReport);
  $("#btn-refresh-report")?.addEventListener("click", () => refresh(state.date).catch((e) => toast(e.message, true)));
  $("#date-filter")?.addEventListener("change", (e) => refresh(e.target.value).catch((x) => toast(x.message, true)));
  $("#date-select")?.addEventListener("change", (e) => refresh(e.target.value).catch((x) => toast(x.message, true)));
  $("#modal-close")?.addEventListener("click", closeModal);
  $("#modal-cancel")?.addEventListener("click", closeModal);
  $("#emp-modal")?.addEventListener("click", (e) => { if (e.target.id === "emp-modal") closeModal(); });

  window.addEventListener("wa-panel", () => refresh(state.date).catch(() => {}));

  $("#cal-emp-select")?.addEventListener("change", (e) => {
    if (e.target.value) openCalendar(e.target.value);
  });

  $("#public-url").value = location.origin;
  initTime12Pickers();
  refresh().catch((e) => toast("تعذر الاتصال بالسيرفر: " + e.message, true));
})();
