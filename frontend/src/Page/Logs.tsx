// frontend/src/Page/Logs.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../Components/auth/useAuth";
import { LoginModal } from "../Components/auth/LoginModal";
import { api } from "../lib/api";

//helper
async function fetchLogWithItemsById(
  id: number
): Promise<LogRowWithItems | null> {
  // Robust pagination loop. Stops when the id is found or pages end.
  let next: number | null = null;
  for (let guard = 0; guard < 10; guard++) { // up to 10 pages of 50 = 500 logs
    const qs = new URLSearchParams();
    qs.set("limit", "50");
    qs.set("with_items", "1");
    if (next) qs.set("cursor", String(next));

    const page = await api<ApiList<LogRowWithItems>>(`/logs?${qs.toString()}`);
    const hit = page.logs.find(r => r.log_id === id);
    if (hit) return hit;
    if (!page.nextCursor) return null;
    next = page.nextCursor;
  }
  return null;
}


type LogRowLean = {
  log_id: number;
  timestamp: string; // ISO
  type: string;
  note: string | null;
};
type LogItem = { log_id: number; sku: string; user_id: number; quantity: number };
type LogRowWithItems = LogRowLean & { log_item: LogItem[] };
type ApiList<T> = { logs: T[]; nextCursor: number | null };

const PAGE_SIZE = 25;
// Only show these filters for now
const TYPE_FILTERS = ["All", "Regular Logs", "CSV Import"] as const;
type TypeFilter = typeof TYPE_FILTERS[number];

// Types emitted by items routes
const REGULAR_TYPES = new Set(["created", "restock", "sold", "removed", "bulk_edit"]);
// If your CSV importer writes a different string, update here
const CSV_TYPE = "csv_import";

export default function Logs() {
  const { loggedIn, user, refresh } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  // useEffect(() => { if (!loggedIn || !user?.email) setShowLogin(true); }, [loggedIn, user]);

  // UI filter
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All");

  // Data
  const [rows, setRows] = useState<LogRowLean[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Detail expansion cache
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [itemsCache, setItemsCache] = useState<Record<number, LogItem[]>>({});

  const abortRef = useRef<AbortController | null>(null);

  // Server can only filter by a single type. For Regular we fetch without type and filter client side.
  const serverTypeParam = useMemo(() => {
    if (typeFilter === "CSV Import") return `&type=${encodeURIComponent(CSV_TYPE)}`;
    if (typeFilter === "Regular Logs") return "";
    return ""; // All
  }, [typeFilter]);

  // Client-side predicate for Regular Logs
  function clientInclude(row: LogRowLean) {
    if (typeFilter === "All") return true;
    if (typeFilter === "CSV Import") return row.type === CSV_TYPE;
    return REGULAR_TYPES.has(row.type); // Regular Logs
  }

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
      qs.set("with_items", "0");
      if (serverTypeParam) {
        const p = new URLSearchParams(serverTypeParam.replace(/^&/, ""));
        for (const [k, v] of p.entries()) qs.set(k, v);
      }

      const data = await api<ApiList<LogRowLean>>(`/logs?${qs.toString()}`, { signal: ac.signal as any });

      // If client-side filtering is active, filter then maintain cursor semantics locally.
      const fetched = typeFilter === "Regular Logs" ? data.logs.filter(clientInclude) : data.logs;

      setRows((prev) => (reset ? fetched : [...prev, ...fetched]));
      setCursor(data.nextCursor);
      setHasMore(Boolean(data.nextCursor));
    } catch (e: any) {
      if (e.name !== "AbortError") setError(e.message || "Request failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCursor(null);
    setRows([]);
    setHasMore(true);
    setExpanded({});
    setItemsCache({});
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverTypeParam, typeFilter]);

  const loadMore = () => { if (!loading && hasMore) fetchPage(false); };

  const toggleExpand = async (log: LogRowLean) => {
    const open = !expanded[log.log_id];
    setExpanded((m) => ({ ...m, [log.log_id]: open }));

    if (open && !itemsCache[log.log_id]) {
      // fetch exactly this log with items, regardless of sort order
      const exact = await fetchLogWithItemsById(log.log_id);
      setItemsCache((m) => ({ ...m, [log.log_id]: exact?.log_item ?? [] }));
    }
  };


  // CRUD modal state
  const [crudOpen, setCrudOpen] = useState<{ open: boolean; log?: LogRowLean }>(() => ({ open: false }));

  return (
    <motion.div className="space-y-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
      <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={async () => {
          setShowLogin(false);
          await refresh();
          setRows([]);
          setCursor(null);
          setHasMore(true);
          fetchPage(true);
        }}
      />

      <h1 className="text-3xl font-semibold">System Logs</h1>
      <p className="text-neutral-500">Recent activity.</p>

      {/* Filters */}
      {/* <div className="flex gap-2 flex-wrap">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-4 py-2 rounded-xl border text-sm font-medium transition ${typeFilter === t ? "bg-indigo-600 text-white" : "hover:bg-neutral-100"}`}
          >
            {t}
          </button>
        ))}
      </div> */}

      {error && <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">{error}</div>}

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold w-40">Time</th>
              <th className="text-left px-4 py-3 font-semibold w-40">Type</th>
              <th className="text-left px-4 py-3 font-semibold">Note</th>
              <th className="text-left px-4 py-3 font-semibold w-44">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((log) => {
              const open = expanded[log.log_id] || false;
              const items = itemsCache[log.log_id];
              return (
                <tr key={log.log_id} className="border-b last:border-0 hover:bg-neutral-50 transition align-top">
                  <td className="px-4 py-3 text-neutral-600">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3">{log.type}</td>
                  <td className="px-4 py-3 text-neutral-700">
                    {log.note ?? ""}
                    {open && (
                      <div className="mt-2">
                        {items === undefined && <div className="text-xs text-neutral-500">Loading items…</div>}
                        {items !== undefined && items.length === 0 && <div className="text-xs text-neutral-500">No line items.</div>}
                        {items !== undefined && items.length > 0 && (
                          <div className="rounded-lg border bg-neutral-50">
                            <table className="w-full text-xs">
                              <thead className="bg-neutral-100 border-b">
                                <tr>
                                  <th className="text-left px-3 py-2 font-medium">SKU</th>
                                  <th className="text-left px-3 py-2 font-medium">Quantity</th>
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
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => toggleExpand(log)} className="px-3 py-1 rounded-lg border text-xs hover:bg-neutral-100">
                      {open ? "Hide" : "View"}
                    </button>
                    <button onClick={() => setCrudOpen({ open: true, log })} className="px-3 py-1 rounded-lg border text-xs hover:bg-neutral-100">
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading && !error && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-500">No logs found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={loadMore} disabled={!hasMore || loading} className={`px-4 py-2 rounded-xl border text-sm font-medium ${hasMore && !loading ? "hover:bg-neutral-100" : "opacity-60"}`}>
          {loading ? "Loading…" : hasMore ? "Load more" : "No more"}
        </button>
        <span className="text-xs text-neutral-500">Page size {PAGE_SIZE}</span>
      </div>

      {crudOpen.open && crudOpen.log && (
        <LogCrudModal
          base={crudOpen.log}
          onClose={() => setCrudOpen({ open: false })}
          onChanged={async () => {
            // refresh the first page for simplicity
            setCursor(null);
            setRows([]);
            setHasMore(true);
            setExpanded({});
            setItemsCache({});
            await fetchPage(true);
          }}
        />
      )}
    </motion.div>
  );
}

/* ===== CRUD modal for a log — header (type, note, time) + line item editing ===== */
function LogCrudModal(props: {
  base: LogRowLean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { base, onClose, onChanged } = props;

  // helpers for datetime-local formatting
  function toLocalInput(iso: string) {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }
  function fromLocalInput(local: string) {
    // local is like 2025-11-11T01:23. Treat as local time then convert to ISO
    const d = new Date(local);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  const [typeVal, setTypeVal] = useState(base.type);
  const [noteVal, setNoteVal] = useState(base.note ?? "");
  const [timeVal, setTimeVal] = useState(toLocalInput(base.timestamp)); // datetime-local value

  const [lines, setLines] = useState<LogItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // load line items via by-id endpoint
  useEffect(() => {
    (async () => {
      try {
        const row = await api<LogRowWithItems>(`/logs/${base.log_id}?with_items=1`);
        setLines(row.log_item ?? []);
      } catch {
        setLines([]);
      }
    })();
  }, [base.log_id]);

  async function saveHeader() {
    setBusy(true); setErr(null);
    try {
      const tsIso = fromLocalInput(timeVal);
      if (!tsIso) throw new Error("Invalid date-time");
      await api(`/logs/${base.log_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: typeVal, note: noteVal, timestamp: tsIso }),
      });
      await onChanged();
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateLineQuantity(sku: string, q: number) {
    setBusy(true); setErr(null);
    try {
      await api(`/logs/${base.log_id}/items/${encodeURIComponent(sku)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: q }),
      });
      setLines(prev => prev ? prev.map(l => l.sku === sku ? { ...l, quantity: q } : l) : prev);
    } catch (e: any) {
      setErr(e?.message || "Line update failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteLine(sku: string) {
    if (!confirm(`Delete line item ${sku}?`)) return;
    setBusy(true); setErr(null);
    try {
      await api(`/logs/${base.log_id}/items/${encodeURIComponent(sku)}`, { method: "DELETE" });
      setLines(prev => prev ? prev.filter(l => l.sku !== sku) : prev);
    } catch (e: any) {
      setErr(e?.message || "Line delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteLog() {
    if (!confirm("Delete this log and all its line items?")) return;
    setBusy(true); setErr(null);
    try {
      await api(`/logs/${base.log_id}`, { method: "DELETE" });
      await onChanged();
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit log #{base.log_id}</h2>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="text-sm font-medium">Type</label>
          <input className="input" value={typeVal} onChange={e => setTypeVal(e.target.value)} />

          <label className="text-sm font-medium">Note</label>
          <textarea className="input" value={noteVal} onChange={e => setNoteVal(e.target.value)} />

          <label className="text-sm font-medium">Time</label>
          <input
            className="input"
            type="datetime-local"
            value={timeVal}
            onChange={e => setTimeVal(e.target.value)}
          />
          <p className="text-xs text-neutral-500">
            Saved in UTC on the server. Local time shown here.
          </p>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium mb-2">Line items</div>
          {lines === null ? (
            <div className="text-sm text-neutral-500">Loading…</div>
          ) : lines.length === 0 ? (
            <div className="text-sm text-neutral-500">No line items.</div>
          ) : (
            <table className="w-full text-sm border rounded-lg overflow-hidden">
              <thead className="bg-neutral-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2">SKU</th>
                  <th className="text-left px-3 py-2">Quantity</th>
                  <th className="text-left px-3 py-2 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(li => (
                  <tr key={li.sku} className="border-b last:border-0">
                    <td className="px-3 py-2">{li.sku}</td>
                    <td className="px-3 py-2">
                      <input
                        className="input w-24"
                        type="number"
                        value={li.quantity}
                        onChange={e => updateLineQuantity(li.sku, Number(e.target.value))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button className="px-3 py-1 rounded-lg border text-xs hover:bg-neutral-100" onClick={() => deleteLine(li.sku)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn border border-red-600 text-red-700 hover:bg-red-50" onClick={deleteLog} disabled={busy}>Delete log</button>
          <button className="btn bg-indigo-600 text-white hover:bg-indigo-700" onClick={saveHeader} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
