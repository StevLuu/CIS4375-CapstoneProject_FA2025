import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export interface AuthTokenPayload extends jwt.JwtPayload {
    sub: string;                      // JWT ‘sub’ is a string
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
    // TEMP debug:
    console.log("requireAuth token present?", !!token);
  
    if (!token) return res.status(401).json({ error: "Unauthorized" });
  
    try {
      const decoded = jwt.verify(token, process.env.SESSION_SECRET!);
      // TEMP debug:
      console.log("decoded payload:", typeof decoded === "string" ? decoded : { sub: (decoded as any).sub, email: (decoded as any).email });
  
      if (typeof decoded === "string" || !(decoded as any)?.sub) {
        return res.status(401).json({ error: "Invalid token" });
      }
      (req as any).user = decoded; // attach
      next();
    } catch (e) {
      console.error("JWT verify failed:", e);
      res.status(401).json({ error: "Unauthorized" });
    }
  }
  
