import express from "express";
import { z } from "zod";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { AuthTokenPayload, requireAuth } from "../middleware/requireAuth";


const prisma = new PrismaClient();
const router = express.Router();

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


// export function requireAuth(req: Request, res: Response, next: NextFunction) {
//     const cookieName = process.env.SESSION_COOKIE_NAME || "sid";
//     const token = req.cookies?.[cookieName];
//     if (!token) return res.status(401).json({ error: "Unauthorized" });

//     try {
//         const payload = jwt.verify(token, process.env.SESSION_SECRET!);
//         // attach to req for later use
//         (req as any).auth = payload;
//         next();
//     } catch {
//         return res.status(401).json({ error: "Unauthorized" });
//     }
// }


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
    res.clearCookie(cookieName, { path: "/" });
    res.json({ message: "Logged out" });
});


// test route for requireAuth
router.get("/me", requireAuth, async (req, res) => {
    const auth = (req as any).user as AuthTokenPayload | undefined;
    if (!auth?.sub) return res.status(401).json({ error: "Not authenticated" });
  
    const me = await prisma.user.findUnique({
      where: { user_id: Number(auth.sub) },
      select: { user_id: true, email: true, squareUsername: true, created_at: true },
    });
    if (!me) return res.status(404).json({ error: "User not found" });
    res.json({ user: me });
  });
export default router;
