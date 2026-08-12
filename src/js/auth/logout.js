import { supabase } from "../config/supabase.js";
export function bindLogout() {
  document.querySelector("[data-logout]")?.addEventListener("click", async () => {
    await supabase.auth.signOut(); window.location.replace("login.html");
  });
}
