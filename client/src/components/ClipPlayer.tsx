"use client";

// Pop-up player for one match clip: plays only that section of the event
// recording, on top of whatever page you're on.

import Link from "next/link";
import { eventTitle } from "@/lib/format";
import { useEffect, useRef, useState } from "react";
import type { FtcMatch, MatchClip } from "@/lib/api";
import { PLAYER_DEFAULTS, loadYouTube, ytError, type YTPlayer } from "@/lib/youtube";
import { IconExternal } from "./icons";

export function ClipPlayer({
  match,
  clip,
  names = {},
  onClose,
}: {
  match: FtcMatch;
  clip: MatchClip;
  names?: Record<string, string>;
  onClose: () => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let player: YTPlayer | null = null;
    let cancelled = false;
    loadYouTube().then((YT) => {
      if (cancelled || !holder.current) return;
      player = new YT.Player(holder.current, {
        ...PLAYER_DEFAULTS,
        videoId: clip.videoId,
        playerVars: { ...PLAYER_DEFAULTS.playerVars, start: clip.start, end: clip.end, autoplay: 1 },
        events: { onError: (e) => setError(ytError(e.data)) },
      });
    });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelled = true;
      player?.destroy();
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [clip, onClose]);

  const side = (color: "red" | "blue") => {
    const a = match[color];
    return (
      <span className={`badge ${color}`} style={{ height: "auto", padding: "4px 8px", textTransform: "none", letterSpacing: 0 }}>
        {a.teams.map((t) => (
          <span key={t} style={{ marginRight: 6 }}>
            {t}
            {names[t] ? <span style={{ fontWeight: 400 }}> {names[t]}</span> : null}
          </span>
        ))}
        <strong style={{ fontSize: 13 }}>{a.score ?? "–"}</strong>
      </span>
    );
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={`${match.label} video`} onClick={onClose}>
      <div className="modal-card card" onClick={(e) => e.stopPropagation()}>
        <div style={{ position: "relative", aspectRatio: "16 / 9", background: "#000" }}>
          <div ref={holder} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
          {error ? (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", padding: 20, textAlign: "center" }}>{error}</div>
          ) : null}
        </div>
        <div className="card-body" style={{ paddingTop: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <strong className="display" style={{ fontSize: 26 }}>
            {match.label}
          </strong>
          <span className="muted" style={{ fontSize: 13 }}>
            {eventTitle(match.eventName)}
          </span>
          {side("red")}
          {side("blue")}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <Link className="btn sm ghost" href={`/clips?rec=${clip.recording}&m=${match.matchId}`}>
              All clips
            </Link>
            <a className="btn sm ghost" href={clip.url} target="_blank" rel="noreferrer">
              YouTube <IconExternal />
            </a>
            <button type="button" className="btn sm dark" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
