import { supabase } from "../config/supabase.js";
import { setupAppNavigation } from "../ui/app-navigation.js?v=20260812-nav";
setupAppNavigation();
export function bindLogout() {
  document.querySelector("[data-logout]")?.addEventListener("click", async () => {
    await supabase.auth.signOut(); window.location.replace("login.html");
  });
}
