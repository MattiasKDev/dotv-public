(function () {
  "use strict";

  const navItems = [
    { key: "home", label: "Home", path: "" },
    { key: "scripts", label: "Scripts", path: "scripts/" },
    { key: "formation-optimizer", label: "Formation Optimizer", path: "formation-optimizer/" },
    { key: "item-browser", label: "Item Browser", path: "item-browser/" },
    { key: "leaderboards", label: "Leaderboards", path: "leaderboards/" },
  ];

  const header = document.querySelector("[data-site-header]");

  if (!header) {
    return;
  }

  const getSiteRoot = () => {
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const repoIndex = pathParts.indexOf("dotv-public");

    if (repoIndex !== -1) {
      return `/${pathParts.slice(0, repoIndex + 1).join("/")}/`;
    }

    return "/";
  };

  const getActiveKey = () => {
    const pathParts = window.location.pathname
      .replace(/\/index\.html$/, "")
      .split("/")
      .filter(Boolean);
    const match = navItems.find((item) => item.path && pathParts.includes(item.path.replace("/", "")));
    return match ? match.key : "home";
  };

  const siteRoot = getSiteRoot();
  const activeKey = getActiveKey();

  header.classList.add("site-header");
  header.innerHTML = `
    <div class="site-header-inner">
      <a class="site-brand" href="${siteRoot}" aria-label="DOTV Tools home">
        <span class="site-brand-mark">D</span>
        <span class="site-brand-text">
          <span class="site-brand-title">DOTV Tools</span>
          <span class="site-brand-subtitle">Dragons of the Void utilities</span>
        </span>
      </a>
      <button class="site-menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false" data-menu-toggle>Menu</button>
      <nav class="site-nav" aria-label="Primary navigation">
        ${navItems
          .map((item) => {
            const href = `${siteRoot}${item.path}`;
            const current = item.key === activeKey ? ' aria-current="page"' : "";
            return `<a class="site-nav-link" href="${href}"${current}>${item.label}</a>`;
          })
          .join("")}
      </nav>
    </div>
  `;

  const menuToggle = header.querySelector("[data-menu-toggle]");

  if (menuToggle && header) {
    menuToggle.addEventListener("click", () => {
      const isOpen = header.classList.toggle("is-menu-open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });

    header.querySelectorAll(".site-nav-link").forEach((link) => {
      link.addEventListener("click", () => {
        header.classList.remove("is-menu-open");
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });
  }
})();
