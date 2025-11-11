// frontend/src/lib/api.ts
const BASE = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

type ApiOptions = RequestInit & { json?: Record<string, unknown> };

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const url = `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  const headers: HeadersInit = {
    Accept: "application/json",
    ...(opts.json ? { "Content-Type": "application/json" } : {}),
    ...opts.headers,
  };

  const res = await fetch(url, {
    method: opts.method ?? (opts.json ? "POST" : "GET"),
    credentials: "include",
    headers,
    body: opts.json ? JSON.stringify(opts.json) : opts.body,
    signal: opts.signal,
  });

  // Handle 204 No Content early
  if (res.status === 204) return undefined as unknown as T;

  const ct = res.headers.get("content-type") ?? "";

  // Prefer JSON when declared as such
  if (ct.includes("application/json")) {
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        (data && typeof data === "object" && "error" in data && (data as any).error) ||
        res.statusText ||
        "Request failed";
      throw new Error(String(msg));
    }
    return data as T;
  }

  // Not JSON -> read text and error
  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText || "Request failed");
  throw new Error("API did not return JSON");
}

export async function logout() {
  await api("/auth/logout", { method: "POST" });
}
