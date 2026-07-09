(function () {
  const NAV = [
    { panel: "overview", icon: "fa-gauge-high", label: "الرئيسية" },
    { panel: "employees", icon: "fa-users", label: "الموظفون" },
    { panel: "reports", icon: "fa-chart-line", label: "التقارير" },
    { panel: "settings", icon: "fa-cog", label: "الإعدادات" },
  ];

  function showPanel(id) {
    document.querySelectorAll(".dash-panel").forEach((p) => {
      p.classList.toggle("active", p.dataset.panel === id);
    });
    document.querySelectorAll(".nav-item[data-panel]").forEach((a) => {
      a.classList.toggle("active", a.dataset.panel === id);
    });
    history.replaceState(null, "", id === "overview" ? "/" : `/#${id}`);
    window.dispatchEvent(new CustomEvent("wa-panel", { detail: id }));
  }

  function mount() {
    const main = document.getElementById("page-main");
    if (!main) return;

    const hash = (location.hash || "").replace("#", "");
    const initial = NAV.some((n) => n.panel === hash) ? hash : "overview";

    const app = document.createElement("div");
    app.className = "app";
    app.innerHTML = `
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-icon"><i class="fab fa-whatsapp"></i></div>
          <div>
            <h1>تقارير واتس</h1>
            <p>لوحة تحكم شاملة</p>
          </div>
        </div>
        <nav>${NAV.map((n) =>
          `<button type="button" class="nav-item${n.panel === initial ? " active" : ""}" data-panel="${n.panel}">
            <i class="fas ${n.icon}"></i> ${n.label}
          </button>`).join("")}</nav>
        <div class="sidebar-foot muted"><i class="fas fa-mosque"></i> توقيت مكة المكرمة</div>
      </aside>
      <div class="main" id="page-slot"></div>`;

    app.querySelector("#page-slot").appendChild(main);
    document.body.insertBefore(app, document.body.firstChild);

    app.querySelectorAll(".nav-item[data-panel]").forEach((btn) => {
      btn.addEventListener("click", () => showPanel(btn.dataset.panel));
    });

    document.querySelectorAll("[data-goto]").forEach((el) => {
      el.addEventListener("click", () => showPanel(el.dataset.goto));
    });

    showPanel(initial);
  }

  window.WALayout = { showPanel };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
