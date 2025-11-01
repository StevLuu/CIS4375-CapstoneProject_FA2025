import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth";
import cookieParser from "cookie-parser";
import itemsRouter from "./routes/items";
import categoriesRouter from "./routes/categories";

const app = express();
app.use(express.json());
app.use(helmet());
app.use(cookieParser(process.env.SESSION_SECRET));
//app.use(cors());

//for dev
app.use(
    cors({
      origin: ["http://localhost:5173"], // your React dev server
      credentials: true,                 // allow cookies to be sent
    })
  );
  
app.use("/auth", authRoutes);
app.use("/items", itemsRouter);
app.use("/categories", categoriesRouter);


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));