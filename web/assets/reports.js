const { api, toast, esc, $ } = WAApp;

let currentDate = "";

async function loadPreview(date) {
  currentDate = date;
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  const p = await api(`/api/reports/preview${q}`);
  $("#preview").textContent = p.text || "—";
  if ($("#date-pick")) $("#date-pick").value = p.date;
}

async function loadDates() {
  const { dates } = await api("/api/reports/dates");
  const sel = $("#date-select");
  if (sel) {
    sel.innerHTML = dates.length
      ? dates.map((d) => `<option value="${d}">${d}</option>`).join("")
      : "<option value=''>—</option>";
    if (dates[0]) { sel.value = dates[0]; currentDate = dates[0]; }
  }
  $("#dates-list").innerHTML = dates.length
    ? dates.map((d) => `<button class="btn btn-outline" style="margin:0.25rem" data-d="${d}">${d}</button>`).join("")
    : "<span class='muted'>لا تقارير بعد</span>";
  document.querySelectorAll("#dates-list [data-d]").forEach((b) => {
    b.onclick = () => { loadPreview(b.dataset.d).catch((e) => toast(e.message, true)); };
  });
}

$("#date-select")?.addEventListener("change", (e) => loadPreview(e.target.value).catch((x) => toast(x.message, true)));
$("#date-pick")?.addEventListener("change", (e) => loadPreview(e.target.value).catch((x) => toast(x.message, true)));
$("#btn-refresh")?.addEventListener("click", () => loadPreview(currentDate || $("#date-pick")?.value).catch((e) => toast(e.message, true)));
$("#btn-send")?.addEventListener("click", async () => {
  const date = currentDate || $("#date-pick")?.value;
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  try {
    await api(`/api/run/report${q}`, { method: "POST" });
    toast("تم إرسال التقرير للمدير ✓");
  } catch (e) { toast(e.message, true); }
});

(async () => {
  try {
    await loadDates();
    await loadPreview($("#date-select")?.value || "");
  } catch (e) { toast(e.message, true); }
})();
