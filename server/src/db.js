import mongoose from "mongoose";
import { config } from "./config.js";

export async function connectDb() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log(`[db] connected to ${mongoose.connection.host}/${mongoose.connection.name}`);
}

export const dbState = () =>
  ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection.readyState] ??
  "unknown";
