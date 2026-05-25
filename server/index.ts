import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { startSyncScheduler } from "./jobs/syncScheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = createApp();
  const server = createServer(app);

  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  const staticApp = express();
  staticApp.use(express.static(staticPath));
  staticApp.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  app.use(staticApp);
  app.use(errorHandler);

  startSyncScheduler();

  const port = env.PORT;

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`API: http://localhost:${port}/api/health`);
    console.log(`SSE: http://localhost:${port}/api/realtime/dashboard`);
  });
}

startServer().catch(console.error);
