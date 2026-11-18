"use client";

// Match video: paste a YouTube recording of an event and get one clip per
// match. Nothing is downloaded — clips are start/end positions played in
// YouTube's embedded player, right here on the page.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import useSWR, { useSWRConfig } from "swr";
import { ApiError, del, patch, post, type Clip, type ClipEvent, type FtcEventDetail, type Recording } from "@/lib/api";
import { fmtRange, seasonLabel } from "@/lib/format";
import { Empty, ErrorNotice, Notice, PageHead, SkeletonRows, useToast } from "@/components/ui";
import { IconExternal, IconTrash } from "@/components/icons";
import { PLAYER_DEFAULTS, loadYouTube, ytError, type YTPlayer } from "@/lib/youtube";
import { useAuth } from "@/lib/auth";


/** "1:20:55" / "20:55" / "55" → seconds, or null if it isn't a time. */
const parseTime = (t: string): number | null => {
  const parts = t.trim().split(":").map((x) => x.trim());
  if (!parts.length || parts.length > 3 || parts.some((x) => !/^\d+(\.\d+)?$/.test(x))) return null;
  return parts.reduce((acc, x) => acc * 60 + Number(x), 0);
};

const hms = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};

export function ClipsView() {
  const { user } = useAuth();
  const params = useSearchParams()!;
  const router = useRouter();
  const pathname = usePathname()!;
  const recId = params.get("rec");
  const matchParam = params.get("m");
  const { data: recordings, error } = useSWR<Recording[]>("/api/clips/recordings");
  const active = recId ?? recordings?.[0]?._id ?? null;

  const select = (id: string, m?: number) => {
    const q = new URLSearchParams({ rec: id });
    if (m !== undefined) q.set("m", String(m));
    router.replace(`${pathname}?${q}`, { scroll: false });
  };

  return (
    <>
      <PageHead
        eyebrow="Match video"
        title="Video"
        sub="Paste a YouTube recording of an event. Every match in it becomes its own clip you can play right here — nothing is downloaded."
      />
      <ErrorNotice error={error} />
      {user ? (
        <AddRecording onAdded={(r) => select(r._id)} />
      ) : (
        <div className="card signin-prompt">
          <span className="muted">Scouts can add event recordings and line them up.</span>
          <Link className="btn sm" href="/login?next=/clips">
            Sign in
          </Link>
        </div>
      )}
      {recordings?.length ? (
        <div className="chips" style={{ margin: "18px 0 14px" }} role="group" aria-label="Recording">
          {recordings.map((r) => (
            <button key={r._id} type="button" className="chip" aria-pressed={active === r._id} onClick={() => select(r._id)}>
              {seasonLabel(r.season)} · {r.eventCode} · {r.clipCount} clips
            </button>
          ))}
        </div>
      ) : null}
      {active ? (
        <RecordingView key={active} id={active} initialMatch={matchParam ? Number(matchParam) : null} onPick={(m) => select(active, m)} onDeleted={() => router.replace(pathname)} />
      ) : recordings ? (
        <div className="card" style={{ marginTop: 16 }}>
          <Empty title="No recordings yet">Paste a YouTube link above to clip an event into matches.</Empty>
        </div>
      ) : (
        <SkeletonRows />
      )}
    </>
  );
}

function AddRecording({ onAdded }: { onAdded: (r: Recording) => void }) {
  const { data: events } = useSWR<ClipEvent[]>("/api/clips/events");
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // When YouTube doesn't give a start time, ask for one known match instead.
  const [needAnchor, setNeedAnchor] = useState(false);
  const [eventKey, setEventKey] = useState("");
  const [season, eventCode] = eventKey.split(":");
  const { data: eventDetail } = useSWR<FtcEventDetail>(needAnchor && eventCode ? `/api/ftc/events/${season}/${eventCode}` : null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { url: f.get("url"), season: Number(season), eventCode };
    if (needAnchor) {
      const at = parseTime(String(f.get("anchorAt") ?? ""));
      if (at === null) {
        setErr("Enter the time as h:mm:ss, e.g. 1:20:55");
        return;
      }
      body.anchorMatchId = Number(f.get("anchorMatch"));
      body.anchorAt = at;
    }
    setBusy(true);
    setErr(null);
    try {
      const rec = await post<Recording>("/api/clips/recordings", body);
      await mutate("/api/clips/recordings");
      setNeedAnchor(false);
      onAdded(rec);
    } catch (x) {
      if (x instanceof ApiError && x.code === "needs_anchor") setNeedAnchor(true);
      setErr(x instanceof Error ? x.message : "Couldn't add that video");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <div className="card-body form-grid" style={{ paddingTop: 18 }}>
        <div className="field full">
          <label htmlFor="url">YouTube link</label>
          <input id="url" name="url" className="input" required placeholder="https://www.youtube.com/watch?v=…" />
          <span className="hint">
            If YouTube shares when the stream started, matches line up automatically. Otherwise you&apos;ll pick one match and the time it starts, and we line up the rest.
          </span>
        </div>
        <div className="field">
          <label htmlFor="event">Event</label>
          <select
            id="event"
            name="event"
            className="select input"
            required
            value={eventKey}
            onChange={(e) => {
              setEventKey(e.target.value);
              setNeedAnchor(false);
              setErr(null);
            }}
          >
            <option value="" disabled>
              Choose the event…
            </option>
            {events?.map((e) => (
              <option key={`${e.season}:${e.code}`} value={`${e.season}:${e.code}`}>
                {seasonLabel(e.season)} · {e.name} ({e.matches} matches)
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ justifyContent: "flex-end" }}>
          <button className="btn primary" type="submit" disabled={busy} style={{ height: 42 }}>
            {busy ? "Clipping…" : "Clip into matches"}
          </button>
        </div>
        {needAnchor ? (
          <>
            <div className="field">
              <label htmlFor="anchorMatch">A match in this video</label>
              <select id="anchorMatch" name="anchorMatch" className="select input" required defaultValue="">
                <option value="" disabled>
                  {eventDetail ? "Choose a match…" : "Loading matches…"}
                </option>
                {eventDetail?.matches.map((m) => (
                  <option key={m.matchId} value={m.matchId}>
                    {m.label} · {m.red.teams.join("+")} vs {m.blue.teams.join("+")}
                  </option>
                ))}
              </select>
              <span className="hint">Any match you can find in the video works.</span>
            </div>
            <div className="field">
              <label htmlFor="anchorAt">It starts at (h:mm:ss in the video)</label>
              <input id="anchorAt" name="anchorAt" className="input num" required placeholder="1:20:55" inputMode="numeric" />
              <span className="hint">The moment the robots start moving.</span>
            </div>
          </>
        ) : null}
        {err ? (
          <div className="full">
            <Notice kind="error">{err}</Notice>
          </div>
        ) : null}
      </div>
    </form>
  );
}

function RecordingView({
  id,
  initialMatch,
  onPick,
  onDeleted,
}: {
  id: string;
  initialMatch: number | null;
  onPick: (matchId: number) => void;
  onDeleted: () => void;
}) {
  const { user } = useAuth();
  const key = `/api/clips/recordings/${id}`;
  const { data: rec, error, mutate } = useSWR<Recording>(key, { refreshInterval: 0 });
  const { mutate: mutateAll } = useSWRConfig();
  const [current, setCurrent] = useState<Clip | null>(null);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState("");
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const toast = useToast();

  const [playError, setPlayError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadYouTube().then((YT) => {
      if (cancelled || !holder.current || player.current) return;
      player.current = new YT.Player(holder.current, {
        ...PLAYER_DEFAULTS,
        events: { onReady: () => setReady(true), onError: (e) => setPlayError(ytError(e.data)) },
      });
    });
    return () => {
      cancelled = true;
      player.current?.destroy();
      player.current = null;
    };
  }, []);

  const play = (c: Clip, pushUrl = true) => {
    if (!rec) return;
    setCurrent(c);
    setPlayError(null);
    player.current?.loadVideoById({ videoId: rec.videoId, startSeconds: c.start, endSeconds: c.end });
    if (pushUrl) onPick(c.matchId);
    holder.current?.parentElement?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Deep link ?m=<matchId> opens that clip once the player is ready.
  useEffect(() => {
    if (!ready || !rec?.clips || current || initialMatch === null) return;
    const c = rec.clips.find((x) => x.matchId === initialMatch);
    if (c) play(c, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rec, initialMatch]);

  const startsNow = async () => {
    if (!current || !player.current) return;
    const at = Math.round(player.current.getCurrentTime());
    const updated = await patch<Recording>(key, { matchId: current.matchId, at });
    await mutate(updated, false);
    mutateAll("/api/clips/recordings");
    const fixed = updated.clips?.find((x) => x.matchId === current.matchId);
    if (fixed) setCurrent(fixed);
    toast.show(`Lined up all ${updated.clips?.length ?? 0} clips from ${current.label}`);
  };

  const remove = async () => {
    if (!confirm("Remove this recording? Clips disappear; the YouTube video is untouched.")) return;
    await del(key);
    await mutateAll("/api/clips/recordings");
    onDeleted();
  };

  const names = rec?.teamNames ?? {};
  const term = filter.trim().toLowerCase();
  const list = (rec?.clips ?? []).filter(
    (c) =>
      !term ||
      c.label.toLowerCase().includes(term) ||
      [...c.red.teams, ...c.blue.teams].some((t) => t.includes(term) || names[t]?.toLowerCase().includes(term)),
  );

  return (
    <>
      <ErrorNotice error={error} />
      <section className="card" style={{ overflow: "hidden" }}>
        <div style={{ position: "relative", aspectRatio: "16 / 9", background: "#000" }}>
          <div ref={holder} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
          {!current || playError ? (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", pointerEvents: "none", textAlign: "center", padding: 16, background: playError ? "#000" : undefined }}>
              {playError ?? (ready ? "Pick a match below to play its clip" : "Loading player…")}
            </div>
          ) : null}
        </div>
        <div className="card-body" style={{ paddingTop: 14 }}>
          {current ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <strong className="display" style={{ fontSize: 26 }}>
                {current.label}
              </strong>
              <Alliance side="red" a={current.red} names={names} />
              <span className="muted">vs</span>
              <Alliance side="blue" a={current.blue} names={names} />
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {user ? (
                  <button type="button" className="btn sm" onClick={startsNow} title="Pause where the match starts, then click to line up every clip">
                    Match starts here
                  </button>
                ) : null}
                <a className="btn sm ghost" href={current.url} target="_blank" rel="noreferrer">
                  YouTube <IconExternal />
                </a>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13.5 }}>
              {rec ? (
                <>
                  <strong style={{ color: "var(--ink)" }}>{rec.title}</strong>
                  {rec.channel ? ` · ${rec.channel}` : ""} · {rec.clips?.length ?? 0} matches ·{" "}
                  {rec.calibrated ? "lined up" : "auto-aligned from YouTube's stream start — clips may start a little early"}
                </>
              ) : (
                "Loading…"
              )}
            </div>
          )}
        </div>
      </section>

      {rec && !rec.calibrated && user ? (
        <div style={{ marginTop: 12 }}>
          <Notice>
            <span>
            Clips are lined up from when YouTube says the stream started, which is usually a few seconds to a minute late — so clips may begin early. To make them exact: play any clip, pause the moment the match starts, and press <strong>Match starts here</strong>. Every clip shifts to match.
            </span>
          </Notice>
        </div>
      ) : null}

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head" style={{ flexWrap: "wrap" }}>
          <div>
            <h2 className="display">Match clips</h2>
            {rec ? (
              <div className="muted" style={{ fontSize: 13 }}>
                {seasonLabel(rec.season)} · {rec.eventCode} · {fmtRange(rec.videoStart.slice(0, 10), null)}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input className="input" style={{ height: 34, width: 200 }} placeholder="Team or match…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <Link className="btn sm ghost" href={rec ? `/events/${rec.season}/${rec.eventCode}` : "#"}>
              Event
            </Link>
            {user ? (
            <button type="button" className="btn sm ghost" onClick={remove} aria-label="Remove recording">
              <IconTrash />
            </button>
            ) : null}
          </div>
        </div>
        {!rec ? (
          <SkeletonRows />
        ) : list.length ? (
          <div className="clips">
            {list.map((c) => (
              <button key={c.matchId} type="button" className={`clip${current?.matchId === c.matchId ? " on" : ""}`} onClick={() => play(c)}>
                <span className="clip-head">
                  <span className="clip-label">{c.label}</span>
                  <span className="clip-time num">▶ {hms(c.start)}</span>
                </span>
                <span className="clip-row red">
                  <span className="t">{c.red.teams.join(" · ")}</span>
                  <span className="s">{c.red.score ?? "–"}</span>
                </span>
                <span className="clip-row blue">
                  <span className="t">{c.blue.teams.join(" · ")}</span>
                  <span className="s">{c.blue.score ?? "–"}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Empty title="No clips match that filter" />
        )}
      </section>
      {toast.node}
    </>
  );
}

function Alliance({ side, a, names }: { side: "red" | "blue"; a: Clip["red"]; names: Record<string, string> }) {
  return (
    <span className={`badge ${side}`} style={{ height: "auto", padding: "4px 8px", textTransform: "none", letterSpacing: 0 }}>
      {a.teams.map((t) => (
        <Link key={t} href={`/team/${t}`} title={names[t]} style={{ marginRight: 6 }}>
          {t}
          {names[t] ? <span style={{ fontWeight: 400 }}> {names[t]}</span> : null}
        </Link>
      ))}
      <strong style={{ fontSize: 13 }}>{a.score ?? "–"}</strong>
    </span>
  );
}
