(function () {
  const KEY = "ai-theme";
  const root = document.documentElement;
  const saved = localStorage.getItem(KEY);
  if (saved === "dark") root.setAttribute("data-theme", "dark");

  function syncToggle() {
    const ball = document.getElementById("toggleBall");
    const icon = document.getElementById("themeIcon");
    const dark = root.getAttribute("data-theme") === "dark";
    if (ball) ball.style.transform = dark ? "translateX(-28px)" : "translateX(0)";
    if (icon) icon.className = dark ? "fas fa-sun" : "fas fa-moon";
  }

  document.getElementById("themeToggle")?.addEventListener("click", () => {
    const dark = root.getAttribute("data-theme") === "dark";
    if (dark) {
      root.removeAttribute("data-theme");
      localStorage.setItem(KEY, "light");
    } else {
      root.setAttribute("data-theme", "dark");
      localStorage.setItem(KEY, "dark");
    }
    syncToggle();
  });

  const mobileToggle = document.getElementById("mobileToggle");
  const sidebar = document.getElementById("sidebar");
  mobileToggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    sidebar?.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (window.innerWidth > 768 || !sidebar) return;
    if (!sidebar.contains(e.target) && e.target !== mobileToggle && !mobileToggle?.contains(e.target)) {
      sidebar.classList.remove("open");
    }
  });

  syncToggle();
})();
