// The Express app, shared by the local server (src/index.js) and the
// Vercel function (api/index.js). It doesn't listen or start timers itself.

import express from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { api } from "./routes/api.js";
import { ftc } from "./routes/ftc.js";
import { clips } from "./routes/clips.js";
import { scrimmages } from "./routes/scrimmages.js";
import { auth } from "./routes/auth.js";
import { updates } from "./routes/updates.js";
import { sendEventReminders } from "./services/updates.js";
import { loadUser } from "./services/auth.js";
import { allEvents, icsFor } from "./services/calendar.js";
import { syncAll } from "./services/sync.js";
import { HttpError, ah } from "./lib/util.js";

export const app = express();
app.disable("x-powered-by");
// credentials: the sign-in cookie must travel with API calls (local dev uses two ports)
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use(morgan(process.env.VERCEL ? "tiny" : "dev"));

// Serverless instances start cold: make sure Mongo is connected before any route runs.
app.use(ah(async (_req, _res, next) => {
  await connectDb();
  next();
}));
app.use(loadUser); // sets req.user from the session cookie

app.get("/", (_req, res) => res.json({ name: "ftc-scout-server", api: "/api", calendar: "/events.ics" }));

// Scheduled sync (Vercel Cron). Vercel sends `Authorization: Bearer $CRON_SECRET`
// when CRON_SECRET is set; without it the route is open like "Sync now".
app.get(
  "/api/cron/sync",
  ah(async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
    const result = await syncAll({ force: true });
    const out = Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v ? { ok: v.ok, message: v.message } : null]));
    try {
      out.email = await sendEventReminders(req);
    } catch (err) {
      out.email = { error: err.message };
    }
    res.json(out);
  }),
);

app.use("/api/auth", auth);
app.use("/api/updates", updates);
app.use("/api/ftc", ftc);
app.use("/api/clips", clips);
app.use("/api/scrims", scrimmages);
app.use("/api", api);
app.get(
  ["/events.ics", "/api/events.ics"],
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
  res.status(status).json({ error: err.message || "Server error", ...(err.code && typeof err.code === "string" && status < 500 ? { code: err.code } : {}) });
});
