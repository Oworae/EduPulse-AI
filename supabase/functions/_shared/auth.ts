import {
  createClient,
  type SupabaseClient,
  type User,
} from "npm:@supabase/supabase-js@2";

export type AuthContext = {
  user: User;
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
};
export async function requireAuth(req: Request): Promise<AuthContext> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Authentication required");
  }
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) {
    throw new Error("Server configuration is incomplete");
  }
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error("Invalid or expired session");
  const adminClient = createClient(url, service, {
    auth: { persistSession: false },
  });
  return { user: data.user, userClient, adminClient };
}
