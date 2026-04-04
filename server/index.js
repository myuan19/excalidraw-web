import express from "express";
import cors from "cors";
import filesRouter from "./routes/files.js";
import libraryRouter from "./routes/library.js";
import aiSettingsRouter from "./routes/ai-settings.js";

const app = express();
const PORT = process.env.PORT || 3033;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.use("/api/files", filesRouter);
app.use("/api/library", libraryRouter);
app.use("/api/ai-settings", aiSettingsRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const HOST = process.env.LISTEN_HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`[excalidraw-server] listening on http://${HOST}:${PORT}`);
});
