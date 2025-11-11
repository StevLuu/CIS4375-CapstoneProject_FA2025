// frontend/src/lib/api.ts
const BASE = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

type ApiOptions = RequestInit & { json?: Record<string, unknown> };

// Add an error type that preserves status for retry logic
export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

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

  if (res.status === 204) return undefined as unknown as T;

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        (data && typeof data === "object" && "error" in data && (data as any).error) ||
        res.statusText ||
        "Request failed";
      throw new ApiError(String(msg), res.status, data);
    }
    return data as T;
  }

  const text = await res.text();
  if (!res.ok) throw new ApiError(text || res.statusText || "Request failed", res.status, text);
  throw new ApiError("API did not return JSON", res.status, null);
}

export async function logout() {
  await api("/auth/logout", { method: "POST" });
}

/* ===== SKU utilities ===== */

// Keep letters only, uppercase, length 3 (pad with A)
export function clampSeed(seed: string): string {
  const only = String(seed ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
  return only.slice(0, 3).padEnd(3, "A");
}

// Format AAA0000 given seed and number
export function formatSku(seed: string, num: number): string {
  const s = clampSeed(seed);
  const n = Math.max(0, Math.trunc(num)) % 10000;
  return `${s}${n.toString().padStart(4, "0")}`;
}

// Generate SKU from optional seed and optional starting number
export function generateSku(opts?: { seed?: string; start?: number }): string {
  const seed = clampSeed(opts?.seed ?? "AAA");
  const start = Number.isFinite(opts?.start) ? Number(opts!.start) : 0;
  return formatSku(seed, start);
}

// Increment numeric part preserving AAA prefix; if not match, fall back to seed AAA.
export function nextSku(current: string): string {
  const m = /^([A-Z]{3})(\d{4})$/.exec(String(current ?? "").toUpperCase());
  if (!m) return formatSku("AAA", 1);

  const s = m[1] ?? "AAA";
  const n = m[2] ?? "0000";

  return formatSku(s, Number(n) + 1);
}

/* ===== Convenience: create item with auto-SKU + 409 retry ===== */

type CreateItemPayload = {
  sku?: string;
  item_name: string;
  description?: string | null;
  current_quantity?: number;
  price?: number | null;
  online_sale_price?: number | null;
  // any other allowed fields can be included
};

export async function createItemWithAutoSku(
  payload: CreateItemPayload,
  options?: {
    autoSku?: boolean;                 // default true
    seed?: string;                     // if not provided and autoSku true, derive from item_name
    start?: number;                    // starting number, default 0
    maxTries?: number;                 // default 5
  }
) {
  const autoSku = options?.autoSku !== false;
  const maxTries = options?.maxTries ?? 5;

  let body: CreateItemPayload = { ...payload };

  if (autoSku) {
    const seed =
      options?.seed ??
      clampSeed(payload.item_name || "AAA");
    const start = options?.start ?? 0;
    body.sku = body.sku && /^[A-Za-z]{3}\d{4}$/.test(body.sku)
      ? body.sku.toUpperCase()
      : generateSku({ seed, start });
  } else if (!body.sku) {
    throw new Error("SKU is required when autoSku is false");
  }

  for (let i = 0; i < maxTries; i++) {
    try {
      return await api("/items", {
        method: "POST",
        json: body as Record<string, unknown>,
      });
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409) {
        // conflict, bump SKU and retry
        body = { ...body, sku: nextSku(String(body.sku)) };
        continue;
      }
      throw e;
    }
  }

  // final attempt
  return await api("/items", {
    method: "POST",
    json: body as Record<string, unknown>,
  });
}
