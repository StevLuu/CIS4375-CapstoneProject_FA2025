// src/routes/items.ts
import { Router } from "express";
import { prisma } from "../services/prisma";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();
router.use(requireAuth);

// helpers/stock.ts (or top of items.ts)
async function writeLogWithLines(userId: number, type: string, lines: Array<{ sku: string, delta: number, after?: number }>, note?: string | null) {
    const log = await prisma.log.create({
        data: { user_id: userId, type, /* timestamp defaults now() */ },
        select: { log_id: true }
    });

    if (lines.length) {
        await prisma.log_item.createMany({
            data: lines.map(l => ({
                log_id: log.log_id,
                sku: l.sku,
                user_id: userId,
                quantity: l.delta,             // signed delta
                // If you later add columns:
                // prev_quantity: l.prev ?? undefined,
                // after_quantity: l.after ?? undefined,
            }))
        });
    }
    return log.log_id;
}


// GET /items?limit=20&cursor=<sku>&q=...&category_id=123
router.get("/", async (req, res, next) => {
    try {
        const userId = req.user!.user_id; // normalized session
        const limitRaw = parseInt(String(req.query.limit ?? "20"), 10);
        const limit = Math.min(Math.max(isNaN(limitRaw) ? 20 : limitRaw, 1), 100);

        const cursorSku = req.query.cursor ? String(req.query.cursor) : undefined;
        const q = req.query.q ? String(req.query.q) : undefined;
        const categoryId = req.query.category_id ? Number(req.query.category_id) : undefined;

        // Build filters per your schema fields
        const where: any = { user_id: userId };
        if (q) {
            where.OR = [
                { item_name: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
            ];
        }
        if (!Number.isNaN(categoryId) && categoryId !== undefined) {
            // category via join table category_item
            where.category_item = { some: { category_id: categoryId } };
        }

        const results = await prisma.item.findMany({
            where,
            take: limit + 1,
            // With a composite PK @@id([sku, user_id]) we must use the compound cursor
            ...(cursorSku
                ? { cursor: { sku_user_id: { sku: cursorSku, user_id: userId } }, skip: 1 }
                : {}),
            // Deterministic order matching the cursor fields
            orderBy: [{ user_id: "asc" }, { sku: "asc" }],
        });

        const nextCursor = results.length > limit ? results.pop()!.sku : null;
        res.json({ items: results, nextCursor });
    } catch (err) {
        next(err);
    }
});

// GET /items/:sku  (scoped by session user_id)
router.get("/:sku", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const sku = String(req.params.sku);

        const item = await prisma.item.findUnique({
            where: { sku_user_id: { sku, user_id: userId } },
        });

        if (!item) return res.status(404).json({ error: "Not found" });
        res.json(item);
    } catch (err) {
        next(err);
    }
});

// POST /items  (create one)
router.post("/", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;

        const {
            sku,
            item_name,
            description,
            current_quantity,
            price,
            online_sale_price,
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

            // Log creation (delta = initial quantity; may be 0 or negative if provided)
            await tx.log.create({
                data: { user_id: userId, type: "created" },
                select: { log_id: true },
            }).then(async (log) => {
                await tx.log_item.create({
                    data: {
                        log_id: log.log_id,
                        sku: item.sku,
                        user_id: userId,
                        quantity: initQty,   // delta == initial
                    }
                });
            });

            return item;
        });

        res.status(201).json(created);
    } catch (err: any) {
        if (err?.code === "P2002") {
            return res.status(409).json({ error: "Item with this sku already exists for this user" });
        }
        next(err);
    }
});
// PATCH /items/:sku  (partial update + quantity change support)
router.patch("/:sku", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const sku = String(req.params.sku);

        if (req.body?.sku !== undefined || req.body?.user_id !== undefined) {
            return res.status(400).json({ error: "Cannot change sku or user_id" });
        }

        // Extract explicit delta or absolute quantity
        const quantityDeltaRaw = req.body?.quantityDelta;
        const absQuantityRaw = req.body?.current_quantity;

        // Everything else: passthrough fields (unchanged from your original)
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

        // Map the rest 1:1 (allow nullables)
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

        // If neither quantityDelta nor absolute current_quantity, just do a normal patch (no log).
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

        // If a quantity change is requested, run a single transaction to update & log
        const result = await prisma.$transaction(async (tx) => {
            let delta = 0;

            if (quantityDeltaRaw !== undefined) {
                // Preferred path: no pre-read
                delta = Number(quantityDeltaRaw);
                if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
                    throw Object.assign(new Error("quantityDelta must be an integer"), { status: 400 });
                }

                // Apply other field changes + delta update atomically
                const updated = await tx.item.update({
                    where: { sku_user_id: { sku, user_id: userId } },
                    data: {
                        ...data,
                        current_quantity: { increment: delta }, // allows negative stock
                    },
                    select: { current_quantity: true }
                });

                // Write log (+single line)
                await tx.log.create({
                    data: { user_id: userId, type: delta >= 0 ? "restock" : "sold" },
                    select: { log_id: true },
                }).then(async (log) => {
                    await tx.log_item.create({
                        data: {
                            log_id: log.log_id,
                            sku,
                            user_id: userId,
                            quantity: delta,
                            // If you add after_quantity later, set it to updated.current_quantity
                        }
                    });
                });

                return { after: updated.current_quantity, delta };
            } else {
                // Absolute set path: one small read to compute delta
                const before = await tx.item.findUnique({
                    where: { sku_user_id: { sku, user_id: userId } },
                    select: { current_quantity: true }
                });
                if (!before) throw Object.assign(new Error("Not found"), { code: "P2025" });

                const abs = Number(absQuantityRaw);
                if (!Number.isFinite(abs) || !Number.isInteger(abs)) {
                    throw Object.assign(new Error("current_quantity must be an integer"), { status: 400 });
                }

                const beforeQty = (before.current_quantity ?? 0); // <-- handle null
                const delta = abs - beforeQty;

                const updated = await tx.item.update({
                    where: { sku_user_id: { sku, user_id: userId } },
                    data: { ...data, current_quantity: abs },
                    select: { current_quantity: true }
                });

                if (delta !== 0) {
                    await tx.log.create({
                        data: { user_id: userId, type: delta >= 0 ? "restock" : "sold" },
                        select: { log_id: true },
                    }).then(async (log) => {
                        await tx.log_item.create({
                            data: { log_id: log.log_id, sku, user_id: userId, quantity: delta }
                        });
                    });
                }

                return { after: updated.current_quantity, delta };
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
            // unchanged, this now succeeds because log_item no longer FKs to item
            const deleted = await tx.item.delete({
                where: { sku_user_id: { sku, user_id: userId } },
                select: { current_quantity: true }
            });
            const qty = deleted.current_quantity ?? 0;

            const log = await tx.log.create({
                data: { user_id: userId, type: "removed" },
                select: { log_id: true },
            });
            await tx.log_item.create({
                data: {
                    log_id: log.log_id,
                    sku,
                    user_id: userId,
                    quantity: -qty,
                }
            });

        });


        res.status(204).send();
    } catch (err: any) {
        if (err?.code === "P2025") return res.status(404).json({ error: "Not found" });
        next(err);
    }
});




export default router;
