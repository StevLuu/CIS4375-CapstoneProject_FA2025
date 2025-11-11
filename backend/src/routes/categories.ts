// backend/src/routes/categories.ts
import { Router } from "express";
import { prisma } from "../services/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { z } from "zod";

const router = Router();
router.use(requireAuth);

// ---------- Decimal + field normalization ----------
type DecimalLike = number | string | { toNumber?: () => number } | null | undefined;

function toNum(x: DecimalLike): number | null {
    if (x == null) return null;
    if (typeof x === "number") return Number.isFinite(x) ? x : null;
    if (typeof x === "string") {
        const n = Number(x);
        return Number.isFinite(n) ? n : null;
    }
    try {
        const maybe = (x as any)?.toNumber?.();
        if (typeof maybe === "number" && Number.isFinite(maybe)) return maybe;
    } catch { }
    const n = Number(x as any);
    return Number.isFinite(n) ? n : null;
}

// Accept any Prisma item-like row and return a widened, normalized shape
type ItemRowIn = {
    archived: string | null;
    price?: DecimalLike;
    online_sale_price?: DecimalLike;
    current_quantity?: number | null;
} & Record<string, unknown>;

type ItemRowOut<T extends ItemRowIn> =
    Omit<T, "archived" | "price" | "online_sale_price" | "current_quantity"> & {
        archived: "Y" | "N";
        price: number | null;
        online_sale_price: number | null;
        current_quantity: number;
    };

function serializeItem<T extends ItemRowIn>(row: T): ItemRowOut<T> {
    const archivedYN = row.archived === "Y" ? "Y" : "N";
    const qty = Number.isFinite(row.current_quantity as any)
        ? Number(row.current_quantity)
        : Number(row.current_quantity ?? 0) || 0;

    return {
        ...(row as any),
        archived: archivedYN,
        price: toNum(row.price ?? null),
        online_sale_price: toNum(row.online_sale_price ?? null),
        current_quantity: qty,
    } as ItemRowOut<T>;
}


/** ---------- Helpers ---------- **/

const createSchema = z.object({
    category_name: z.string().trim().min(1, "category_name is required"),
    parent_category_id: z.number().int().positive().optional().nullable(),
});

const updateSchema = z.object({
    category_name: z.string().trim().min(1).optional(),
    parent_category_id: z.number().int().positive().nullable().optional(),
});

/** Assert parent belongs to same user (or is null) */
async function assertParentValid(userId: number, parentId?: number | null) {
    if (parentId == null) return;
    const parent = await prisma.category.findUnique({
        where: { category_id_user_id: { category_id: parentId, user_id: userId } },
        select: { category_id: true },
    });
    if (!parent) {
        const err: any = new Error("Parent category not found (or not yours)");
        err.status = 400;
        throw err;
    }
}


// GET /items/uncategorized?archived=exclude|include|only&q=&limit=&cursor=
router.get("/uncategorized", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const archived = String(req.query.archived ?? "exclude") as "exclude" | "include" | "only";
        const q = req.query.q ? String(req.query.q) : undefined;
        const cursorSku = req.query.cursor ? String(req.query.cursor) : undefined;
        const limitRaw = parseInt(String(req.query.limit ?? "100"), 10);
        const limit = Math.min(Math.max(isNaN(limitRaw) ? 100 : limitRaw, 1), 100);

        const where: any = {
            user_id: userId,
            category_item: { none: {} }, // no links
        };
        if (q) {
            where.OR = [
                { item_name: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
            ];
        }
        if (archived === "exclude") where.archived = "N";
        if (archived === "only") where.archived = "Y";

        const rows = await prisma.item.findMany({
            where,
            take: limit + 1,
            ...(cursorSku ? { cursor: { sku_user_id: { sku: cursorSku, user_id: userId } }, skip: 1 } : {}),
            orderBy: [{ user_id: "asc" }, { sku: "asc" }],
        });
        const nextCursor = rows.length > limit ? rows.pop()!.sku : null;
        res.json({ items: rows.map(serializeItem), nextCursor });
    } catch (err) {
        next(err);
    }
});


// GET /categories (children of parent)
router.get("/", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const parentParam = req.query.parent_id;
        const parentId =
            parentParam === undefined ? null : parentParam === "null" ? null : Number(parentParam);

        if (parentId !== null && Number.isNaN(parentId)) {
            return res.status(400).json({ error: "parent_id must be a number or 'null'" });
        }

        const children = await prisma.category.findMany({
            where: { user_id: userId, parent_category_id: parentId },
            orderBy: { category_name: "asc" },
            select: { category_id: true, category_name: true, parent_category_id: true },
        });

        res.json({ categories: children });
    } catch (err) {
        next(err);
    }
});


/** Prevent cycles: newParent cannot be in the descendant set of currentId */
async function assertNoCycle(userId: number, currentId: number, newParentId?: number | null) {
    if (newParentId == null) return;
    if (newParentId === currentId) {
        const err: any = new Error("Cannot set a category as its own parent");
        err.status = 400;
        throw err;
    }
    const rows: Array<{ category_id: number }> = await prisma.$queryRaw`
    WITH RECURSIVE down AS (
      SELECT c.category_id, c.parent_category_id
      FROM "category" c
      WHERE c.user_id = ${userId} AND c.category_id = ${currentId}
      UNION ALL
      SELECT ch.category_id, ch.parent_category_id
      FROM "category" ch
      JOIN down d ON ch.parent_category_id = d.category_id
      WHERE ch.user_id = ${userId}
    )
    SELECT category_id FROM down;
  `;
    if (rows.some(r => r.category_id === newParentId)) {
        const err: any = new Error("Cannot move a category under its own descendant");
        err.status = 400;
        throw err;
    }
}



/** ---------- New: tree endpoint ---------- **/

// GET /categories/tree?depth=1&includeCounts=none|direct|subtree&parent_id=<id|null>
// Returns roots when parent_id is omitted or "null". Returns a list of nodes with optional one-level children.
router.get("/tree", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const depth = Math.max(0, Math.min(2, Number(req.query.depth ?? 1)));
        const includeCounts = String(req.query.includeCounts ?? "direct") as "none" | "direct" | "subtree";

        const parentParam = req.query.parent_id;
        const parentId =
            parentParam === undefined
                ? null
                : parentParam === "null"
                    ? null
                    : Number(parentParam);
        if (parentId !== null && Number.isNaN(parentId)) {
            return res.status(400).json({ error: "parent_id must be a number or 'null'" });
        }

        // direct children for a parent
        const nodes = await prisma.category.findMany({
            where: { user_id: userId, parent_category_id: parentId },
            orderBy: { category_name: "asc" },
            select: { category_id: true, category_name: true, parent_category_id: true },
        });

        // compute has_children in one query
        const ids = nodes.map(n => n.category_id);
        let hasChildren: Record<number, boolean> = {};
        if (ids.length) {
            const rows: Array<{ parent_category_id: number; cnt: bigint }> = await prisma.$queryRaw`
        SELECT parent_category_id, COUNT(*)::bigint AS cnt
        FROM "category"
        WHERE user_id = ${userId} AND parent_category_id = ANY(${ids}::int[])
        GROUP BY parent_category_id;
      `;
            hasChildren = rows.reduce((m, r) => {
                m[r.parent_category_id] = Number(r.cnt) > 0;
                return m;
            }, {} as Record<number, boolean>);
        }

        // optional counts
        let directCounts: Record<number, number> = {};
        let subtreeCounts: Record<number, number> = {};
        if (includeCounts !== "none" && ids.length) {
            // direct counts
            const drows: Array<{ category_id: number; cnt: bigint }> = await prisma.$queryRaw`
        SELECT ci.category_id, COUNT(DISTINCT ci.sku)::bigint AS cnt
        FROM "category_item" ci
        WHERE ci.user_id = ${userId} AND ci.category_id = ANY(${ids}::int[])
        GROUP BY ci.category_id;
      `;
            directCounts = drows.reduce((m, r) => {
                m[r.category_id] = Number(r.cnt);
                return m;
            }, {} as Record<number, number>);

            if (includeCounts === "subtree") {
                const srows: Array<{ category_id: number; cnt: bigint }> = await prisma.$queryRaw`
          WITH RECURSIVE sub(id) AS (
            SELECT unnest(${ids}::int[])
          ),
          tree AS (
            SELECT c.category_id, c.parent_category_id
            FROM "category" c
            WHERE c.user_id = ${userId}
          ),
          subtrees AS (
            SELECT s.id AS root, t.category_id
            FROM sub s
            JOIN tree t ON t.category_id = s.id
            UNION ALL
            SELECT st.root, t2.category_id
            FROM subtrees st
            JOIN tree t2 ON t2.parent_category_id = st.category_id
          ),
          links AS (
            SELECT DISTINCT st.root, ci.sku
            FROM subtrees st
            JOIN "category_item" ci ON ci.user_id = ${userId} AND ci.category_id = st.category_id
          )
          SELECT root AS category_id, COUNT(DISTINCT sku)::bigint AS cnt
          FROM links
          GROUP BY root;
        `;
                subtreeCounts = srows.reduce((m, r) => {
                    m[r.category_id] = Number(r.cnt);
                    return m;
                }, {} as Record<number, number>);
            }
        }

        let childrenMap: Record<number, any[]> = {};
        if (depth >= 1 && ids.length) {
            const children = await prisma.category.findMany({
                where: { user_id: userId, parent_category_id: { in: ids } },
                orderBy: { category_name: "asc" },
                select: { category_id: true, category_name: true, parent_category_id: true },
            });
            for (const c of children) {
                const arr = childrenMap[c.parent_category_id ?? -1] ?? [];
                arr.push({
                    category_id: c.category_id,
                    category_name: c.category_name,
                    parent_category_id: c.parent_category_id,
                    has_children: false, // unknown at this depth
                });
                childrenMap[c.parent_category_id ?? -1] = arr;
            }
        }

        const result = nodes.map(n => ({
            category_id: n.category_id,
            category_name: n.category_name,
            parent_category_id: n.parent_category_id ?? null,
            has_children: !!hasChildren[n.category_id],
            counts:
                includeCounts === "none"
                    ? undefined
                    : {
                        direct: directCounts[n.category_id] ?? 0,
                        subtree:
                            includeCounts === "subtree" ? subtreeCounts[n.category_id] ?? 0 : undefined,
                    },
            children: childrenMap[n.category_id] ?? undefined,
        }));

        // Optional caching headers for client If-None-Match in future
        res.json({ nodes: result });
    } catch (err) {
        next(err);
    }
});

// items.ts, above :sku
router.get("/__ping", (req, res) => res.json({ ok: true }));


// GET /categories/:id (with breadcrumb)
router.get("/:id", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

        const cat = await prisma.category.findUnique({
            where: { category_id_user_id: { category_id: id, user_id: userId } },
            select: { category_id: true, category_name: true, parent_category_id: true },
        });
        if (!cat) return res.status(404).json({ error: "Not found" });

        const breadcrumb: Array<{ category_id: number; category_name: string; parent_category_id: number | null }> =
            await prisma.$queryRaw`
        WITH RECURSIVE up AS (
          SELECT c.category_id, c.category_name, c.parent_category_id
          FROM "category" c
          WHERE c.user_id = ${userId} AND c.category_id = ${id}
          UNION ALL
          SELECT p.category_id, p.category_name, p.parent_category_id
          FROM "category" p
          JOIN up u ON u.parent_category_id = p.category_id
          WHERE p.user_id = ${userId}
        )
        SELECT * FROM up;
      `;

        res.json({ category: cat, breadcrumb: breadcrumb.reverse() });
    } catch (err) {
        next(err);
    }
});


// POST /categories
router.post("/", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const parsed = createSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

        const { category_name, parent_category_id } = parsed.data;

        await assertParentValid(userId, parent_category_id ?? null);

        const created = await prisma.category.create({
            data: {
                user_id: userId,
                category_name,
                parent_category_id: parent_category_id ?? null,
            },
            select: { category_id: true, user_id: true, category_name: true, parent_category_id: true },
        });

        res.status(201).json({ category: created });
    } catch (err: any) {
        if (err?.code === "P2002") {
            return res.status(409).json({ error: "Duplicate category name under the same parent" });
        }
        next(err);
    }
});


// PUT /categories/:id
router.put("/:id", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

        const parsed = updateSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

        const { category_name, parent_category_id } = parsed.data;

        const exists = await prisma.category.findUnique({
            where: { category_id_user_id: { category_id: id, user_id: userId } },
            select: { category_id: true },
        });
        if (!exists) return res.status(404).json({ error: "Not found" });

        if (parent_category_id !== undefined) {
            await assertParentValid(userId, parent_category_id);
            await assertNoCycle(userId, id, parent_category_id);
        }

        const updated = await prisma.category.update({
            where: { category_id_user_id: { category_id: id, user_id: userId } },
            data: {
                ...(category_name !== undefined ? { category_name } : {}),
                ...(parent_category_id !== undefined ? { parent_category_id } : {}),
            },
            select: { category_id: true, category_name: true, parent_category_id: true },
        });

        res.json({ category: updated });
    } catch (err: any) {
        if (err?.code === "P2002") {
            return res.status(409).json({ error: "Duplicate category name under the same parent" });
        }
        next(err);
    }
});

// DELETE /categories/:id
router.delete("/:id", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const id = Number(req.params.id);
        const cascade = String(req.query.cascade ?? "1") === "1";
        if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

        const cat = await prisma.category.findUnique({
            where: { category_id_user_id: { category_id: id, user_id: userId } },
            select: { category_id: true },
        });
        if (!cat) return res.status(404).json({ error: "Not found" });

        if (!cascade) {
            const childCount = await prisma.category.count({
                where: { user_id: userId, parent_category_id: id },
            });
            if (childCount > 0) {
                return res.status(400).json({ error: "Category has children. Use ?cascade=1 to delete subtree." });
            }
            await prisma.$transaction([
                prisma.category_item.deleteMany({ where: { user_id: userId, category_id: id } }),
                prisma.category.delete({ where: { category_id_user_id: { category_id: id, user_id: userId } } }),
            ]);
            return res.status(204).send();
        }

        const ids: Array<{ category_id: number; depth: number }> = await prisma.$queryRaw`
      WITH RECURSIVE down AS (
        SELECT c.category_id, c.parent_category_id, 0::int AS depth
        FROM "category" c
        WHERE c.user_id = ${userId} AND c.category_id = ${id}
        UNION ALL
        SELECT ch.category_id, ch.parent_category_id, down.depth + 1
        FROM "category" ch
        JOIN down ON ch.parent_category_id = down.category_id
        WHERE ch.user_id = ${userId}
      )
      SELECT category_id, depth FROM down;
    `;

        if (ids.length === 0) return res.status(204).send();
        const toDelete = ids.sort((a, b) => b.depth - a.depth).map(r => r.category_id);

        await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`
        DELETE FROM "category_item"
        WHERE user_id = ${userId} AND category_id = ANY(${toDelete}::int[]);
      `;
            await tx.$executeRaw`
        DELETE FROM "category"
        WHERE user_id = ${userId} AND category_id = ANY(${toDelete}::int[]);
      `;
        });

        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

/** ---------- Batch attach and detach ---------- **/

// POST /categories/:id/items/batch { action: 'attach' | 'detach', skus: string[] }
router.post("/:id/items/batch", async (req, res, next) => {
    try {
        const userId = req.user!.user_id;
        const categoryId = Number(req.params.id);
        const action = String(req.body?.action ?? "attach");
        const skus: string[] = Array.isArray(req.body?.skus) ? req.body.skus.map(String) : [];

        if (!Number.isInteger(categoryId)) return res.status(400).json({ error: "Invalid category id" });
        if (!["attach", "detach"].includes(action)) return res.status(400).json({ error: "action must be 'attach' or 'detach'" });
        if (skus.length === 0) return res.status(400).json({ error: "skus is required" });

        const cat = await prisma.category.findUnique({
            where: { category_id_user_id: { category_id: categoryId, user_id: userId } },
            select: { category_id: true },
        });
        if (!cat) return res.status(404).json({ error: "Category not found" });

        if (action === "attach") {
            await prisma.$executeRawUnsafe(
                `
          INSERT INTO "category_item" (category_id, sku, user_id)
          SELECT $1::int, v.sku, $2::int
          FROM UNNEST($3::text[]) AS v(sku)
          ON CONFLICT DO NOTHING
          `,
                categoryId,
                userId,
                skus
            );
            return res.status(201).json({ attached: skus.length });
        } else {
            const { count } = await prisma.category_item.deleteMany({
                where: { category_id: categoryId, user_id: userId, sku: { in: skus } },
            });
            return res.status(200).json({ removed: count });
        }
    } catch (err) {
        next(err);
    }
});



export default router;
