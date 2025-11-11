import { Router } from "express";
import { z } from "zod";
import argon2 from "argon2";
import { prisma } from "../services/prisma";
import jwt from "jsonwebtoken";
// import type { Request, Response, NextFunction } from "express";
import { AuthTokenPayload, requireAuth } from "../middleware/requireAuth";

const router = Router();


// Zod schema for validation
const signupSchema = z.object({
    email: z.string().email().max(254),
    password: z.string().min(8).max(128),
    squareUsername: z.string().trim().min(1).max(255).optional(),
});

// Zod schema for login
const loginSchema = z.object({
    email: z.string().email().max(254),
    password: z.string().min(8).max(128),
});


// POST /auth/signup
router.post("/signup", async (req, res) => {
    try {
        const parsed = signupSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.format() });
        }

        const { email, password, squareUsername } = parsed.data;

        // Hash password
        const hashedPassword = await argon2.hash(password);

        // Create user
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                squareUsername: squareUsername ?? null, // maps to username in DB
            },
            select: {
                user_id: true,
                email: true,
                squareUsername: true,
                created_at: true,
            },
        });

        res.status(201).json({ message: "User created successfully", user });
    } catch (err: any) {
        if (err.code === "P2002") {
            res.status(409).json({ error: "Email or Square username already exists" });
        } else {
            console.error(err);
            res.status(500).json({
                error: "Internal server error",
                details: err.message,
                code: err.code ?? null,
            });
        }
    }
});


// POST /auth/login
router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
    }

    const { email, password } = parsed.data;

    // 1) Look up user by email (CITEXT makes it case-insensitive in PG)
    const user = await prisma.user.findUnique({
        where: { email },
        select: {
            user_id: true,
            email: true,
            squareUsername: true,
            password: true, // hashed
        },
    });
    // Use the same reply for “user not found” and “bad password”
    if (!user) {
        return res.status(401).json({ error: "Invalid credentials [dev: user not found]" });
    }

    // 2) Verify password
    const ok = await argon2.verify(user.password, password);
    if (!ok) {
        return res.status(401).json({ error: "Invalid credentials [dev: bad password]" });
    }

    // 3) Create JWT
    const secret = process.env.SESSION_SECRET!;
    const token = jwt.sign(
        {
            sub: String(user.user_id),
            email: user.email,
            squareUsername: user.squareUsername ?? null,
        },
        secret,
        { expiresIn: "2h" }
    );

    // 4) Set HttpOnly cookie
    const cookieName = process.env.SESSION_COOKIE_NAME || "sid";
    const isProd = process.env.NODE_ENV === "production";
    res.cookie(cookieName, token, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 2, // 2h
        path: "/",
    });

    // 5) Return safe user payload
    return res.json({
        message: "Logged in",
        user: {
            user_id: user.user_id,
            email: user.email,
            squareUsername: user.squareUsername ?? null,
        },
    });
});


// POST /auth/logout
router.post("/logout", (req, res) => {
    const cookieName = process.env.SESSION_COOKIE_NAME || "sid";
    res.clearCookie(cookieName, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
    });
    return res.json({ message: "Logged out" });
});


// /auth/me (protected)
// routes/auth.ts
router.get("/me", (req, res) => {
    const cookieName = process.env.SESSION_COOKIE_NAME || "sid";
    const token = req.signedCookies?.[cookieName] || req.cookies?.[cookieName];
    if (!token) return res.sendStatus(401);
  
    try {
      const payload = jwt.verify(token, process.env.SESSION_SECRET! ) as {
        sub: string; email: string; squareUsername: string | null;
      };
      return res.json({
        loggedIn: true,
        user: { email: payload.email, squareUsername: payload.squareUsername },
      });
    } catch {
      return res.sendStatus(401);
    }
  });

// router.get("/auth/me", (req, res) => {
//     const token = req.cookies.sid;
//     if (!token) return res.sendStatus(401);
//     try {
//       const data = jwt.verify(token, process.env.SESSION_SECRET!);
//       // data contains email, squareUsername
//       res.json({ loggedIn: true, user: data });
//     } catch {
//       res.sendStatus(401);
//     }
//   });


// /health
// Usually health is PUBLIC so uptime checks don’t need auth.
// If you want a protected health, keep requireAuth and still use req.user.
router.get("/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
});

// Protected variant (optional)
router.get("/health/authed", requireAuth, (req, res) => {
    res.json({ ok: true, user_id: req.user!.user_id, time: new Date().toISOString() });
});

// backend/src/routes/auth.ts
router.patch("/me", requireAuth, async (req, res, next) => {
    try {
      const userId = req.user!.user_id;
      const { squareUsername } = req.body ?? {};
      if (squareUsername !== undefined) {
        const cleaned = String(squareUsername).trim();
        await prisma.user.update({
          where: { user_id: userId },
          data: { squareUsername: cleaned },
          select: { user_id: true, squareUsername: true },
        });
        return res.json({ ok: true, squareUsername: cleaned });
      }
      return res.status(400).json({ error: "squareUsername is required" });
    } catch (err) { next(err); }
  });
  

export default router;
