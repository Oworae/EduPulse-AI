import { endSession } from "./session-manager.js";
import { setupAppNavigation } from "../ui/app-navigation.js?v=20260812-nav";
setupAppNavigation();
export function bindLogout() {
  document.querySelector("[data-logout]")?.addEventListener("click", (event) => {
    event.currentTarget.disabled = true;
    void endSession();
  });
}
