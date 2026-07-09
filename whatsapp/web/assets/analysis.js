const { api, toast, $, renderStats, renderReportFeed } = WAApp;

async function load(date) {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  const d = await api(`/api/dashboard${q}`);
  renderStats(d, "#stats");
  renderReportFeed(d.rows, "#feed");
  $("#report-date").textContent = d.report_date;
  if ($("#date-filter") && !$("#date-filter").value) $("#date-filter").value = d.report_date;
}

$("#date-filter")?.addEventListener("change", (e) => load(e.target.value).catch((x) => toast(x.message, true)));
$("#btn-ask")?.addEventListener("click", async () => {
  $("#btn-ask").disabled = true;
  try {
    const r = await api("/api/run/ask", { method: "POST" });
    toast(r.skipped ? r.reason : `تم الإرسال لـ ${r.sent} موظف ✓`);
    await load($("#date-filter")?.value);
  } catch (e) { toast(e.message, true); }
  finally { $("#btn-ask").disabled = false; }
});

load().catch((e) => toast("شغّل السيرفر: python server.py — " + e.message, true));
