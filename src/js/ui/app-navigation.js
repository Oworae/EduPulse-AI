const destinations = [
  { href: "dashboard.html", label: "Home", icon: '<svg viewBox="0 0 24 24"><path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/></svg>', pages: ["dashboard.html"] },
  { href: "courses.html", label: "Courses", icon: '<svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 0 1 3 3v13H7a2 2 0 0 1-2-2Zm0 0v14m2-2h12"/></svg>', pages: ["courses.html", "course.html", "attendance.html"] },
  { href: "checkin.html", label: "Check-in", icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18m-13 5 2.5 2.5L16 12"/></svg>', pages: ["checkin.html"] },
  { href: "insights.html", label: "Insights", icon: '<svg viewBox="0 0 24 24"><path d="M4 19V9m6 10V5m6 14v-7m5 7H2"/></svg>', pages: ["insights.html", "semester-review.html"] },
  { href: "assistant.html", label: "Coach", icon: '<svg viewBox="0 0 24 24"><path d="M12 3a7 7 0 0 0-7 7v3a4 4 0 0 0 4 4h1m2-14a7 7 0 0 1 7 7v3a4 4 0 0 1-4 4h-1m-4 3h4"/></svg>', pages: ["assistant.html"] },
];

function currentPage() {
  return location.pathname.split("/").pop() || "dashboard.html";
}

export function setupAppNavigation() {
  const header = document.querySelector(".dash-header");
  if (!header || document.querySelector(".mobile-tab-bar")) return;
  const activePage = currentPage();

  const desktopNav = document.createElement("nav");
  desktopNav.className = "desktop-app-nav";
  desktopNav.setAttribute("aria-label", "Primary navigation");
  for (const destination of destinations) {
    const link = document.createElement("a");
    link.href = destination.href;
    link.textContent = destination.label;
    if (destination.pages.includes(activePage)) {
      link.className = "active";
      link.setAttribute("aria-current", "page");
    }
    desktopNav.append(link);
  }

  const account = document.createElement("div");
  account.className = "account-control";
  const trigger = document.createElement("button");
  trigger.className = "account-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-label", "Open account menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.textContent = "Account";

  const menu = document.createElement("div");
  menu.className = "account-menu";
  menu.hidden = true;
  menu.innerHTML = '<a href="settings.html">Settings</a><a href="semesters.html">Semesters</a>';
  const logout = document.createElement("button");
  logout.type = "button";
  logout.dataset.logout = "";
  logout.className = "account-signout";
  logout.textContent = "Sign out";
  menu.append(logout);
  account.append(trigger, menu);
  if (["settings.html", "semesters.html"].includes(activePage)) account.classList.add("active");
  header.append(desktopNav, account);

  const closeMenu = () => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const opening = menu.hidden;
    menu.hidden = !opening;
    trigger.setAttribute("aria-expanded", String(opening));
  });
  document.addEventListener("click", (event) => {
    if (!account.contains(event.target)) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { closeMenu(); trigger.focus(); }
  });

  const mobileNav = document.createElement("nav");
  mobileNav.className = "mobile-tab-bar";
  mobileNav.setAttribute("aria-label", "Primary navigation");
  for (const destination of destinations) {
    const link = document.createElement("a");
    link.href = destination.href;
    link.className = destination.pages.includes(activePage) ? "active" : "";
    if (link.className) link.setAttribute("aria-current", "page");
    link.innerHTML = `<span aria-hidden="true">${destination.icon}</span><small>${destination.label}</small>`;
    mobileNav.append(link);
  }
  document.body.append(mobileNav);
}
