import express from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { api } from "./routes/api.js";
import { ftc } from "./routes/ftc.js";
import { clips } from "./routes/clips.js";
import { scrimmages } from "./routes/scrimmages.js";
import { allEvents, icsFor } from "./services/calendar.js";
import { syncAll } from "./services/sync.js";
import { ah } from "./lib/util.js";

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: "100kb" }));
app.use(morgan("dev"));

app.get("/", (_req, res) => res.json({ name: "ftc-scout-server", api: "/api", calendar: "/events.ics" }));
app.use("/api/ftc", ftc);
app.use("/api/clips", clips);
app.use("/api/scrims", scrimmages);
app.use("/api", api);
app.get(
  "/events.ics",
  ah(async (_req, res) => {
    res
      .type("text/calendar; charset=utf-8")
      .set("Cache-Control", "public, max-age=300")
      .set("Content-Disposition", 'inline; filename="ftc-scout-events.ics"')
      .send(icsFor(await allEvents()));
  }),
);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status ?? (err.name === "ValidationError" ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || "Server error" });
});

async function main() {
  await connectDb();
  app.listen(config.port, () => console.log(`[api] listening on http://localhost:${config.port}`));

  syncAll();
  if (config.syncIntervalSeconds > 0) {
    setInterval(syncAll, config.syncIntervalSeconds * 1000).unref();
  }
}

main().catch((err) => {
  console.error(`[api] failed to start: ${err.message}`);
  console.error("Is MongoDB running? From the repo root: docker compose up -d");
  process.exit(1);
});
