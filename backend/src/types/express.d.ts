import "express";
import { AuthTokenPayload } from "../middleware/requireAuth";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthTokenPayload;
  }
}