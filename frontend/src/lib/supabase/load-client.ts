let cached:
  | Promise<typeof import("@/lib/supabase/client")>
  | undefined;

export function loadSupabaseClient() {
  cached ??= import("@/lib/supabase/client");
  return cached;
}
