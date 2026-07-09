/* Shell — نفس تصميم الداشبورد الرئيسي */
(function () {
  const NAV = [
    { panel: "overview", icon: "fa-th-large", label: "الرئيسية" },
    { panel: "employees", icon: "fa-users", label: "الموظفون" },
    { panel: "reports", icon: "fa-chart-line", label: "التقارير" },
    { panel: "settings", icon: "fa-cog", label: "الإعدادات" },
  ];

  function buildNav(active) {
    return NAV.map((n) =>
      `<button type="button" class="nav-item${n.panel === active ? " active" : ""}" data-panel="${n.panel}">
        <i class="fas ${n.icon}"></i> ${n.label}
      </button>`
    ).join("");
  }

  function getInitialPanel() {
    const hash = (location.hash || "").replace("#", "");
    if (NAV.some((n) => n.panel === hash)) return hash;
    const path = location.pathname.replace(/^\//, "").toLowerCase();
    const fromPath = {
      "settings.html": "settings",
      "reports.html": "reports",
      "analysis.html": "overview",
    };
    return fromPath[path] || "overview";
  }

  function showPanel(id) {
    if (!NAV.some((n) => n.panel === id)) id = "overview";
    document.body.dataset.page = id;
    document.querySelectorAll(".dash-panel").forEach((p) => {
      p.classList.toggle("active", p.dataset.panel === id);
    });
    document.querySelectorAll(".nav-item[data-panel]").forEach((a) => {
      a.classList.toggle("active", a.dataset.panel === id);
    });
    history.replaceState(null, "", id === "overview" ? "/" : `/#${id}`);
    window.dispatchEvent(new CustomEvent("wa-panel", { detail: id }));
    document.getElementById("sidebar")?.classList.remove("open");
  }

  function mount() {
    const main = document.getElementById("page-main");
    if (!main) return;

    const initial = getInitialPanel();

    const app = document.createElement("div");
    app.className = "app";
    app.innerHTML = `
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <div class="brand-logo"><i class="fab fa-whatsapp"></i></div>
          <div>
            <h1>تقارير <span class="text-gradient">واتس</span></h1>
            <p>Green API · تقارير يومية</p>
          </div>
        </div>
        <nav class="nav">${buildNav(initial)}</nav>
        <div class="usage-card wa-side-card">
          <div class="usage-head">
            <span><i class="fas fa-mosque"></i> التوقيت</span>
            <span id="side-tz">مكة</span>
          </div>
          <p><i class="fas fa-clock"></i> <span id="side-now">—</span></p>
          <p class="muted" style="font-size:0.72rem;margin-top:0.35rem"><i class="fab fa-whatsapp"></i> نظام مستقل للمؤسسة</p>
        </div>
      </aside>
      <div class="main-wrap">
        <header class="header">
          <div class="header-search">
            <i class="fas fa-search"></i>
            <input type="search" id="global-search" placeholder="بحث في الموظفين والتقارير..." />
          </div>
          <div class="header-actions">
            <button type="button" class="btn-primary" id="hdr-ask"><i class="fas fa-paper-plane"></i> <span>إرسال السؤال</span></button>
            <div class="theme-toggle" id="themeToggle" title="وضع ليلي / نهاري">
              <div class="toggle-ball" id="toggleBall"><i class="fas fa-moon" id="themeIcon"></i></div>
            </div>
            <div class="user-chip">
              <div class="avatar"><i class="fas fa-building"></i></div>
              <div>
                <div class="user-name">لوحة التحكم</div>
                <div class="user-plan">WhatsApp Reports</div>
              </div>
            </div>
            <button class="mobile-toggle" id="mobileToggle" type="button" title="القائمة">
              <i class="fas fa-bars"></i>
            </button>
          </div>
        </header>
        <div id="page-slot"></div>
      </div>`;

    app.querySelector("#page-slot").appendChild(main);
    document.body.insertBefore(app, document.body.firstChild);

    app.querySelectorAll(".nav-item[data-panel]").forEach((btn) => {
      btn.addEventListener("click", () => showPanel(btn.dataset.panel));
    });

    document.querySelectorAll("[data-goto]").forEach((el) => {
      el.addEventListener("click", () => showPanel(el.dataset.goto));
    });

    document.getElementById("hdr-ask")?.addEventListener("click", () => {
      document.getElementById("btn-ask")?.click();
    });

    showPanel(initial);

    window.addEventListener("hashchange", () => {
      const id = getInitialPanel();
      if (id !== document.body.dataset.page) showPanel(id);
    });
  }

  window.WALayout = { showPanel };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
