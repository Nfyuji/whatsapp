const { api, toast, esc, $, buildDayChips, getSelectedDays } = WAApp;

async function loadEmployees() {
  const { employees } = await api("/api/employees");
  const el = $("#emp-list");
  if (!employees.length) {
    el.innerHTML = "<p class='empty'>أضف موظفاً برقم WhatsApp</p>";
    return;
  }
  el.innerHTML = employees.map((e) => `
    <div class="emp-row ${e.active ? "" : "inactive"}">
      <div class="avatar">${esc(e.name[0])}</div>
      <div style="flex:1">
        <strong>${esc(e.name)}</strong>
        <div class="muted">${esc(e.phone)} ${e.department ? "· " + esc(e.department) : ""}</div>
      </div>
      ${e.active ? `<button class="btn btn-danger btn-sm" data-del="${e.id}"><i class="fas fa-trash"></i></button>` : "<span class='muted'>معطّل</span>"}
    </div>`).join("");
  el.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("حذف الموظف؟")) return;
      await api(`/api/employees/${b.dataset.del}`, { method: "DELETE" });
      toast("تم الحذف");
      loadEmployees();
    };
  });
}

async function loadAll() {
  const { settings, green_api: ga } = await api("/api/settings");
  $("#enabled").checked = !!settings.enabled;
  $("#ask-hour").value = settings.ask_hour ?? 19;
  $("#ask-minute").value = settings.ask_minute ?? 0;
  $("#report-hour").value = settings.report_hour ?? 0;
  $("#report-minute").value = settings.report_minute ?? 0;
  $("#tz").value = settings.timezone_offset_hours ?? 3;
  $("#manager-phone").value = settings.manager_phone || "";
  $("#ask-msg").value = settings.ask_message || "";
  $("#thank-msg").value = settings.thank_message || "";
  $("#report-header").value = settings.manager_report_header || "";
  buildDayChips("days", settings.days_of_week);
  const g = ga?.green_api || {};
  $("#ga-instance").value = g.instance_id || "";
  $("#ga-token").value = g.api_token ? "••••••••" : "";
  $("#ga-host").value = g.api_host || "7107.api.greenapi.com";
  $("#ga-country").value = ga?.default_country_code || "967";
  $("#public-url").value = location.origin;
  const wh = settings.webhook_url || `${location.origin}/api/webhook/green`;
  $("#webhook-display").textContent = "Webhook: " + wh;
  await loadEmployees();
}

$("#emp-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api("/api/employees", {
      method: "POST",
      body: JSON.stringify({ name: f.name.value, phone: f.phone.value, department: f.department.value }),
    });
    toast("تمت الإضافة ✓");
    f.reset();
    loadEmployees();
  } catch (err) { toast(err.message, true); }
});

$("#save-settings")?.addEventListener("click", async () => {
  try {
    await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        enabled: $("#enabled").checked,
        ask_hour: +$("#ask-hour").value,
        ask_minute: +$("#ask-minute").value,
        report_hour: +$("#report-hour").value,
        report_minute: +$("#report-minute").value,
        timezone_offset_hours: +$("#tz").value,
        days_of_week: getSelectedDays("days"),
        manager_phone: $("#manager-phone").value.trim(),
        ask_message: $("#ask-msg").value.trim(),
        thank_message: $("#thank-msg").value.trim(),
        manager_report_header: $("#report-header").value.trim(),
      }),
    });
    toast("تم الحفظ ✓");
  } catch (e) { toast(e.message, true); }
});

$("#save-green")?.addEventListener("click", async () => {
  try {
    await api("/api/green-api", {
      method: "PUT",
      body: JSON.stringify({
        instance_id: $("#ga-instance").value.trim(),
        api_token: $("#ga-token").value.trim(),
        api_host: $("#ga-host").value.trim(),
        default_country_code: $("#ga-country").value.trim(),
        enabled: true,
      }),
    });
    toast("تم حفظ Green API ✓");
  } catch (e) { toast(e.message, true); }
});

$("#setup-webhook")?.addEventListener("click", async () => {
  try {
    const r = await api("/api/webhook/configure", {
      method: "POST",
      body: JSON.stringify({ public_base_url: $("#public-url").value.trim() || location.origin }),
    });
    toast("تم ضبط Webhook ✓");
    $("#webhook-display").textContent = "Webhook: " + r.webhook_url;
  } catch (e) { toast(e.message, true); }
});

loadAll().catch((e) => toast(e.message, true));
