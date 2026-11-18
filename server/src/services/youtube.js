// A YouTube video's public details — no download. Three sources, best first:
//   1. YouTube Data API (if YOUTUBE_API_KEY is set): official, works from any
//      server, and gives a recorded livestream's real start time.
//   2. The public watch page: works from home connections, but YouTube blocks
//      it from data-centre IPs (e.g. Vercel) with a bot check — we don't try
//      to get around that, we just fall through.
//   3. oEmbed: official and always allowed, but only title/channel — no start
//      time, so the recording must be lined up from one known match.

/** Video ID from any YouTube URL form (watch?v=, youtu.be/, /live/, /embed/, /shorts/) or a bare ID. */
export function youtubeId(input) {
  const s = String(input ?? "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.endsWith("youtu.be")) return u.pathname.slice(1, 12) || null;
    if (u.searchParams.get("v")) return u.searchParams.get("v").slice(0, 11);
    const m = u.pathname.match(/\/(?:live|embed|shorts|v)\/([\w-]{11})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const pick = (html, re) => html.match(re)?.[1] ?? null;
const unescape = (s) =>
  s
    ?.replace(/\\u0026/g, "&")
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');

/** ISO-8601 duration (PT8H42M24S) → seconds. */
const isoSeconds = (d) => {
  const m = String(d ?? "").match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const [, D = 0, H = 0, M = 0, S = 0] = m.map((x) => Number(x ?? 0));
  return D * 86400 + H * 3600 + M * 60 + S || null;
};

async function fromDataApi(videoId, key) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,liveStreamingDetails,status&id=${videoId}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`YouTube Data API responded HTTP ${res.status}`);
  const item = (await res.json()).items?.[0];
  if (!item) return { videoId, playable: false, unplayableReason: "Video not found or private" };
  const blocked = item.status?.privacyStatus === "private" || item.status?.uploadStatus === "rejected";
  return {
    videoId,
    playable: !blocked && item.status?.embeddable !== false,
    unplayableReason: blocked ? item.status?.rejectionReason || "Video unavailable" : item.status?.embeddable === false ? "Embedding disabled by the owner" : null,
    title: item.snippet?.title ?? videoId,
    channel: item.snippet?.channelTitle ?? null,
    lengthSeconds: isoSeconds(item.contentDetails?.duration),
    streamStart: item.liveStreamingDetails?.actualStartTime ?? null,
    streamEnd: item.liveStreamingDetails?.actualEndTime ?? null,
    via: "data-api",
  };
}

async function fromWatchPage(videoId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FTC-Scout)", "Accept-Language": "en-US" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const title = unescape(pick(html, /<meta name="title" content="([^"]*)"/) ?? pick(html, /"title":"((?:[^"\\]|\\.)*)","lengthSeconds"/));
  const length = Number(pick(html, /"lengthSeconds":"(\d+)"/)) || null;
  if (!title && !length) return null; // bot check or consent page — fall through
  const status = pick(html, /"playabilityStatus":\{"status":"([A-Z_]+)"/);
  const reason = unescape(pick(html, /"playabilityStatus":\{[^}]{0,400}?"reason":"((?:[^"\\]|\\.)*)"/));
  // LOGIN_REQUIRED is usually YouTube's bot check, not a real block.
  const unplayable = status === "ERROR" || status === "UNPLAYABLE";
  return {
    videoId,
    playable: !unplayable,
    unplayableReason: unplayable ? reason || status : null,
    title: title ?? videoId,
    channel: unescape(pick(html, /"ownerChannelName":"((?:[^"\\]|\\.)*)"/)),
    lengthSeconds: length,
    streamStart: pick(html, /"startTimestamp":"([^"]+)"/), // only for recorded livestreams
    streamEnd: pick(html, /"endTimestamp":"([^"]+)"/),
    via: "watch-page",
  };
}

async function fromOEmbed(videoId) {
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403) return { videoId, playable: false, unplayableReason: "Embedding disabled or video private" };
  if (!res.ok) return { videoId, playable: false, unplayableReason: "Video not found" };
  const d = await res.json();
  return { videoId, playable: true, unplayableReason: null, title: d.title ?? videoId, channel: d.author_name ?? null, lengthSeconds: null, streamStart: null, streamEnd: null, via: "oembed" };
}

export async function videoInfo(videoId) {
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    try {
      return await fromDataApi(videoId, key);
    } catch (err) {
      console.warn(`[youtube] Data API failed (${err.message}); trying other sources`);
    }
  }
  const page = await fromWatchPage(videoId).catch(() => null);
  if (page) return page;
  return fromOEmbed(videoId);
}
