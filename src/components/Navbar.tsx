"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useScout } from "./ScoutProvider";

const LINKS = [
  { href: "/", page: "teams", label: "Championship" },
  { href: "/events", page: "events", label: "Events" },
  { href: "/scrimmages", page: "scrimmages", label: "Scrimmages" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { infos } = useScout();

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  const active = pathname.startsWith("/events")
    ? "events"
    : pathname.startsWith("/scrimmages")
      ? "scrimmages"
      : "teams";

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return infos
      .filter((t) => t.number.includes(s) || t.name.toLowerCase().includes(s))
      .sort(
        (a, b) =>
          (b.number === s ? 1 : 0) - (a.number === s ? 1 : 0) ||
          (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0),
      )
      .slice(0, 8);
  }, [q, infos]);

  const openTeam = (n: string) => {
    setQ("");
    setOpen(false);
    router.push(`/team/${encodeURIComponent(n)}`);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setQ("");
      setOpen(false);
      return;
    }
    if (e.key !== "Enter") return;
    const typed = q.trim();
    if (hits[0]) openTeam(hits[0].number);
    else if (/^\d+$/.test(typed)) openTeam(typed);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("ftcTheme", next);
    } catch {
      /* storage unavailable — theme just won't persist */
    }
  };

  return (
    <nav>
      <div className="nav-in">
        <Link className="brand" href="/">
          FTC Scouting
        </Link>
        <div className="links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={active === l.page ? "active" : ""}>
              {l.label}
            </Link>
          ))}
        </div>
        <div className="spacer" />
        <div className="search">
          <input
            id="gsearch"
            type="search"
            placeholder="Search team # or name…"
            autoComplete="off"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 150);
            }}
          />
          {open && q.trim() && (
            <div id="gresults">
              {hits.length ? (
                hits.map((t) => (
                  <div
                    key={t.number}
                    className="hit"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (blurTimer.current) clearTimeout(blurTimer.current);
                      openTeam(t.number);
                    }}
                  >
                    <strong className="tnum">{t.number}</strong> {t.name}
                  </div>
                ))
              ) : (
                <div className="hit muted">No matches</div>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          className="theme-btn"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-pressed={theme === "dark"}
        >
          <svg
            className="ico-sun"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </svg>
          <svg
            className="ico-moon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
