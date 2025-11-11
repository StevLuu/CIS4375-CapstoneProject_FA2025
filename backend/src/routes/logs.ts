// backend/src/routes/logs.ts
import express from "express";
import { requireAuth } from "../middleware/requireAuth";
import { prisma } from "../services/prisma";
import { Prisma } from "@prisma/client";

const router = express.Router();

/** CREATE new log manually (with optional note) */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.user_id;
    const { type, note, lines } = req.body ?? {};

    if (!type || !Array.isArray(lines) || !lines.length) {
      return res.status(400).json({ error: "type and non-empty lines[] required" });
    }

    const log = await prisma.$transaction(async (tx) => {
      const created = await tx.log.create({
        data: { user_id: userId, type: String(type), note: note ?? null },
        select: { log_id: true },
      });

      await tx.log_item.createMany({
        data: lines.map((l: any) => ({
          log_id: created.log_id,
          sku: String(l.sku),
          user_id: userId,
          quantity: Number(l.delta ?? l.quantity ?? 0),
        })),
      });

      return created;
    });

    res.status(201).json({ message: "Log created", log_id: log.log_id });
  } catch (err) {
    next(err);
  }
});


/** READ all logs */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.user_id;
    const { type, limit = 50, cursor, with_items } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const includeItems = String(with_items ?? "") === "1";

    const base: Prisma.logFindManyArgs = {
      where: { user_id: userId, ...(type ? { type: String(type) } : {}) },
      orderBy: { timestamp: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { log_id: Number(cursor) } } : {}),
    };

    if (includeItems) {
      base.include = { log_item: true };
    } else {
      base.select = { log_id: true, timestamp: true, type: true, note: true };
    }

    const logs = await prisma.log.findMany(base);
    const nextCursor = logs.length === take ? logs[logs.length - 1].log_id : null;

    res.json({ logs, nextCursor });
  } catch (err) {
    next(err);
  }
});


/** READ logs for a specific item */
router.get("/items/:sku", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.user_id;
    const sku = String(req.params.sku);
    const { limit = 50, cursor } = req.query;
    const take = Math.min(Number(limit) || 50, 200);

    const logs = await prisma.log.findMany({
      where: { user_id: userId, log_item: { some: { sku } } },
      orderBy: { timestamp: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { log_id: Number(cursor) } } : {}),
      include: { log_item: { where: { sku } } },
    });

    const nextCursor =
      logs.length === take ? logs[logs.length - 1].log_id : null;

    res.json({ logs, nextCursor });
  } catch (err) {
    next(err);
  }
});

/** UPDATE log (type or note) */
router.patch("/:log_id", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.user_id;
    const logId = Number(req.params.log_id);
    const { type, note } = req.body ?? {};

    const updated = await prisma.log.updateMany({
      where: { log_id: logId, user_id: userId },
      data: {
        ...(type !== undefined ? { type: String(type) } : {}),
        ...(note !== undefined ? { note: String(note) } : {}),
      },
    });

    if (!updated.count) return res.status(404).json({ error: "Log not found" });
    res.json({ message: "Log updated" });
  } catch (err) {
    next(err);
  }
});

/** UPDATE log_item quantity (adjust mis-logged amount) */
router.patch("/:log_id/items/:sku", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.user_id;
    const logId = Number(req.params.log_id);
    const sku = String(req.params.sku);
    const { quantity } = req.body ?? {};

    if (quantity === undefined || !Number.isFinite(Number(quantity))) {
      return res.status(400).json({ error: "quantity required" });
    }

    const updated = await prisma.log_item.updateMany({
      where: { log_id: logId, sku, user_id: userId },
      data: { quantity: Number(quantity) },
    });

    if (!updated.count) return res.status(404).json({ error: "Log item not found" });
    res.json({ message: "Log item updated" });
  } catch (err) {
    next(err);
  }
});

/** DELETE a full log (cascade removes log_items) */
router.delete("/:log_id", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.user_id;
    const logId = Number(req.params.log_id);

    await prisma.log.deleteMany({ where: { log_id: logId, user_id: userId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/** DELETE a single log_item */
router.delete("/:log_id/items/:sku", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.user_id;
    const logId = Number(req.params.log_id);
    const sku = String(req.params.sku);

    await prisma.log_item.deleteMany({
      where: { log_id: logId, sku, user_id: userId },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
