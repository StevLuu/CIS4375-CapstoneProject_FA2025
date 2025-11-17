// src/pages/CSV.tsx
import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../Components/auth/useAuth";
import { LoginModal } from "../Components/auth/LoginModal";
import { api, formatSku, nextSku } from "../lib/api";
import { clampSeed } from "../lib/api";

// ===== Types =====
type ItemDTO = {
  sku: string;
  item_name: string;
  description: string | null;
  current_quantity: number | null;
  price: number | string | null;
  online_sale_price?: number | string | null;
  archived?: "Y" | "N" | null;
};
type ItemsResp = { items: ItemDTO[]; nextCursor: string | null };
type ParsedRow = Record<string, string | number | null | undefined>;
type ItemFull = Record<string, any>;

// ===== Helpers =====
function csvCell(val: unknown): string {
  if (val == null) return "";
  const s = String(val).replace(/"/g, '""');
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
}

function toNumberOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[\$,]/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toSnake(s: string): string {
  return s.trim().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").toLowerCase().split(" ").join("_");
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"' && !inQ) inQ = true;
    else if (ch === '"' && inQ) inQ = false;
    else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    } else cur += ch;
  }
  out.push(cur);
  return out.map((cell) => cell.replace(/^"(.*)"$/, "$1").replace(/""/g, '"').trim());
}

// ===== API helpers =====
async function fetchAllItems(): Promise<Map<string, ItemDTO>> {
  const bySku = new Map<string, ItemDTO>();
  let cursor: string | null = null;
  do {
    const q = new URLSearchParams();
    q.set("limit", "100");
    if (cursor) q.set("cursor", cursor);
    const page = await api<ItemsResp>(`/items?${q.toString()}`);
    page.items.forEach((it) => {
      const stock = Number.isFinite(it.current_quantity) ? Number(it.current_quantity) : 0;
      const price = typeof it.price === "string" ? Number(it.price) : it.price != null ? Number(it.price) : null;
      const osp =
        typeof it.online_sale_price === "string"
          ? Number(it.online_sale_price)
          : it.online_sale_price != null
            ? Number(it.online_sale_price)
            : null;
      bySku.set(it.sku, { ...it, current_quantity: stock, price, online_sale_price: osp });
    });
    cursor = page.nextCursor;
  } while (cursor);
  return bySku;
}

// Tries multiple ways to get full item objects.
async function fetchAllItemsFull(): Promise<ItemFull[]> {
  const out: ItemFull[] = [];
  let cursor: string | null = null;

  // Attempt 1: ask backend for all fields if supported
  try {
    do {
      const q = new URLSearchParams({ limit: "100", include: "all" });
      if (cursor) q.set("cursor", cursor);
      const page = await api<any>(`/items?${q.toString()}`);
      if (page?.items?.length) page.items.forEach((it: any) => out.push(it));
      cursor = page?.nextCursor ?? null;
    } while (cursor);
    if (out.length) return out;
  } catch {
    // ignore and fall back
  }

  // Attempt 2: normal list plus per page enrichment if backend includes fields already
  try {
    cursor = null;
    do {
      const q = new URLSearchParams({ limit: "100" });
      if (cursor) q.set("cursor", cursor);
      const page = await api<any>(`/items?${q.toString()}`);
      if (page?.items?.length) page.items.forEach((it: any) => out.push(it));
      cursor = page?.nextCursor ?? null;
    } while (cursor);
    if (out.length) return out;
  } catch {
    // ignore and fall back
  }

  // If everything fails, return empty list
  return out;
}

// Build Categories strings using /items/categories which returns breadcrumbs
async function fetchCategoryPathsForSkus(skus: string[]): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  const CHUNK = 150;
  for (let i = 0; i < skus.length; i += CHUNK) {
    const slice = skus.slice(i, i + CHUNK);
    const q = new URLSearchParams({ skus: slice.join(",") });
    try {
      const resp = await api<Record<string, Array<Array<{ category_id: number; category_name: string }>>>>(
        `/items/categories?${q.toString()}`
      );
      for (const [sku, paths] of Object.entries(resp || {})) {
        const strings = (paths || [])
          .map((path) => path.map((p) => p.category_name).join(" > "))
          .filter(Boolean);
        result[sku] = strings;
      }
    } catch {
      // route not available
    }
  }
  return result;
}

// ===== Component =====
export default function CSV() {
  const { loggedIn, user, refresh } = useAuth();
  // const [showLogin, setShowLogin] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const [details, setDetails] = useState<string>("");
  const [autoCreate, setAutoCreate] = useState(true);
  const [creating, setCreating] = useState(false);
  const squareSuffixRef = useRef<string>("");

  // useEffect(() => {
  //   if (!loggedIn || !user?.email) setShowLogin(true);
  // }, [loggedIn, user]);

  useEffect(() => {
    const saved = (user as any)?.squareUsername;
    if (saved && typeof saved === "string" && saved.trim()) {
      squareSuffixRef.current = saved.trim();
    }
  }, [user]);

  const squareUsername = useMemo(
    () => (user as any)?.squareUsername || (user as any)?.username || "",
    [user]
  );

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setStatus("");
    setDetails("");
  };

  // Detect the trailing Square username token from the header row
  function detectSquareSuffix(firstHeaderLine: string): string | null {
    const cols: string[] = splitCsvLine(firstHeaderLine);
    const bases = ["Current Quantity", "New Quantity", "Stock Alert Enabled", "Stock Alert Count"];
    const found: string[] = [];
    for (const h of cols) {
      for (const b of bases) {
        const m = new RegExp(`^${b}\\s+([A-Za-z0-9_]+)$`, "i").exec(h);
        if (m && m[1]) found.push(m[1]);
      }
    }
    if (found.length === 0) return null;
    const freq = new Map<string, number>();
    for (const f of found) freq.set(f, (freq.get(f) ?? 0) + 1);
    let best = found[0]!;
    let bestN = 0;
    for (const [k, v] of freq) if (v > bestN) { best = k; bestN = v; }
    return best;
  }

  // Strip the detected username from known Square headers
  function stripKnownSuffix(h: string): string {
    const sfx = squareSuffixRef.current;
    if (!sfx) return h;
    const pattern = new RegExp(
      `^(Current Quantity|New Quantity|Stock Alert Enabled|Stock Alert Count)\\s+${sfx}$`,
      "i"
    );
    const m = pattern.exec(h);
    return m && m[1] ? m[1] : h;
  }

  function normalizeHeader(h: string): string {
    const baseHeader = stripKnownSuffix(h).trim();
    const key = baseHeader.toLowerCase();

    switch (key) {
      case "reference handle": return "reference_handle";
      case "token": return "token";
      case "item name": return "item_name";
      case "variation name": return "variation_name";
      case "sku": return "sku";
      case "description": return "description";
      case "categories": return "categories";
      case "reporting category": return "reporting_category";
      case "seo title": return "seo_title";
      case "seo description": return "seo_description";
      case "permalink": return "permalink";
      case "gtin": return "gtin";
      case "square online item visibility": return "square_online_item_visibility";
      case "item type": return "item_type";
      case "weight (lb)": return "weight_lb";
      case "social media link title": return "social_media_link_title";
      case "social media link description": return "social_media_link_description";
      case "shipping enabled": return "shipping_enabled";
      case "self-serve ordering enabled": return "self_serve_ordering";
      case "delivery enabled": return "delivery_enabled";
      case "pickup enabled": return "pickup_enabled";
      case "price": return "price";
      case "online sale price": return "online_sale_price";
      case "archived": return "archived";
      case "sellable": return "sellable";
      case "contains alcohol": return "contains_alcohol";
      case "stockable": return "stockable";
      case "skip detail screen in pos": return "skip_detail_screen_in_pos";
      case "option name 1": return "option_name_1";
      case "option value 1": return "option_value_1";
      case "current quantity": return "current_quantity";
      case "new quantity": return "new_quantity";
      case "stock alert enabled": return "stock_alert_enabled";
      case "stock alert count": return "stock_alert_count";
      case "modifier set - holographic": return "modifier";
      default:
        return toSnake(baseHeader);
    }
  }

  function parseCsv(text: string): ParsedRow[] {
    const rows: ParsedRow[] = [];
    const lines: string[] = [];
    let cur = "";
    let inQ = false;

    for (const ch of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")) {
      if (ch === '"' && !inQ) inQ = true;
      else if (ch === '"' && inQ) inQ = false;
      else if (ch === "," && !inQ) cur += "\u0001";
      else if (ch === "\n" && !inQ) {
        lines.push(cur);
        cur = "";
      } else cur += ch;
    }
    if (cur.length) lines.push(cur);

    const split = (s: string) =>
      s.split("\u0001").map((cell) => cell.replace(/^"(.*)"$/, "$1").replace(/""/g, '"').trim());

    if (!lines.length) return rows;

    const headers = (split(lines[0] ?? "")).map((h) => normalizeHeader(String(h)));

    for (let r = 1; r < lines.length; r++) {
      const line = lines[r];
      if (typeof line !== "string" || !line.trim()) continue;

      const cells = split(line);

      // New: skip rows where every cell is empty
      if (cells.every((cell) => cell === "")) continue;

      // Old single column guard is now redundant but harmless
      //if (cells.length === 1 && cells[0] === "") continue;

      const row: ParsedRow = {};
      for (let c = 0; c < headers.length; c++) {
        const key = headers[c];
        if (!key) continue;
        row[key] = cells[c] ?? "";
      }
      rows.push(row);
    }
    return rows;
  }

  function planChanges(rows: ParsedRow[], inventory: Map<string, ItemDTO>) {
    //  const ignored: string[] = [];
    const ignoredStats = {
      noSkuNoName: 0,
      skuButNoName: 0,
      unknownSkuAutoOff: 0,
    };

    type Update = { sku: string; patch?: Record<string, any>; current_quantity?: number };
    type Create = {
      item_name: string;
      description: string | null;
      current_quantity: number;
      price: number | null;
      online_sale_price: number | null;
      seed: string;
      categories_paths?: string[];
      extra?: Record<string, any>;   // add this
    };

    const updates: Update[] = [];
    const creates: Array<Create & { sourceSku?: string }> = [];
    const ignored: string[] = [];
    const perSkuCategories: Record<string, string[]> = {};
    const uniquePaths = new Set<string>();

    const asYN = (v: unknown): "Y" | "N" | undefined => {
      const s = String(v ?? "").trim().toUpperCase();
      return s === "Y" || s === "N" ? s : undefined;
    };
    const asStrOrNull = (v: unknown): string | null => {
      const s = String(v ?? "").trim();
      return s === "" ? null : s;
    };
    const asNumOrNull = (v: unknown): number | null => {
      const s = String(v ?? "").replace(/[\$,]/g, "").trim();
      if (s === "") return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };

    const FIELD_SPECS: Record<string, (v: unknown) => any> = {
      reference_handle: asStrOrNull,
      token: asStrOrNull,
      item_name: asStrOrNull,
      variation_name: asStrOrNull,
      description: asStrOrNull,
      seo_title: asStrOrNull,
      seo_description: asStrOrNull,
      permalink: asStrOrNull,
      gtin: asStrOrNull,
      square_online_item_visibility: asStrOrNull,
      item_type: asStrOrNull,
      social_media_link_title: asStrOrNull,
      social_media_link_description: asStrOrNull,
      shipping_enabled: asYN,
      self_serve_ordering: asYN,
      delivery_enabled: asYN,
      pickup_enabled: asYN,
      price: asNumOrNull,
      online_sale_price: asNumOrNull,
      archived: asYN,
      sellable: asYN,
      contains_alcohol: asYN,
      stockable: asYN,
      skip_detail_screen_in_pos: asYN,
      option_name_1: asStrOrNull,
      option_value_1: asStrOrNull,
      stock_alert_enabled: asYN,
      stock_alert_count: (v) => {
        const n = asNumOrNull(v);
        return n == null ? null : Math.trunc(n);
      },
      modifier: asStrOrNull,
    };

    const buildPatchFromRow = (row: ParsedRow): Record<string, any> => {
      const patch: Record<string, any> = {};
      for (const [k, coerce] of Object.entries(FIELD_SPECS)) {
        if (row[k] !== undefined) {
          const v = coerce(row[k]);
          if (v !== undefined) patch[k] = v;
        }
      }
      return patch;
    };

    const parsePaths = (raw: unknown): string[] => {
      const s = String(raw ?? "").trim();
      if (!s) return [];
      return s
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) =>
          p
            .split(">")
            .map((seg) => seg.replace(/[›]/g, ">").trim())
            .filter(Boolean)
            .join(" > ")
        )
        .filter(Boolean);
    };

    for (const r of rows) {
      const rawSku = String(r["sku"] ?? "").trim();

      // Try multiple possible name fields so we can auto-create more reliably
      let name = String(r["item_name"] ?? "").trim();
      if (!name) {
        name = String(
          r["name"] ??
          r["title"] ??
          r["variation_name"] ??
          ""
        ).trim();
      }
      // New: if there is truly no data in the row, skip it completely
      const hasAnyData = Object.values(r).some((v) => String(v ?? "").trim() !== "");
      if (!hasAnyData) continue;
      const paths = parsePaths(r["categories"]);
      for (const p of paths) uniquePaths.add(p);


      // absolute quantity from New Quantity first, else Current Quantity
      let absQty: number | null = null;
      if (r["new_quantity"] != null && r["new_quantity"] !== "") {
        const n1 = toNumberOrNull(r["new_quantity"]);
        if (n1 != null) absQty = Math.trunc(n1);
      } else if (r["current_quantity"] != null && r["current_quantity"] !== "") {
        const n2 = toNumberOrNull(r["current_quantity"]);
        if (n2 != null) absQty = Math.trunc(n2);
      }

      if (rawSku) {
        const existing = inventory.get(rawSku);
        if (!existing) {
          if (name && autoCreate) {
            const extra = buildPatchFromRow(r); // includes reference_handle, token, etc

            creates.push({
              item_name: name,
              description: r["description"] != null ? String(r["description"]) : null,
              current_quantity: absQty ?? 0,
              price: asNumOrNull(r["price"]),
              online_sale_price: asNumOrNull(r["online_sale_price"]),
              seed: clampSeed(name),
              categories_paths: paths,
              sourceSku: rawSku,
              extra,
            });
          } else {
            ignored.push(rawSku);
          }
          continue;
        }



        const patch = buildPatchFromRow(r);
        const u: Update = { sku: rawSku };

        if (Object.keys(patch).length) u.patch = patch;

        if (absQty != null) {
          const before = Number.isFinite(existing.current_quantity ?? NaN)
            ? Number(existing.current_quantity)
            : 0;
          if (absQty !== before) u.current_quantity = absQty;
        }

        if (u.patch || u.current_quantity !== undefined) updates.push(u);
        if (paths.length) perSkuCategories[rawSku] = paths;
      } else {
        if (name && autoCreate) {
          const extra = buildPatchFromRow(r);

          creates.push({
            item_name: name,
            description: r["description"] != null ? String(r["description"]) : null,
            current_quantity: absQty ?? 0,
            price: asNumOrNull(r["price"]),
            online_sale_price: asNumOrNull(r["online_sale_price"]),
            seed: clampSeed(name),
            categories_paths: paths,
            extra,
          });
        } else {
          ignored.push("(missing SKU)");
        }
      }


    }

    return {
      updates,
      creates,
      ignored,
      perSkuCategories,
      allPaths: Array.from(uniquePaths),
      ignoredStats,
    };
  }

  async function postBatches(updates: Array<{ sku: string; patch?: any; current_quantity?: number }>) {
    const CHUNK = 200;
    const results: Array<{ ok: string[]; failed: Array<{ sku: string; error: string }>; log_id?: number }> = [];
    for (let i = 0; i < updates.length; i += CHUNK) {
      const slice = updates.slice(i, i + CHUNK);
      const res = await api<{ ok: string[]; failed: Array<{ sku: string; error: string }>; log_id?: number }>(
        `/items/batch`,
        { method: "POST", json: { updates: slice } }
      );
      results.push(res);
    }
    return results;
  }

  const handleUpload = async () => {
    try {
      if (!file) { setStatus("❌ Select a CSV file first."); return; }
      setStatus("⏳ Parsing CSV..."); setDetails("");

      const raw = await file.text();

      // Split into physical lines
      const allLines = raw.split(/\r\n|\n|\r/);

      // Find the first line that has at least one nonempty CSV cell
      let headerIndex = -1;
      for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i];
        if (!line) continue;

        const cells = splitCsvLine(line);
        const hasRealCell = cells.some((c) => c.trim() !== "");
        if (hasRealCell) {
          headerIndex = i;
          break;
        }
      }

      if (headerIndex === -1) {
        setStatus("❌ No header row found in CSV.");
        return;
      }

      // Cleaned text starts from the real header row
      const cleaned = allLines.slice(headerIndex).join("\n");

      // Use the same header line for suffix detection
      const firstHeaderLine = allLines[headerIndex] ?? "";
      const detected = detectSquareSuffix(firstHeaderLine);
      if (detected) {
        const cleanedSuffix = detected.trim();
        console.log("TEXMOE: " + cleanedSuffix);
        squareSuffixRef.current = cleanedSuffix;
        try {
          await api("/auth/me", { method: "PATCH", json: { squareUsername: cleanedSuffix } });
        } catch {
          console.warn("Failed to save square username");
        }
      } else {
        console.log("texty: " + firstHeaderLine);
      }

      const rows = parseCsv(cleaned);
      if (!rows.length) {
        setStatus("❌ No rows found.");
        return;
      }


      setStatus("⏳ Loading current inventory...");
      const inv = await fetchAllItems();

      setStatus("⏳ Planning changes...");
      const { updates, creates, ignored, perSkuCategories, ignoredStats } = planChanges(rows, inv);

      // create new items first
      if (creates.length) {
        setStatus(`⏳ Creating ${creates.length} new item(s)...`);
        const prepared: Array<any> = [];

        let createdCount = 0;
        for (const c of creates) {
          const sku = formatSku(c.seed, createdCount);

          const base = {
            sku,
            item_name: c.item_name,
            description: c.description,
            current_quantity: c.current_quantity,
            price: c.price,
            online_sale_price: c.online_sale_price,
          };

          // Merge in extra fields like reference_handle, token, seo_title, etc
          const full = c.extra ? { ...base, ...c.extra } : base;

          prepared.push(full);

          if (c.categories_paths?.length) {
            perSkuCategories[sku] = c.categories_paths;
          }
          createdCount++;
        }


        const CHUNK = 200;
        for (let i = 0; i < prepared.length; i += CHUNK) {
          const slice = prepared.slice(i, i + CHUNK);
          try {
            await api(`/items/batch-create`, { method: "POST", json: { items: slice, note: "csv import" } });
          } catch {
            // fallback to per-item with collision retry
            for (const base of slice) {
              let body = { ...base };
              let tries = 0;
              while (tries < 5) {
                try {
                  await api(`/items`, { method: "POST", json: body as any });
                  break;
                } catch (err: any) {
                  if ((err?.status ?? err?.response?.status) === 409) {
                    body = { ...body, sku: nextSku(String(body.sku)) };
                    tries++;
                    continue;
                  }
                  break;
                }
              }
            }
          }
        }
      }

      if (updates.length) {
        setStatus(`⏳ Updating ${updates.length} existing item(s)...`);
        await postBatches(updates);
      }

      // categories
      const allPaths = new Set<string>();
      Object.values(perSkuCategories).forEach((arr) => arr.forEach((p) => allPaths.add(p)));

      if (allPaths.size) {
        setStatus("⏳ Ensuring categories...");
        const ensured = await api<{ ok: Array<{ path: string; leaf_category_id: number }>; failed: string[] }>(
          `/categories/ensure-paths`,
          { method: "POST", json: { paths: Array.from(allPaths) } }
        );

        const idByPath = new Map<string, number>();
        ensured.ok.forEach((r) => idByPath.set(r.path, r.leaf_category_id));

        const pairs: Array<{ sku: string; category_ids: number[] }> = [];
        for (const [sku, paths] of Object.entries(perSkuCategories)) {
          const ids = paths.map((p) => idByPath.get(p)).filter((v): v is number => typeof v === "number");
          if (ids.length) pairs.push({ sku, category_ids: ids });
        }

        const CH = 200;
        for (let i = 0; i < pairs.length; i += CH) {
          await api(`/categories/assign`, { method: "POST", json: { pairs: pairs.slice(i, i + CH) } });
        }
      }

      setStatus("✅ Import finished.");
      const summary: string[] = [];
      if ((creates?.length ?? 0) > 0) summary.push(`Created: ${creates.length}`);
      if ((updates?.length ?? 0) > 0) summary.push(`Updated: ${updates.length}`);
      const catCount = Object.keys(perSkuCategories).length;
      if (catCount) summary.push(`Categorized: ${catCount}`);
      if ((ignored?.length ?? 0) > 0) {
        summary.push(`Ignored: ${ignored.length}`);
        summary.push(
          `Ignored breakdown -> no SKU & no name: ${ignoredStats.noSkuNoName}, ` +
          `SKU but no name: ${ignoredStats.skuButNoName}, ` +
          `unknown SKU while auto-create off: ${ignoredStats.unknownSkuAutoOff}`
        );
      }

      setDetails(summary.join("\n"));
    } catch (e: any) {
      setStatus(`❌ Error: ${e?.message ?? "upload failed"}`);
    } finally {
      setCreating(false);
    }
  };

  const handleExport = async () => {
    try {
      setStatus("⏳ Building export...");
      setDetails("");

      const squareUser = squareSuffixRef.current || squareUsername || "";
      const suffix = squareUser ? ` ${squareUser}` : "";

      // Exact header order to match Square
      const headers = [
        "Reference Handle",
        "Token",
        "Item Name",
        "Variation Name",
        "SKU",
        "Description",
        "Categories",
        "Reporting Category",
        "SEO Title",
        "SEO Description",
        "Permalink",
        "GTIN",
        "Square Online Item Visibility",
        "Item Type",
        "Weight (lb)",
        "Social Media Link Title",
        "Social Media Link Description",
        "Shipping Enabled",
        "Self-serve Ordering Enabled",
        "Delivery Enabled",
        "Pickup Enabled",
        "Price",
        "Online Sale Price",
        "Archived",
        "Sellable",
        "Contains Alcohol",
        "Stockable",
        "Skip Detail Screen in POS",
        "Option Name 1",
        "Option Value 1",
        `Current Quantity${suffix}`,
        `New Quantity${suffix}`,
        `Stock Alert Enabled${suffix}`,
        `Stock Alert Count${suffix}`,
        "Modifier Set - Holographic",
      ];

      // Fetch data
      const items = await fetchAllItemsFull();
      const skus = items.map((i) => i.sku).filter(Boolean);
      let catsBySku: Record<string, string[]> = {};
      try {
        catsBySku = await fetchCategoryPathsForSkus(skus);
      } catch {
        catsBySku = {};
      }

      // Build CSV
      const lines: string[] = [];
      lines.push(headers.join(","));

      for (const it of items) {
        const categoriesList = catsBySku[it.sku] ?? [];
        const categoriesStr = categoriesList.join(", ");

        const firstPath = categoriesList.length > 0 ? categoriesList[0] : "";
        const reportingCategory = firstPath ? firstPath.split(" > ")[0] : "";

        const row = [
          it.reference_handle ?? "",
          it.token ?? "",
          it.item_name ?? "",
          it.variation_name ?? "",
          it.sku ?? "",
          it.description ?? "",
          categoriesStr,
          reportingCategory,
          it.seo_title ?? "",
          it.seo_description ?? "",
          it.permalink ?? "",
          it.gtin ?? "",
          it.square_online_item_visibility ?? "",
          it.item_type ?? "",
          "", // Weight (lb)
          it.social_media_link_title ?? "",
          it.social_media_link_description ?? "",
          it.shipping_enabled ?? "",
          it.self_serve_ordering ?? "",
          it.delivery_enabled ?? "",
          it.pickup_enabled ?? "",
          it.price ?? "",
          it.online_sale_price ?? "",
          it.archived ?? "",
          it.sellable ?? "",
          it.contains_alcohol ?? "",
          it.stockable ?? "",
          it.skip_detail_screen_in_pos ?? "",
          it.option_name_1 ?? "",
          it.option_value_1 ?? "",
          it.current_quantity ?? "",
          "", // New Quantity {suffix}
          it.stock_alert_enabled ?? "",
          it.stock_alert_count ?? "",
          it.modifier ?? "",
        ];
        lines.push(row.map(csvCell).join(","));
      }

      const csv = lines.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xiiyta_items_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      setStatus("✅ Export complete.");
      setDetails(`Exported ${items.length} item(s).`);
    } catch (err: any) {
      setStatus(`❌ Export failed: ${err?.message ?? "unknown error"}`);
    }
  };

  return (
    <div className="space-y-10">
      {/* <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={async () => {
          setShowLogin(false);
          await refresh();
        }}
      /> */}

      <h1 className="text-3xl font-semibold">CSV Import</h1>
      <p className="text-neutral-500">Upload inventory data exported from Etsy or Square.</p>

      <div className="bg-white border rounded-2xl p-6 shadow-sm space-y-4 max-w-xl">
        <label className="block text-sm font-medium text-neutral-700">Select CSV file:</label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="block w-full text-sm text-neutral-600 border border-neutral-300 rounded-xl p-2 cursor-pointer hover:bg-neutral-50"
        />
        {file && <p className="text-sm text-green-600">📄 {file.name} selected</p>}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={autoCreate}
            onChange={(e) => setAutoCreate(e.target.checked)}
          />
          Auto create items for unknown or missing SKUs using auto SKU
        </label>

        <div className="flex gap-3">
          <button
            onClick={handleUpload}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition disabled:opacity-60"
            disabled={creating}
          >
            {creating ? "Creating…" : "Upload CSV"}
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 rounded-xl bg-neutral-200 text-neutral-800 font-medium hover:bg-neutral-300 transition"
          >
            Export CSV
          </button>
        </div>

        {status && (
          <p
            className={`text-sm ${status.startsWith("✅")
              ? "text-green-600"
              : status.startsWith("⏳")
                ? "text-yellow-600"
                : status.startsWith("Info")
                  ? "text-neutral-600"
                  : "text-red-600"
              }`}
          >
            {status}
          </p>
        )}
        {details && (
          <pre className="text-xs text-neutral-700 bg-neutral-50 border rounded-xl p-3 whitespace-pre-wrap">
            {details}
          </pre>
        )}
      </div>
    </div>
  );
}
