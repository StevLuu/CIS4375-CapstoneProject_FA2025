// frontend/src/Page/Logs.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../Components/auth/useAuth";
import { LoginModal } from "../Components/auth/LoginModal";
import { api } from "../lib/api";

type LogRowLean = {
  log_id: number;
  timestamp: string; // ISO
  type: string;
  note: string | null;
};

type LogItem = {
  log_id: number;
  sku: string;
  user_id: number;
  quantity: number;
};

type LogRowWithItems = LogRowLean & {
  log_item: LogItem[];
};

type ApiList<T> = {
  logs: T[];
  nextCursor: number | null;
};

const PAGE_SIZE = 25;
const TYPE_FILTERS = ["All", "CSV Import", "Manual Update", "System Alert"];

export default function Logs() {
  const { loggedIn, user, refresh } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!loggedIn || !user?.email) setShowLogin(true);
  }, [loggedIn, user]);

  // UI filter
  const [typeFilter, setTypeFilter] = useState<string>("All");

  // Data
  const [rows, setRows] = useState<LogRowLean[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Detail expansion cache to fetch items only when needed
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [itemsCache, setItemsCache] = useState<Record<number, LogItem[]>>({});

  const abortRef = useRef<AbortController | null>(null);

  const serverTypeParam = useMemo(() => {
    return typeFilter === "All" ? "" : `&type=${encodeURIComponent(typeFilter)}`;
  }, [typeFilter]);

  const fetchPage = async (reset = false) => {
    setLoading(true);
    setError(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_SIZE));
      if (!reset && cursor) qs.set("cursor", String(cursor));
      // ask for lean projection without items; change to with_items=1 if you prefer eager details
      qs.set("with_items", "0");
      if (serverTypeParam) {
        // serverTypeParam starts with &type=..., so parse safely:
        const p = new URLSearchParams(serverTypeParam.replace(/^&/, ""));
        for (const [k, v] of p.entries()) qs.set(k, v);
      }

      const res = await fetch(`/logs?${qs.toString()}`, {
        method: "GET",
        credentials: "include",
        signal: ac.signal,
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const data = await api<ApiList<LogRowLean>>(`/logs?${qs.toString()}`, {
        signal: ac.signal,
      });

      setRows((prev) => (reset ? data.logs : [...prev, ...data.logs]));
      setCursor(data.nextCursor);
      setHasMore(Boolean(data.nextCursor));
    } catch (e: any) {
      if (e.name !== "AbortError") setError(e.message || "Request failed");
    } finally {
      setLoading(false);
    }
  };

  // initial and on filter change
  useEffect(() => {
    setCursor(null);
    setRows([]);
    setHasMore(true);
    setExpanded({});
    setItemsCache({});
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverTypeParam]);

  const loadMore = () => {
    if (!loading && hasMore) fetchPage(false);
  };

  const toggleExpand = async (log: LogRowLean) => {
    const open = !expanded[log.log_id];
    setExpanded((m) => ({ ...m, [log.log_id]: open }));

    if (open && !itemsCache[log.log_id]) {
      // fetch this single log with items only
      // Efficient option: call GET /logs?cursor=<id>&limit=1&with_items=1 with a where by id.
      // Since the route does not support by-id, do a focused fetch by cursor window of 1.
      const qs = new URLSearchParams();
      qs.set("limit", "1");
      qs.set("cursor", String(Number(log.log_id) - 1)); // position so this id becomes the first
      qs.set("with_items", "1");

      try {
        const res = await fetch(`/logs?${qs.toString()}`, {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ApiList<LogRowWithItems> = await res.json();
        const exact = data.logs.find((r) => r.log_id === log.log_id) as
          | LogRowWithItems
          | undefined;
        setItemsCache((m) => ({
          ...m,
          [log.log_id]: exact?.log_item ?? [],
        }));
      } catch {
        // fallback: mark as empty to avoid refetch storm
        setItemsCache((m) => ({ ...m, [log.log_id]: [] }));
      }
    }
  };

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={async () => {
          setShowLogin(false);
          await refresh();
          // refetch logs after login
          setRows([]);
          setCursor(null);
          setHasMore(true);
          fetchPage(true);
        }}
      />

      <h1 className="text-3xl font-semibold">System Logs</h1>
      <p className="text-neutral-500">
        Recent system activity, imports, and updates.
      </p>

      {/* Filter buttons */}
      <div className="flex gap-2 flex-wrap">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-4 py-2 rounded-xl border text-sm font-medium transition ${
              typeFilter === t
                ? "bg-indigo-600 text-white"
                : "hover:bg-neutral-100"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Log table */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold w-40">Time</th>
              <th className="text-left px-4 py-3 font-semibold w-40">Type</th>
              <th className="text-left px-4 py-3 font-semibold">Note</th>
              <th className="text-left px-4 py-3 font-semibold w-28">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((log) => {
              const open = expanded[log.log_id] || false;
              const items = itemsCache[log.log_id];
              return (
                <tr
                  key={log.log_id}
                  className="border-b last:border-0 hover:bg-neutral-50 transition align-top"
                >
                  <td className="px-4 py-3 text-neutral-600">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{log.type}</td>
                  <td className="px-4 py-3 text-neutral-700">
                    {log.note ?? ""}
                    {open && (
                      <div className="mt-2">
                        {items === undefined && (
                          <div className="text-xs text-neutral-500">
                            Loading items…
                          </div>
                        )}
                        {items !== undefined && items.length === 0 && (
                          <div className="text-xs text-neutral-500">
                            No line items.
                          </div>
                        )}
                        {items !== undefined && items.length > 0 && (
                          <div className="rounded-lg border bg-neutral-50">
                            <table className="w-full text-xs">
                              <thead className="bg-neutral-100 border-b">
                                <tr>
                                  <th className="text-left px-3 py-2 font-medium">
                                    SKU
                                  </th>
                                  <th className="text-left px-3 py-2 font-medium">
                                    Quantity
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((it) => (
                                  <tr key={`${it.log_id}-${it.sku}`}>
                                    <td className="px-3 py-2">{it.sku}</td>
                                    <td className="px-3 py-2">{it.quantity}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleExpand(log)}
                      className="px-3 py-1 rounded-lg border text-xs hover:bg-neutral-100"
                    >
                      {open ? "Hide" : "View"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading && !error && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-500">
                  No logs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      <div className="flex items-center gap-3">
        <button
          onClick={loadMore}
          disabled={!hasMore || loading}
          className={`px-4 py-2 rounded-xl border text-sm font-medium ${
            hasMore && !loading ? "hover:bg-neutral-100" : "opacity-60"
          }`}
        >
          {loading ? "Loading…" : hasMore ? "Load more" : "No more"}
        </button>
        <span className="text-xs text-neutral-500">
          Page size {PAGE_SIZE}
        </span>
      </div>
    </motion.div>
  );
}
