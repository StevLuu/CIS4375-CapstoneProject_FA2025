import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export interface AuthTokenPayload extends jwt.JwtPayload {
  sub: string;
  email: string;
  squareUsername?: string | null;
}

function isAuthPayload(x: unknown): x is AuthTokenPayload {
  return !!x && typeof x === "object"
    && typeof (x as any).sub === "string"
    && typeof (x as any).email === "string";
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const cookieName = process.env.SESSION_COOKIE_NAME || "sid";
  const token = (req as any).cookies?.[cookieName];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decodedUnknown = jwt.verify(token, process.env.SESSION_SECRET!);
    if (!isAuthPayload(decodedUnknown)) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const user_id = Number(decodedUnknown.sub);
    if (!Number.isInteger(user_id)) {
      return res.status(401).json({ error: "Invalid subject" });
    }

    req.user = {
      user_id,
      email: decodedUnknown.email,
      squareUsername: decodedUnknown.squareUsername ?? null,
    };

    next();
  } catch (e) {
    console.error("JWT verify failed:", e);
    res.status(401).json({ error: "Unauthorized" });
  }
}
