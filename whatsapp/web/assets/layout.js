(function () {
  const NAV = [
    { page: "analysis", href: "/analysis.html", icon: "fa-chart-line", label: "التحليل" },
    { page: "reports", href: "/reports.html", icon: "fa-file-alt", label: "إصدار التقارير" },
    { page: "settings", href: "/settings.html", icon: "fa-cog", label: "الإعدادات" },
  ];

  function mount() {
    const main = document.getElementById("page-main");
    if (!main) return;
    const page = document.body.dataset.page || "analysis";
    const app = document.createElement("div");
    app.className = "app";
    app.innerHTML = `
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-icon"><i class="fab fa-whatsapp"></i></div>
          <div>
            <h1>تقارير واتس</h1>
            <p>نظام مستقل · Green API</p>
          </div>
        </div>
        <nav>${NAV.map((n) =>
          `<a class="nav-item${n.page === page ? " active" : ""}" href="${n.href}">
            <i class="fas ${n.icon}"></i> ${n.label}
          </a>`).join("")}</nav>
      </aside>
      <div class="main" id="page-slot"></div>`;
    app.querySelector("#page-slot").appendChild(main);
    document.body.insertBefore(app, document.body.firstChild);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
