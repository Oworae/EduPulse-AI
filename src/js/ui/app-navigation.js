const destinations = [
  { href: "dashboard.html", label: "Home", icon: "⌂", pages: ["dashboard.html"] },
  { href: "courses.html", label: "Courses", icon: "▤", pages: ["courses.html", "course.html", "attendance.html"] },
  { href: "checkin.html", label: "Check-in", icon: "✓", pages: ["checkin.html"] },
  { href: "insights.html", label: "Insights", icon: "◒", pages: ["insights.html", "semester-review.html"] },
  { href: "assistant.html", label: "Coach", icon: "✦", pages: ["assistant.html"] },
];

function currentPage() {
  return location.pathname.split("/").pop() || "dashboard.html";
}

export function setupAppNavigation() {
  const header = document.querySelector(".dash-header");
  const logout = document.querySelector("[data-logout]");
  if (!header || !logout || document.querySelector(".mobile-tab-bar")) return;

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
  logout.className = "account-signout";
  logout.textContent = "Sign out";
  menu.append(logout);
  account.append(trigger, menu);
  header.append(account);

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

  const activePage = currentPage();
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
