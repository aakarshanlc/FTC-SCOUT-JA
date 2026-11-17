// One-off sync: `npm run sync` (add `-- --full` to re-import every FTCScout season)
import mongoose from "mongoose";
import { connectDb } from "../db.js";
import { syncAll } from "../services/sync.js";

await connectDb();
const res = await syncAll({ full: process.argv.includes("--full"), force: true });
for (const [name, log] of Object.entries(res)) {
  if (!log) continue;
  console.log(`${name}:`, log.ok ? "ok" : "FAILED", "-", log.message, log.counts ? JSON.stringify(Object.fromEntries(log.counts)) : "");
}
await mongoose.disconnect();
