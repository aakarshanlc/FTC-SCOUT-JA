// Match video: paste a YouTube link, get one clip per match. Nothing is
// downloaded — each clip is a start/end position inside the original video,
// played with YouTube's embedded player.

import { Router } from "express";
import mongoose from "mongoose";
import { FtcMatch, Recording, Team } from "../models/index.js";
import { HttpError, ah } from "../lib/util.js";
import { videoInfo, youtubeId } from "../services/youtube.js";
import { requireUser, stamp } from "../services/auth.js";

export const clips = Router();

const MATCH_SECONDS = 158; // 0:30 auto + 0:08 transition + 2:00 teleop
const LEAD = 10; // show the countdown

/** Clips for every match of the recording's event that falls inside the video. */
export async function clipsFor(rec) {
  const start = rec.videoStart.getTime();
  // Unknown length (oEmbed doesn't say): assume one competition day, so a
  // day-1 stream doesn't pick up the next morning's matches.
  const end = start + (rec.lengthSeconds ?? 14 * 3600) * 1000;
  const matches = await FtcMatch.find({
    season: rec.season,
    eventCode: rec.eventCode,
    time: { $gte: new Date(start - 60_000), $lte: new Date(end) },
  })
    .sort({ time: 1, matchId: 1 })
    .lean();
  // YouTube's livestream start is usually a little late, which lands clips a
  // little early. Until a recording is fine-tuned, give clips extra tail so
  // the end of the match is never cut off.
  const tail = rec.calibrated ? 20 : 60;
  return matches.map((m) => {
    const at = (m.time.getTime() - start) / 1000 + (rec.shift ?? 0);
    const clipStart = Math.max(0, Math.round(at - LEAD));
    const clipEnd = Math.round(Math.min(rec.lengthSeconds ?? Infinity, at + MATCH_SECONDS + tail));
    return {
      matchId: m.matchId,
      label: m.label,
      level: m.level,
      red: m.red,
      blue: m.blue,
      matchStart: Math.round(at),
      start: clipStart,
      end: clipEnd,
      url: `https://youtu.be/${rec.videoId}?t=${clipStart}`,
    };
  });
}

/**
 * Clip lookup for match lists elsewhere on the site: for the given
 * (season, eventCode) pairs, returns Map "season:code:matchId" → clip info.
 */
export async function clipIndex(pairs) {
  const uniq = [...new Map(pairs.map((p) => [`${p.season}:${p.eventCode}`, p])).values()];
  if (!uniq.length) return new Map();
  const recs = await Recording.find({ $or: uniq.map(({ season, eventCode }) => ({ season, eventCode })) }).lean();
  const out = new Map();
  for (const rec of recs) {
    for (const c of await clipsFor(rec)) {
      const key = `${rec.season}:${rec.eventCode}:${c.matchId}`;
      // If two recordings cover a match, keep the fine-tuned one.
      if (out.has(key) && !rec.calibrated) continue;
      out.set(key, { recording: String(rec._id), videoId: rec.videoId, start: c.start, end: c.end, url: c.url, calibrated: rec.calibrated });
    }
  }
  return out;
}

/** Attach `clip` to FTCScout match documents that have one. */
export async function withClips(matches) {
  const index = await clipIndex(matches.map((m) => ({ season: m.season, eventCode: m.eventCode })));
  return matches.map((m) => ({ ...m, clip: index.get(`${m.season}:${m.eventCode}:${m.matchId}`) ?? null }));
}

const view = async (rec) => {
  const list = await clipsFor(rec);
  const numbers = [...new Set(list.flatMap((c) => [...c.red.teams, ...c.blue.teams]))];
  const teams = await Team.find({ number: { $in: numbers } }, { number: 1, name: 1 }).lean();
  return { ...rec, clips: list, teamNames: Object.fromEntries(teams.map((t) => [t.number, t.name])) };
};

const recId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid recording id");
  return id;
};

// Events that have match times (Jamaica and anywhere Jamaican teams played)
clips.get(
  "/events",
  ah(async (_req, res) => {
    const rows = await FtcMatch.aggregate([
      { $match: { time: { $ne: null } } },
      { $group: { _id: { season: "$season", code: "$eventCode" }, name: { $first: "$eventName" }, first: { $min: "$time" }, last: { $max: "$time" }, matches: { $sum: 1 } } },
      { $sort: { first: -1 } },
    ]);
    res.json(rows.map((r) => ({ season: r._id.season, code: r._id.code, name: r.name, first: r.first, last: r.last, matches: r.matches })));
  }),
);

clips.get(
  "/recordings",
  ah(async (req, res) => {
    const q = {};
    if (req.query.season) q.season = Number(req.query.season);
    if (req.query.event) q.eventCode = String(req.query.event);
    const recs = await Recording.find(q).sort({ videoStart: -1 }).lean();
    res.json(await Promise.all(recs.map(async (r) => ({ ...r, clipCount: (await clipsFor(r)).length }))));
  }),
);

clips.get(
  "/recordings/:id",
  ah(async (req, res) => {
    const rec = await Recording.findById(recId(req.params.id)).lean();
    if (!rec) throw new HttpError(404, "Recording not found");
    res.json(await view(rec));
  }),
);

/**
 * Add a recording: { url, season, eventCode }.
 * Livestream recordings line up automatically from YouTube's start time.
 * Regular uploads need one landmark: { anchorMatchId, anchorAt } = "this match
 * starts at anchorAt seconds into the video".
 */
clips.post(
  "/recordings",
  requireUser,
  ah(async (req, res) => {
    const videoId = youtubeId(req.body.url);
    if (!videoId) throw new HttpError(400, "That doesn't look like a YouTube link");
    const season = Number(req.body.season);
    const eventCode = String(req.body.eventCode ?? "").trim();
    if (!season || !eventCode) throw new HttpError(400, "Pick the event this recording is from");

    let info;
    try {
      info = await videoInfo(videoId);
    } catch (err) {
      throw new HttpError(502, err.message);
    }

    if (!info.playable) {
      throw new HttpError(422, `YouTube won't play this video (${info.unplayableReason}). It may have been removed or blocked by a copyright claim.`);
    }

    let videoStart = info.streamStart ? new Date(info.streamStart) : null;
    let source = "youtube-live";
    if (req.body.anchorMatchId !== undefined && req.body.anchorAt !== undefined) {
      const m = await FtcMatch.findOne({ season, eventCode, matchId: Number(req.body.anchorMatchId) }).lean();
      if (!m?.time) throw new HttpError(400, "That match has no recorded start time");
      videoStart = new Date(m.time.getTime() - Number(req.body.anchorAt) * 1000);
      source = "manual";
    }
    if (!videoStart) {
      throw new HttpError(
        422,
        "YouTube didn't tell us when this recording started. Pick one match and the time it starts in the video, and we'll line up the rest.",
        "needs_anchor",
      );
    }

    const doc = await Recording.findOneAndUpdate(
      { videoId, season, eventCode },
      {
        $set: { title: info.title, channel: info.channel, lengthSeconds: info.lengthSeconds, videoStart, source, shift: 0, calibrated: source === "manual", createdBy: stamp(req.user) },
      },
      { upsert: true, new: true },
    ).lean();
    const out = await view(doc);
    if (!out.clips.length) {
      await Recording.deleteOne({ _id: doc._id });
      throw new HttpError(422, `No ${eventCode} matches happened during this video (it covers ${doc.videoStart.toISOString()} for ${Math.round((doc.lengthSeconds ?? 0) / 60)} min). Is it the right event?`);
    }
    res.status(201).json(out);
  }),
);

/** Fine-tune: { shift } seconds, or { matchId, at } = "this match really starts at `at`". */
clips.patch(
  "/recordings/:id",
  requireUser,
  ah(async (req, res) => {
    const rec = await Recording.findById(recId(req.params.id));
    if (!rec) throw new HttpError(404, "Recording not found");
    if (req.body.matchId !== undefined && req.body.at !== undefined) {
      const m = await FtcMatch.findOne({ season: rec.season, eventCode: rec.eventCode, matchId: Number(req.body.matchId) }).lean();
      if (!m?.time) throw new HttpError(400, "Unknown match");
      rec.shift = Math.round((Number(req.body.at) - (m.time.getTime() - rec.videoStart.getTime()) / 1000) * 10) / 10;
      rec.calibrated = true;
    } else if (req.body.shift !== undefined) {
      rec.shift = Math.max(-3600, Math.min(3600, Number(req.body.shift) || 0));
      rec.calibrated = true;
    }
    await rec.save();
    res.json(await view(rec.toObject()));
  }),
);

clips.delete(
  "/recordings/:id",
  requireUser,
  ah(async (req, res) => {
    await Recording.deleteOne({ _id: recId(req.params.id) });
    res.status(204).end();
  }),
);
