import express from "express";
import { corsMiddleware } from "./middleware/cors.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { apiRouter } from "./routes/index.js";

export function createApp(): express.Application {
  const app = express();

  app.use(corsMiddleware);
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", apiRouter);

  return app;
}
