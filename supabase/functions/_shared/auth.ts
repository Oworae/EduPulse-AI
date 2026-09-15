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
export async function requireAuth(
  req: Request,
  signal?: AbortSignal,
): Promise<AuthContext> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Authentication required: missing session");
  }
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) {
    throw new Error("Server configuration is incomplete");
  }
  const requestFetch: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      signal: signal && init?.signal
        ? AbortSignal.any([signal, init.signal])
        : signal ?? init?.signal,
    });
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authorization }, fetch: requestFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    throw new Error("Authentication required: invalid or expired session");
  }
  const { data: activeSession, error: sessionError } = await userClient.rpc(
    "is_app_session_active",
  );
  if (sessionError || activeSession !== true) {
    throw new Error("Authentication required: invalid or expired session");
  }
  const adminClient = createClient(url, service, {
    global: { fetch: requestFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { user: data.user, userClient, adminClient };
}

export async function requireActiveSession(userClient: SupabaseClient) {
  const { data, error } = await userClient.rpc("is_app_session_active");
  if (error || data !== true) {
    throw new Error("Authentication required: invalid or expired session");
  }
}
