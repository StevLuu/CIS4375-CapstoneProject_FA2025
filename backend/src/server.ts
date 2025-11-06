import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth";
import cookieParser from "cookie-parser";
import itemsRouter from "./routes/items";
import categoriesRouter from "./routes/categories";
import logsRouter from "./routes/logs";

const app = express();
app.use(express.json());
app.use(helmet());
app.use(cookieParser(process.env.SESSION_SECRET));
//app.use(cors());

const raw = process.env.FRONTEND_ORIGINS || "http://localhost:5173";
const ALLOW = raw.split(",").map(s => s.trim());

app.use(cors({
  origin(origin, cb) {
    // allow same-origin or tools like Postman (no Origin header)
    if (!origin) return cb(null, true);
    return cb(null, ALLOW.includes(origin));
  },
  credentials: true,
}));
  
app.use("/auth", authRoutes);
app.use("/items", itemsRouter);
app.use("/categories", categoriesRouter);
app.use("/logs", logsRouter);


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));