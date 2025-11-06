const BASE = import.meta.env.VITE_API_URL || "";

export async function logout() {
  await api("/auth/logout", { method: "POST" });
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit & { json?: Record<string, unknown> } = {}
): Promise<T> {
  const headers: HeadersInit = {
    "Accept": "application/json",
    ...(opts.json ? { "Content-Type": "application/json" } : {}),
    ...opts.headers,
  };

  const res = await fetch(BASE + path, {
    method: opts.method || (opts.json ? "POST" : "GET"),
    credentials: "include", // allow cookies
    headers,
    body: opts.json ? JSON.stringify(opts.json) : opts.body,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "error" in data && (data as any).error) ||
      res.statusText ||
      "Request failed";
    throw new Error(msg);
  }
  return data as T;
}
