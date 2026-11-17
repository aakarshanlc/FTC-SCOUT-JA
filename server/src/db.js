import mongoose from "mongoose";
import { config } from "./config.js";

// One connection per process, shared across requests. On Vercel a warm
// function instance reuses it; a cold one connects on its first request.
let connecting = null;

export async function connectDb() {
  if (mongoose.connection.readyState === 1) return;
  connecting ??= (async () => {
    mongoose.set("strictQuery", true);
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 5 });
    console.log(`[db] connected to ${mongoose.connection.host}/${mongoose.connection.name}`);
  })().catch((err) => {
    connecting = null; // let the next request retry
    throw err;
  });
  await connecting;
}

export const dbState = () =>
  ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection.readyState] ??
  "unknown";
