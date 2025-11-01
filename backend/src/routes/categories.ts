import { Router } from "express";
import { prisma } from "../services/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { z } from "zod";

const router = Router();
router.use(requireAuth);

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

/** Prevent cycles: newParent cannot be in the descendant set of currentId */
async function assertNoCycle(userId: number, currentId: number, newParentId?: number | null) {
  if (newParentId == null) return;
  if (newParentId === currentId) {
    const err: any = new Error("Cannot set a category as its own parent");
    err.status = 400;
    throw err;
  }
  // Get all descendants of currentId
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

/** ---------- Routes ---------- **/

// POST /categories  (create)
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
        category_name, // citext handles case-insensitively; we trimmed in zod
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

// GET /categories?parent_id=<id|null>
// Lists children of the given parent (null = roots)
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user!.user_id;
    const parentParam = req.query.parent_id;
    const parentId =
      parentParam === undefined
        ? null // default to roots when not provided
        : parentParam === "null"
        ? null
        : Number(parentParam);

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

// GET /categories/:id  (returns category + breadcrumb)
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

    // Breadcrumb up to root
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

    res.json({ category: cat, breadcrumb: breadcrumb.reverse() /* root..self */ });
  } catch (err) {
    next(err);
  }
});

// PUT /categories/:id  (rename and/or move)
router.put("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.user_id;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

    const { category_name, parent_category_id } = parsed.data;

    // ensure category exists and belongs to user
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

// DELETE /categories/:id?cascade=1  (deletes subtree; also removes category_item links)
router.delete("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.user_id;
    const id = Number(req.params.id);
    const cascade = String(req.query.cascade ?? "1") === "1";
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

    // Ensure it exists
    const cat = await prisma.category.findUnique({
      where: { category_id_user_id: { category_id: id, user_id: userId } },
      select: { category_id: true },
    });
    if (!cat) return res.status(404).json({ error: "Not found" });

    if (!cascade) {
      // If not cascading, block delete if has children
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

    // Cascade delete: collect subtree, remove links, then delete categories (deepest first)
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
      // Remove item links for all categories in subtree
      await tx.$executeRaw`
        DELETE FROM "category_item"
        WHERE user_id = ${userId} AND category_id = ANY(${toDelete}::int[]);
      `;
      // Delete categories deepest-first
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

export default router;
