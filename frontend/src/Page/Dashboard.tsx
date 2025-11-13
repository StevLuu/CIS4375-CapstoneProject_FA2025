// src/pages/Dashboard.tsx
import { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "../Components/auth/useAuth";
import { LoginModal } from "../Components/auth/LoginModal";
import { api } from "../lib/api";

// Types aligned with /items response, plus optional alert fields
type ItemDTO = {
  sku: string;
  item_name: string | null;
  description: string | null;
  current_quantity: number | null;
  price: number | string | null;
  online_sale_price?: number | string | null;
  archived?: "Y" | "N" | null;
  stock_alert_enabled?: "Y" | "N" | null | string;
  stock_alert_count?: number | string | null;
};

type ItemsResp = {
  items: ItemDTO[];
  nextCursor: string | null;
};

type DashboardStats = {
  totalStock: number;
  distinctSkus: number;
  lowStockAlerts: number;
};

type ChartRow = {
  name: string;
  stock: number;
};

function asNumber(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function Dashboard() {
  const { loggedIn, user, refresh } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // useEffect(() => {
  //   if (!loggedIn || !user?.email) setShowLogin(true);
  // }, [loggedIn, user]);

  useEffect(() => {
    if (!loggedIn || !user?.email) {
      setStats(null);
      setChartData([]);
      return;
    }
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, user]);

  async function fetchAllItems(): Promise<ItemDTO[]> {
    const all: ItemDTO[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (cursor) params.set("cursor", cursor);

      const page = await api<ItemsResp>(`/items?${params.toString()}`);
      if (page.items?.length) {
        all.push(...page.items);
      }
      cursor = page.nextCursor;
    } while (cursor);

    return all;
  }

  async function loadDashboard() {
    try {
      setLoading(true);
      setErrorMsg(null);

      const items = await fetchAllItems();

      let totalStock = 0;
      let distinctSkus = 0;
      let lowStockAlerts = 0;

      const normalized: Array<{ sku: string; name: string; qty: number; lowAlert: boolean }> = [];

      for (const it of items) {
        const archived = (it.archived ?? "N") === "Y";
        const qty = Number.isFinite(it.current_quantity as any)
          ? Number(it.current_quantity)
          : 0;

        if (!archived) {
          totalStock += qty;
        }
        distinctSkus += 1;

        const alertEnabled =
          String(it.stock_alert_enabled ?? "")
            .trim()
            .toUpperCase() === "Y";

        const alertCountRaw = asNumber(it.stock_alert_count ?? null);
        const alertCount = alertCountRaw == null ? null : Math.trunc(alertCountRaw);

        const lowAlert =
          !archived &&
          alertEnabled &&
          alertCount != null &&
          qty <= alertCount;

        if (lowAlert) {
          lowStockAlerts += 1;
        }

        normalized.push({
          sku: it.sku,
          name: (it.item_name || it.sku || "").trim() || it.sku,
          qty,
          lowAlert,
        });
      }

      // Top items by stock for chart
      const topByStock = normalized
        .slice()
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 7);

      const chartRows: ChartRow[] = topByStock.map(it => ({
        name: it.name.length > 18 ? it.name.slice(0, 15) + "..." : it.name,
        stock: it.qty,
      }));

      setStats({
        totalStock,
        distinctSkus,
        lowStockAlerts,
      });
      setChartData(chartRows);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to load dashboard");
      setStats(null);
      setChartData([]);
    } finally {
      setLoading(false);
    }
  }

  const totalStockFormatted = useMemo(() => {
    if (!stats) return "-";
    return stats.totalStock.toLocaleString();
  }, [stats]);

  const lowStockLabel = useMemo(() => {
    if (!stats) return "-";
    return stats.lowStockAlerts.toLocaleString();
  }, [stats]);

  const skuCountLabel = useMemo(() => {
    if (!stats) return "-";
    return stats.distinctSkus.toLocaleString();
  }, [stats]);

  return (
    <div className="space-y-10">
      <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={async () => {
          setShowLogin(false);
          await refresh();
          await loadDashboard();
        }}
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">Vendor Dashboard</h1>
          <p className="text-neutral-500 mt-1">
            Snapshot based on your current inventory.
          </p>
        </div>
        <button
          className="btn bg-indigo-600 text-white hover:bg-indigo-700"
          onClick={() => void loadDashboard()}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition">
          <p className="text-sm text-neutral-500">Items in stock</p>
          <h2 className="text-2xl font-semibold mt-1">
            {totalStockFormatted}
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Sum of current quantities for active items.
          </p>
        </div>

        <div className="bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition">
          <p className="text-sm text-neutral-500">Distinct SKUs</p>
          <h2 className="text-2xl font-semibold mt-1">
            {skuCountLabel}
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Total item records in your catalog.
          </p>
        </div>

        {/* <div className="bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition">
          <p className="text-sm text-neutral-500">Low stock alerts</p>
          <h2 className="text-2xl font-semibold mt-1 text-red-500">
            {lowStockLabel}
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Items where alerts are enabled and quantity is at or below the alert level.
          </p>
        </div> */}
      </div>

      {/* Stock bar chart */}
      <div className="bg-white border rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 gap-2">
          <h3 className="text-lg font-semibold">Top items by stock</h3>
          <span className="text-xs text-neutral-500">
            Showing up to 7 items with the highest on hand quantity.
          </span>
        </div>
        {loading && !stats ? (
          <p className="text-sm text-neutral-500">Loading chart...</p>
        ) : chartData.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No items available to display.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar
                dataKey="stock"
                fill="#6366F1"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
