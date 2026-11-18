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
    // Official registration details from FTCScout (null for teams not listed there)
    ftc: {
      type: new Schema(
        { name: String, school: String, city: String, rookieYear: Number, website: String },
        { _id: false },
      ),
      default: null,
    },
    // From FIRST's official API: latest registration details
    first: {
      type: new Schema(
        { fullName: String, robotName: String, city: String, homeRegion: String, lastSeason: Number, robotNames: { type: Map, of: String } },
        { _id: false },
      ),
      default: null,
    },
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
    createdBy: { type: new Schema({ id: String, name: String }, { _id: false }), default: null },
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
    createdBy: { type: new Schema({ id: String, name: String }, { _id: false }), default: null },
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
    season: { type: Number, default: null },
    origin: { type: String, enum: ["ftcscout", "sheet", "manual"], default: "manual" },
    finished: { type: Boolean, default: false },
    ongoing: { type: Boolean, default: false },
    hasMatches: { type: Boolean, default: false },
    createdBy: { type: new Schema({ id: String, name: String }, { _id: false }), default: null },
  },
  { timestamps: true },
);

const syncLogSchema = new Schema(
  {
    kind: { type: String, enum: ["sheet", "ftcscout", "first"], required: true },
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

// ───────── FTCScout history (read-only mirror, refreshed by the sync) ─────────

const quick = { value: Number, rank: Number };
const pts = { auto: Number, dc: Number, total: Number };

// One team × one season: FTCScout "quick stats" (OPR with world rank).
const teamSeasonSchema = new Schema(
  {
    team: { type: String, required: true },
    season: { type: Number, required: true },
    tot: quick,
    auto: quick,
    dc: quick,
    eg: quick,
    worldCount: Number, // teams ranked worldwide that season
  },
  { timestamps: true },
);
teamSeasonSchema.index({ team: 1, season: 1 }, { unique: true });
teamSeasonSchema.index({ season: 1 });

// One team at one event: final qual rank, record, OPR/averages and awards.
const participationSchema = new Schema(
  {
    team: { type: String, required: true },
    season: { type: Number, required: true },
    eventCode: { type: String, required: true },
    eventName: String,
    eventType: String,
    start: String,
    end: String,
    remote: Boolean,
    location: String,
    rank: Number,
    wins: Number,
    losses: Number,
    ties: Number,
    rp: Number,
    qualMatchesPlayed: Number,
    opr: pts,
    avg: pts,
    max: Number,
    awards: [{ _id: false, type: { type: String }, placement: Number, personName: String }],
  },
  { timestamps: true },
);
participationSchema.index({ team: 1, season: 1, eventCode: 1 }, { unique: true });
participationSchema.index({ season: 1, eventCode: 1 });

const allianceSchema = new Schema(
  {
    teams: [String],
    noShow: [String],
    score: Number, // total without penalties (FTCScout's default)
    total: Number, // including penalties
    auto: Number,
    dc: Number,
  },
  { _id: false },
);

// A match that involved at least one team from the region.
const ftcMatchSchema = new Schema(
  {
    season: { type: Number, required: true },
    eventCode: { type: String, required: true },
    eventName: String,
    matchId: { type: Number, required: true },
    label: String,
    level: String,
    series: Number,
    matchNum: Number,
    played: Boolean,
    time: Date,
    red: allianceSchema,
    blue: allianceSchema,
    teams: [String], // every team number on the field, for lookups
  },
  { timestamps: true },
);
ftcMatchSchema.index({ season: 1, eventCode: 1, matchId: 1 }, { unique: true });
ftcMatchSchema.index({ teams: 1, season: 1 });

export const TeamSeason = model("TeamSeason", teamSeasonSchema);
export const Participation = model("Participation", participationSchema);
export const FtcMatch = model("FtcMatch", ftcMatchSchema);

// ───────── FIRST FTC Events API mirror (official data FTCScout lacks) ─────────

const firstTeamRef = { _id: false, team: String, name: String };

const firstEventSchema = new Schema(
  {
    season: { type: Number, required: true },
    code: { type: String, required: true },
    name: String,
    typeName: String,
    venue: String,
    address: String,
    city: String,
    country: String,
    coordinates: [Number], // [lng, lat]
    fieldCount: Number,
    website: String,
    liveStream: String,
    volunteerUrl: String,
    timezone: String,
    start: String,
    end: String,
    // Every team registered for the event (some never play a match)
    teams: [{ _id: false, team: String, name: String, sponsors: String, city: String, country: String, robotName: String, rookieYear: Number }],
    // Official award list, in FIRST's order (includes Dean's List, judges' awards…)
    awards: [{ _id: false, awardId: Number, name: String, series: Number, team: String, person: String, school: String }],
    // Playoff alliance selection
    alliances: [
      {
        _id: false,
        number: Number,
        name: String,
        captain: firstTeamRef,
        picks: [firstTeamRef],
        backup: firstTeamRef,
      },
    ],
    // Who advanced to the next level (e.g. World Championship) and why
    advancement: {
      advancesTo: String,
      slots: Number,
      teams: [{ _id: false, team: String, slot: Number, criteria: String, declined: Boolean, status: String }],
    },
    // Official qualification ranking tiebreakers (sortOrder1..6)
    rankings: [
      { _id: false, rank: Number, team: String, wins: Number, losses: Number, ties: Number, dq: Number, played: Number, sortOrders: [Number] },
    ],
  },
  { timestamps: true },
);
firstEventSchema.index({ season: 1, code: 1 }, { unique: true });
firstEventSchema.index({ "teams.team": 1 });
firstEventSchema.index({ "awards.team": 1 });

export const FirstEvent = model("FirstEvent", firstEventSchema);

// ───────── Match video: a YouTube recording clipped into matches ─────────
// No video is stored or downloaded: a clip is just (videoId, start, end).
const recordingSchema = new Schema(
  {
    videoId: { type: String, required: true },
    title: String,
    channel: String,
    lengthSeconds: Number,
    season: { type: Number, required: true },
    eventCode: { type: String, required: true },
    // Wall-clock time of the video's first frame. From YouTube's livestream
    // start time, or derived from a match the user located by hand.
    videoStart: { type: Date, required: true },
    // Seconds added to every clip position (fine-tune). 0 = YouTube's start time as-is.
    shift: { type: Number, default: 0 },
    calibrated: { type: Boolean, default: false }, // fine-tuned against a real match
    source: { type: String, enum: ["youtube-live", "manual"], default: "youtube-live" },
    createdBy: { type: new Schema({ id: String, name: String }, { _id: false }), default: null },
  },
  { timestamps: true },
);
recordingSchema.index({ season: 1, eventCode: 1 });
recordingSchema.index({ videoId: 1, season: 1, eventCode: 1 }, { unique: true });

export const Recording = model("Recording", recordingSchema);

// ───────── Accounts: invite-only scouts and admins ─────────

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ["admin", "scout"], default: "scout" },
    // scrypt "salt:hash" (hex); empty until an invited scout sets a password
    passwordHash: { type: String, default: "" },
    active: { type: Boolean, default: true },
    // Invite link: only a hash of the token is stored
    inviteTokenHash: { type: String, default: null, index: true },
    inviteExpires: { type: Date, default: null },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    // Brute-force guard
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const sessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true },
);
// MongoDB deletes expired sessions automatically
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const User = model("User", userSchema);
export const Session = model("Session", sessionSchema);

// ───────── Email updates ─────────

// People who asked for event emails. `token` (random, in every email link)
// confirms the address and unsubscribes it; unsubscribing deletes the row.
const subscriberSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    token: { type: String, required: true, unique: true },
    confirmedAt: { type: Date, default: null },
    confirmSentAt: { type: Date, default: null },
    // Set while unconfirmed; MongoDB deletes the sign-up when it passes. Cleared on confirm.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);
subscriberSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// One row per email sent to the list, so reminders never go out twice.
const mailLogSchema = new Schema(
  {
    key: { type: String, required: true, unique: true }, // "reminder:<event>:7d" or "update:<id>"
    kind: { type: String, enum: ["reminder", "update"], required: true },
    subject: String,
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    by: { type: { id: String, name: String }, default: null, _id: false },
  },
  { timestamps: true },
);

export const Subscriber = model("Subscriber", subscriberSchema);
export const MailLog = model("MailLog", mailLogSchema);
