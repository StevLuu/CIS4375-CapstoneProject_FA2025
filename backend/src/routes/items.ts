// backend/src/routes/items.ts
import { Router } from "express";
import { prisma } from "../services/prisma";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();
router.use(requireAuth);

// TODO: add DB index for archived filter once migrations are allowed:
// TODO: CREATE INDEX idx_item_user_archived ON "item"(user_id, archived);

function asNumber(d: any): number | null {
    if (d === null || d === undefined) return null;
    if (typeof d === "number") return d;
    if (typeof d === "string") return Number(d);
    if (typeof d === "object" && d !== null && "toNumber" in d) {
        try { return (d as any).toNumber(); } catch { return Number(String(d)); }
    }
    return Number(d);
}

function serializeItem(i: any) {
    return {
        ...i,
        price: asNumber(i.price),
        online_sale_price: asNumber(i.online_sale_price),
        current_quantity: Number.isFinite(i.current_quantity) ? i.current_quantity : 0,
    };
}

// helpers/stock.ts
async function writeLogWithLines(
    userId: number,
    type: string,
    lines: Array<{ sku: string; delta: number }>,
    note?: string | null
) {
    const log = await prisma.log.create({
        data: { user_id: userId, type, note: note ?? null },
        select: { log_id: true },
    });

    if (lines.length) {
        await prisma.log_item.createMany({
            data: lines.map(l => ({
                log_id: log.log_id,
                sku: l.sku,
                user_id: userId,
                quantity: l.delta,
            })),
        });
    }
    return log.log_id;
}

/** ---------- New: list by category with filters ---------- **/

// GET /items/by-category?category_id=...&includeDescendants=0|1&q=...&archived=exclude|include|only&limit=100&cursor=SKU
router.get("/by-category", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const categoryId = req.query.category_id ? Number(req.query.category_id) : undefined;
        const includeDesc = String(req.query.includeDescendants ?? "0") === "1";
        const q = req.query.q ? String(req.query.q) : undefined;
        const archived = String(req.query.archived ?? "exclude") as "exclude" | "include" | "only";
        const limitRaw = parseInt(String(req.query.limit ?? "100"), 10);
        const limit = Math.min(Math.max(isNaN(limitRaw) ? 100 : limitRaw, 1), 100);
        const cursorSku = req.query.cursor ? String(req.query.cursor) : undefined;

        // Build where
        const where: any = { user_id: userId };
        if (q) {
            where.OR = [
                { item_name: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
            ];
        }
        if (archived === "exclude") where.archived = "N";
        if (archived === "only") where.archived = "Y";

        if (!Number.isNaN(categoryId) && categoryId !== undefined) {
            if (!includeDesc) {
                where.category_item = { some: { category_id: categoryId } };
            } else {
                // subtree query via recursive CTE then IN list
                const rows: Array<{ category_id: number }> = await prisma.$queryRaw`
          WITH RECURSIVE subcats AS (
            SELECT c.category_id
            FROM "category" c
            WHERE c.user_id = ${userId} AND c.category_id = ${categoryId}
            UNION ALL
            SELECT ch.category_id
            FROM "category" ch
            JOIN subcats s ON ch.parent_category_id = s.category_id
            WHERE ch.user_id = ${userId}
          )
          SELECT category_id FROM subcats;
        `;
                const ids = rows.map(r => r.category_id);
                where.category_item = { some: { category_id: { in: ids } } };
            }
        }

        const results = await prisma.item.findMany({
            where,
            take: limit + 1,
            ...(cursorSku ? { cursor: { sku_user_id: { sku: cursorSku, user_id: userId } }, skip: 1 } : {}),
            orderBy: [{ user_id: "asc" }, { sku: "asc" }],
        });

        const nextCursor = results.length > limit ? results.pop()!.sku : null;
        res.json({ items: results.map(serializeItem), nextCursor });
    } catch (err) {
        next(err);
    }
});

/** ---------- New: breadcrumbs for many SKUs ---------- **/

// GET /items/categories?skus=AAA,BBB,CCC
router.get("/categories", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const skus = String(req.query.skus ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        if (!skus.length) return res.status(400).json({ error: "skus is required" });

        type Row = { sku: string; category_id: number; category_name: string; parent_category_id: number | null };

        // Climb up from each linked category to root
        const rows: Row[] = await prisma.$queryRaw`
        WITH roots AS (
          SELECT DISTINCT ci.sku, ci.category_id
          FROM "category_item" ci
          WHERE ci.user_id = ${userId} AND ci.sku = ANY(${skus}::text[])
        ),
        up AS (
          SELECT r.sku, c.category_id, c.category_name, c.parent_category_id
          FROM roots r
          JOIN "category" c ON c.user_id = ${userId} AND c.category_id = r.category_id
          UNION ALL
          SELECT u.sku, p.category_id, p.category_name, p.parent_category_id
          FROM up u
          JOIN "category" p ON p.user_id = ${userId} AND u.parent_category_id = p.category_id
        )
        SELECT DISTINCT sku, category_id, category_name, parent_category_id
        FROM up;
      `;

        // Build byId lookup of categories
        type CatRow = { category_id: number; category_name: string; parent_category_id: number | null };
        const byId = new Map<number, CatRow>();
        for (const r of rows) {
            if (!byId.has(r.category_id)) {
                byId.set(r.category_id, {
                    category_id: r.category_id,
                    category_name: r.category_name,
                    parent_category_id: r.parent_category_id,
                });
            }
        }

        // List the direct category links per SKU
        const pairs = await prisma.category_item.findMany({
            where: { user_id: userId, sku: { in: skus } },
            select: { sku: true, category_id: true },
        });

        // Build breadcrumb paths per SKU
        const bySku: Record<string, Array<Array<{ category_id: number; category_name: string }>>> = {};
        for (const { sku, category_id } of pairs) {
            const path: Array<{ category_id: number; category_name: string }> = [];
            let cur: CatRow | undefined = byId.get(category_id);
            while (cur) {
                path.push({ category_id: cur.category_id, category_name: cur.category_name });
                cur = cur.parent_category_id ? byId.get(cur.parent_category_id) : undefined;
            }
            path.reverse();
            bySku[sku] = bySku[sku] ?? [];
            bySku[sku].push(path);
        }

        res.json(bySku);
    } catch (err) {
        next(err);
    }
});

/** ---------- New: archive toggle ---------- **/

// PATCH /items/:sku/archive { archived: 'Y' | 'N' }
router.patch("/:sku/archive", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const sku = String(req.params.sku);
        const archived = String(req.body?.archived ?? "").toUpperCase();
        if (archived !== "Y" && archived !== "N") {
            return res.status(400).json({ error: "archived must be 'Y' or 'N'" });
        }

        const updated = await prisma.item.update({
            where: { sku_user_id: { sku, user_id: userId } },
            data: { archived },
            select: { sku: true, archived: true },
        });
        res.json(updated);
    } catch (err: any) {
        if (err?.code === "P2025") return res.status(404).json({ error: "Not found" });
        next(err);
    }
});

/** ---------- New: batch edit ---------- **/

// POST /items/batch
// Body: { updates: Array<{ sku: string, patch?: Record<string, any>, current_quantity?: number }> }
router.post("/batch", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const updates: Array<{ sku: string; patch?: any; current_quantity?: number }> =
            Array.isArray(req.body?.updates) ? req.body.updates : [];
        if (!updates.length) return res.status(400).json({ error: "updates is required" });
        if (updates.length > 200) return res.status(400).json({ error: "batch limit is 200" });

        // prepare quantity deltas for log
        const needAbs = updates.filter(u => typeof u.current_quantity === "number");
        const beforeMap: Record<string, number> = {};

        if (needAbs.length) {
            const rows = await prisma.item.findMany({
                where: { user_id: userId, sku: { in: needAbs.map(u => u.sku) } },
                select: { sku: true, current_quantity: true },
            });
            for (const r of rows) beforeMap[r.sku] = r.current_quantity ?? 0;
        }

        const result = await prisma.$transaction(async (tx) => {
            const lines: Array<{ sku: string; delta: number }> = [];
            const failed: Array<{ sku: string; error: string }> = [];
            const ok: string[] = [];

            for (const u of updates) {
                try {
                    const data: any = {};
                    if (u.patch && typeof u.patch === "object") {
                        // allow only whitelisted fields
                        const {
                            item_name,
                            description,
                            price,              // number or null
                            online_sale_price,  // number or null but will remain untouched unless provided by user
                            archived,
                            // add more allowed fields when needed
                        } = u.patch;

                        if (item_name !== undefined) data.item_name = String(item_name);
                        if (description !== undefined) data.description = description ?? null;
                        if (price !== undefined) data.price = price != null ? Number(price) : null;
                        if (online_sale_price !== undefined) data.online_sale_price = online_sale_price != null ? Number(online_sale_price) : null;
                        if (archived !== undefined) {
                            const a = String(archived).toUpperCase();
                            if (a === "Y" || a === "N") data.archived = a;
                        }
                    }
                    if (typeof u.current_quantity === "number") {
                        data.current_quantity = Math.trunc(u.current_quantity);
                        const before = beforeMap[u.sku] ?? 0;
                        const delta = Math.trunc(u.current_quantity) - before;
                        if (delta !== 0) lines.push({ sku: u.sku, delta });
                    }

                    await tx.item.update({
                        where: { sku_user_id: { sku: u.sku, user_id: userId } },
                        data,
                    });

                    ok.push(u.sku);
                } catch (e: any) {
                    failed.push({ sku: u.sku, error: e?.message ?? "update failed" });
                }
            }

            let log_id: number | undefined = undefined;
            if (lines.length) {
                log_id = await writeLogWithLines(userId, "bulk_edit", lines);
            }

            return { ok, failed, log_id };
        });

        res.json(result);
    } catch (err) {
        next(err);
    }
});

// POST /items/batch-create
// Body: { items: Array<{ sku: string; item_name: string; description?: string|null; current_quantity?: number; price?: number|null; online_sale_price?: number|null }>, note?: string }
router.post("/batch-create", async (req, res, next) => {
    try {
      const userId = req.user!.user_id;
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const note = req.body?.note ? String(req.body.note) : null;
      if (!items.length) return res.status(400).json({ error: "items is required" });
      if (items.length > 200) return res.status(400).json({ error: "batch limit is 200" });
  
      const data = items.map((x: any) => ({
        sku: String(x.sku),
        user_id: userId,
        item_name: String(x.item_name),
        description: x.description ?? null,
        current_quantity: Number.isFinite(Number(x.current_quantity)) ? Number(x.current_quantity) : 0,
        price: x.price != null ? Number(x.price) : null,
        online_sale_price: x.online_sale_price != null ? Number(x.online_sale_price) : null,
      }));
  
      const result = await prisma.$transaction(async (tx) => {
        await tx.item.createMany({ data, skipDuplicates: true });
        const lines = data.map((d: { sku: any; current_quantity: any; }) => ({ sku: d.sku, quantity: d.current_quantity ?? 0 }));
        const log = await tx.log.create({
          data: { user_id: userId, type: "bulk_create", note },
          select: { log_id: true },
        });
        if (lines.length) {
          await tx.log_item.createMany({
            data: lines.map((l: { sku: any; quantity: any; }) => ({ log_id: log.log_id, sku: l.sku, user_id: userId, quantity: l.quantity })),
          });
        }
        return { created: data.length, log_id: log.log_id };
      });
  
      res.status(201).json(result);
    } catch (err: any) {
      if (err?.code === "P2002") return res.status(409).json({ error: "Duplicate SKU" });
      next(err);
    }
  });
  

/** ---------- Existing endpoints with Decimal normalization ---------- **/

// GET /items
router.get("/", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const limitRaw = parseInt(String(req.query.limit ?? "20"), 10);
        const limit = Math.min(Math.max(isNaN(limitRaw) ? 20 : limitRaw, 1), 100);

        const cursorSku = req.query.cursor ? String(req.query.cursor) : undefined;
        const q = req.query.q ? String(req.query.q) : undefined;
        const categoryId = req.query.category_id ? Number(req.query.category_id) : undefined;

        const where: any = { user_id: userId };
        if (q) {
            where.OR = [
                { item_name: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
            ];
        }
        if (!Number.isNaN(categoryId) && categoryId !== undefined) {
            where.category_item = { some: { category_id: categoryId } };
        }

        const results = await prisma.item.findMany({
            where,
            take: limit + 1,
            ...(cursorSku ? { cursor: { sku_user_id: { sku: cursorSku, user_id: userId } }, skip: 1 } : {}),
            orderBy: [{ user_id: "asc" }, { sku: "asc" }],
        });

        const nextCursor = results.length > limit ? results.pop()!.sku : null;
        res.json({ items: results.map(serializeItem), nextCursor });
    } catch (err) {
        next(err);
    }
});

// GET /items/:sku
router.get("/:sku", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const sku = String(req.params.sku);

        const item = await prisma.item.findUnique({
            where: { sku_user_id: { sku, user_id: userId } },
        });

        if (!item) return res.status(404).json({ error: "Not found" });
        res.json(serializeItem(item));
    } catch (err) {
        next(err);
    }
});

// POST /items
router.post("/", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;

        const {
            sku,
            item_name,
            description,
            current_quantity,
            price,
            online_sale_price, // will remain undefined unless user sets it
        } = req.body ?? {};

        if (!sku || !item_name) {
            return res.status(400).json({ error: "sku and item_name are required" });
        }

        const initQty = Number.isFinite(Number(current_quantity)) ? Number(current_quantity) : 0;

        const created = await prisma.$transaction(async (tx) => {
            const item = await tx.item.create({
                data: {
                    sku: String(sku),
                    user_id: userId,
                    item_name: String(item_name),
                    description: description ?? null,
                    current_quantity: initQty,
                    price: price != null ? Number(price) : null,
                    online_sale_price: online_sale_price != null ? Number(online_sale_price) : null,
                },
            });

            const log = await tx.log.create({
                data: { user_id: userId, type: "created" },
                select: { log_id: true },
            });
            await tx.log_item.create({
                data: {
                    log_id: log.log_id,
                    sku: item.sku,
                    user_id: userId,
                    quantity: initQty,
                },
            });

            return item;
        });

        res.status(201).json(serializeItem(created));
    } catch (err: any) {
        if (err?.code === "P2002") {
            return res.status(409).json({ error: "Item with this sku already exists for this user" });
        }
        next(err);
    }
});

// PATCH /items/:sku
router.patch("/:sku", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const sku = String(req.params.sku);

        if (req.body?.sku !== undefined || req.body?.user_id !== undefined) {
            return res.status(400).json({ error: "Cannot change sku or user_id" });
        }

        const quantityDeltaRaw = req.body?.quantityDelta;
        const absQuantityRaw = req.body?.current_quantity;

        const {
            item_name,
            description,
            price,
            online_sale_price,
            reference_handle,
            token,
            variation_name,
            seo_title,
            seo_description,
            permalink,
            gtin,
            square_online_item_visibility,
            item_type,
            social_media_link_title,
            social_media_link_description,
            shipping_enabled,
            self_serve_ordering,
            delivery_enabled,
            pickup_enabled,
            archived,
            sellable,
            contains_alcohol,
            stockable,
            skip_detail_screen_in_pos,
            option_name_1,
            option_value_1,
            new_quantity,
            stock_alert_enabled,
            stock_alert_count,
            modifier,
        } = req.body ?? {};

        const data: any = {};
        if (item_name !== undefined) data.item_name = String(item_name);
        if (description !== undefined) data.description = description ?? null;
        if (price !== undefined) data.price = price != null ? Number(price) : null;
        if (online_sale_price !== undefined) data.online_sale_price = online_sale_price != null ? Number(online_sale_price) : null;

        const passthrough = {
            reference_handle, token, variation_name, seo_title, seo_description, permalink, gtin,
            square_online_item_visibility, item_type, social_media_link_title, social_media_link_description,
            shipping_enabled, self_serve_ordering, delivery_enabled, pickup_enabled, archived, sellable,
            contains_alcohol, stockable, skip_detail_screen_in_pos, option_name_1, option_value_1,
            new_quantity, stock_alert_enabled, stock_alert_count, modifier,
        };
        for (const [k, v] of Object.entries(passthrough)) {
            if (v !== undefined) data[k] = v;
        }

        if (quantityDeltaRaw === undefined && absQuantityRaw === undefined) {
            const updated = await prisma.item.update({
                where: { sku_user_id: { sku, user_id: userId } },
                data,
            });
            const updatedFields = Object.keys(data).reduce((acc: any, key) => {
                acc[key] = (updated as any)[key];
                return acc;
            }, { sku, user_id: userId });
            return res.json({ message: "Item updated", updatedFields });
        }

        const result = await prisma.$transaction(async (tx) => {
            let delta = 0;

            if (quantityDeltaRaw !== undefined) {
                delta = Number(quantityDeltaRaw);
                if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
                    throw Object.assign(new Error("quantityDelta must be an integer"), { status: 400 });
                }

                const updated = await tx.item.update({
                    where: { sku_user_id: { sku, user_id: userId } },
                    data: {
                        ...data,
                        current_quantity: { increment: delta },
                    },
                    select: { current_quantity: true },
                });

                await tx.log.create({
                    data: { user_id: userId, type: delta >= 0 ? "restock" : "sold" },
                    select: { log_id: true },
                }).then(async (log) => {
                    await tx.log_item.create({
                        data: { log_id: log.log_id, sku, user_id: userId, quantity: delta },
                    });
                });

                return { after: updated.current_quantity, delta };
            } else {
                const before = await tx.item.findUnique({
                    where: { sku_user_id: { sku, user_id: userId } },
                    select: { current_quantity: true },
                });
                if (!before) throw Object.assign(new Error("Not found"), { code: "P2025" });

                const abs = Number(absQuantityRaw);
                if (!Number.isFinite(abs) || !Number.isInteger(abs)) {
                    throw Object.assign(new Error("current_quantity must be an integer"), { status: 400 });
                }

                const beforeQty = before.current_quantity ?? 0;
                const delta2 = abs - beforeQty;

                const updated = await tx.item.update({
                    where: { sku_user_id: { sku, user_id: userId } },
                    data: { ...data, current_quantity: abs },
                    select: { current_quantity: true },
                });

                if (delta2 !== 0) {
                    await tx.log.create({
                        data: { user_id: userId, type: delta2 >= 0 ? "restock" : "sold" },
                        select: { log_id: true },
                    }).then(async (log) => {
                        await tx.log_item.create({
                            data: { log_id: log.log_id, sku, user_id: userId, quantity: delta2 },
                        });
                    });
                }

                return { after: updated.current_quantity, delta: delta2 };
            }
        });

        return res.json({
            message: "Item updated",
            quantity: { delta: result.delta, after: result.after },
        });
    } catch (err: any) {
        if (err?.code === "P2025") return res.status(404).json({ error: "Not found" });
        if (err?.status) return res.status(err.status).json({ error: err.message });
        next(err);
    }
});

// DELETE /items/:sku
router.delete("/:sku", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const sku = String(req.params.sku);

        await prisma.$transaction(async (tx) => {
            const deleted = await tx.item.delete({
                where: { sku_user_id: { sku, user_id: userId } },
                select: { current_quantity: true },
            });
            const qty = deleted.current_quantity ?? 0;

            const log = await tx.log.create({
                data: { user_id: userId, type: "removed" },
                select: { log_id: true },
            });
            await tx.log_item.create({
                data: { log_id: log.log_id, sku, user_id: userId, quantity: -qty },
            });
        });

        res.status(204).send();
    } catch (err: any) {
        if (err?.code === "P2025") return res.status(404).json({ error: "Not found" });
        next(err);
    }
});

export default router;
