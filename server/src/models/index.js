import mongoose from "mongoose";

const { Schema, model } = mongoose;

// "sheet" rows are owned by the Google Sheet sync and replaced on every pull.
// "manual" rows are entered in the app and never touched by the sync.
const source = { type: String, enum: ["sheet", "manual"], default: "manual", index: true };

const teamSchema = new Schema(
  {
    number: { type: String, required: true, unique: true, trim: true },
    name: { type: String, default: "", trim: true },
    org: { type: String, default: "", trim: true },
    // Free-form robot details keyed by the sheet's column header (Drivetrain, Notes, …)
    robot: { type: Map, of: String, default: {} },
  },
  { timestamps: true },
);
teamSchema.index({ name: "text", org: "text" });

const matchSchema = new Schema(
  {
    team: { type: String, required: true, index: true, trim: true },
    label: { type: String, default: "", trim: true },
    auto: { type: Number, default: null },
    teleop: { type: Number, default: null },
    total: { type: Number, default: null },
    notes: { type: String, default: "" },
    source,
  },
  { timestamps: true },
);

const scrimmageSchema = new Schema(
  {
    event: { type: String, required: true, index: true, trim: true },
    team: { type: String, required: true, index: true, trim: true },
    name: { type: String, default: "" },
    org: { type: String, default: "" },
    auto: { type: Number, default: null },
    teleop: { type: Number, default: null },
    total: { type: Number, default: null },
    // Text observations from scouts ("Intake & Shooter", "N/A", …) keyed by column
    observations: { type: Map, of: String, default: {} },
    source,
  },
  { timestamps: true },
);

const eventSchema = new Schema(
  {
    key: { type: String, required: true, unique: true }, // ftc-2026-JMCMP, sheet-…
    name: { type: String, required: true },
    kind: { type: String, default: "Event" },
    start: { type: String, default: null }, // YYYY-MM-DD
    end: { type: String, default: null },
    location: { type: String, default: "" },
    website: { type: String, default: null },
    liveStream: { type: String, default: null },
    url: { type: String, default: null },
    code: { type: String, default: null },
    origin: { type: String, enum: ["ftcscout", "sheet", "manual"], default: "manual" },
    finished: { type: Boolean, default: false },
    ongoing: { type: Boolean, default: false },
    hasMatches: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const syncLogSchema = new Schema(
  {
    kind: { type: String, enum: ["sheet", "ftcscout"], required: true },
    ok: { type: Boolean, required: true },
    message: { type: String, default: "" },
    counts: { type: Map, of: Number, default: {} },
    durationMs: Number,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
syncLogSchema.index({ createdAt: -1 });

export const Team = model("Team", teamSchema);
export const Match = model("Match", matchSchema);
export const Scrimmage = model("Scrimmage", scrimmageSchema);
export const Event = model("Event", eventSchema);
export const SyncLog = model("SyncLog", syncLogSchema);
