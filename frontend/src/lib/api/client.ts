import ky, { type ResponsePromise } from "ky";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

export async function unwrap<T>(promise: ResponsePromise): Promise<T> {
  const res = await promise.json<ApiResponse<T>>();
  if (!res.success) throw new ApiError(res.error.code, res.error.message, res.error.details);
  return res.data;
}

async function getAuthToken(): Promise<string | null> {
  try {
    const { supabase } = await import("@/lib/supabase/client");
    const { data } = await supabase().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export const api = ky.create({
  prefix: BACKEND_URL,
  credentials: "include",
  hooks: {
    beforeRequest: [
      async ({ request }) => {
        const token = await getAuthToken();
        if (token) {
          request.headers.set("Authorization", `Bearer ${token}`);
        }
      },
    ],
    afterResponse: [
      async ({ response }) => {
        if (!response.ok) {
          const body = await response.clone().json().catch(() => null);
          if (body && typeof body === "object" && "error" in body) {
            const err = body as { error: { code: string; message: string; details?: unknown } };
            throw new ApiError(
              err.error.code,
              err.error.message,
              err.error.details,
            );
          }
        }
      },
    ],
  },
});
