// One-off sync: `npm run sync`
import mongoose from "mongoose";
import { connectDb } from "../db.js";
import { syncAll } from "../services/sync.js";

await connectDb();
const { sheet, ftc } = await syncAll();
console.log("sheet:", sheet.ok ? Object.fromEntries(sheet.counts) : sheet.message);
console.log("ftcscout:", ftc.ok ? ftc.message : ftc.message);
await mongoose.disconnect();
