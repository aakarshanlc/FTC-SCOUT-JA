// Read a YouTube video's public details from its watch page — no download.
// For recorded livestreams YouTube publishes when the stream started
// (liveBroadcastDetails.startTimestamp); that's what lets us map wall-clock
// match times onto positions in the video.

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

export async function videoInfo(videoId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FTC-Scout)", "Accept-Language": "en-US" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`YouTube responded HTTP ${res.status}`);
  const html = await res.text();
  const title = unescape(pick(html, /<meta name="title" content="([^"]*)"/) ?? pick(html, /"title":"((?:[^"\\]|\\.)*)","lengthSeconds"/));
  const length = Number(pick(html, /"lengthSeconds":"(\d+)"/)) || null;
  if (!title && !length) throw new Error("Couldn't read that video — is it public?");
  // Copyright claims and removals make a video unplayable everywhere.
  const status = pick(html, /"playabilityStatus":\{"status":"([A-Z_]+)"/);
  const reason = unescape(pick(html, /"playabilityStatus":\{[^}]{0,400}?"reason":"((?:[^"\\]|\\.)*)"/));
  return {
    videoId,
    playable: !status || status === "OK",
    unplayableReason: status && status !== "OK" ? reason || status : null,
    title: title ?? videoId,
    channel: unescape(pick(html, /"ownerChannelName":"((?:[^"\\]|\\.)*)"/)),
    lengthSeconds: length,
    streamStart: pick(html, /"startTimestamp":"([^"]+)"/), // only for recorded livestreams
    streamEnd: pick(html, /"endTimestamp":"([^"]+)"/),
  };
}
