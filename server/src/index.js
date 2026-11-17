// Local server: connect, listen, and keep the data fresh on an interval.
// (On Vercel, api/index.js serves the same app and Vercel Cron runs the sync.)

import { app } from "./app.js";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { syncAll } from "./services/sync.js";

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
