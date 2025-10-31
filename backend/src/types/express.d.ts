import "express";

declare global {
  namespace Express {
    interface UserSession {
      user_id: number;
      email: string;
      squareUsername: string | null;
    }
    interface Request {
      user?: UserSession;
    }
  }
}
