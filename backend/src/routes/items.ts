// src/routes/items.ts
import { Router } from "express";
import { prisma } from "../services/prisma";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();
router.use(requireAuth);

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

        // pick only fields we allow; sku + item_name are the essentials here
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

        // Create with required composite key (sku, user_id)
        const created = await prisma.item.create({
            data: {
                sku: String(sku),
                user_id: userId,
                item_name: String(item_name),
                description: description ?? null,
                current_quantity: Number.isFinite(Number(current_quantity)) ? Number(current_quantity) : 0,
                price: price != null ? Number(price) : null,                 // Decimal(10,2) — Prisma accepts JS number
                online_sale_price: online_sale_price != null ? Number(online_sale_price) : null,
                // everything else can stay default/nullable
            },
        });

        res.status(201).json(created);
    } catch (err: any) {
        // Handle unique-violation on (sku,user_id)
        if (err?.code === "P2002") {
            return res.status(409).json({ error: "Item with this sku already exists for this user" });
        }
        next(err);
    }
});

// PATCH /items/:sku  (update allowed fields)
router.patch("/:sku", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const sku = String(req.params.sku);

        // Disallow changing PK parts
        if (req.body?.sku !== undefined || req.body?.user_id !== undefined) {
            return res.status(400).json({ error: "Cannot change sku or user_id" });
        }

        // Pick only fields we allow to update
        const {
            item_name,
            description,
            current_quantity,
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

        if (current_quantity !== undefined) {
            const cq = Number(current_quantity);
            if (!Number.isFinite(cq) || cq < 0) return res.status(400).json({ error: "current_quantity must be >= 0" });
            data.current_quantity = cq;
        }

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

        const updated = await prisma.item.update({
            where: { sku_user_id: { sku, user_id: userId } },
            data,
        });

        // Only include updated fields in response
        const updatedFields = Object.keys(data).reduce((acc: any, key) => {
            acc[key] = (updated as any)[key];
            return acc;
        }, { sku, user_id: userId });

        res.json({
            message: "Item updated",
            updatedFields,
        });


        res.json(updated);
    } catch (err: any) {
        // P2025 = record not found
        if (err?.code === "P2025") return res.status(404).json({ error: "Not found" });
        next(err);
    }
});

// DELETE /items/:sku
router.delete("/:sku", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const sku = String(req.params.sku);

        await prisma.item.delete({
            where: { sku_user_id: { sku, user_id: userId } },
        });

        res.status(204).send();
    } catch (err: any) {
        if (err?.code === "P2025") return res.status(404).json({ error: "Not found" });
        next(err);
    }
});



export default router;
