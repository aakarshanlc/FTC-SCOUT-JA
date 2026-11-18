"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { fetcher, type SearchHit } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  IconCalendar,
  IconHome,
  IconMoon,
  IconPlay,
  IconPlus,
  IconSearch,
  IconSun,
  IconSwords,
  IconTrophy,
} from "./icons";

const NAV = [
  { href: "/", label: "Overview", Icon: IconHome },
  { href: "/rankings", label: "Rankings", Icon: IconTrophy },
  { href: "/scrimmages", label: "Scrimmages", Icon: IconSwords },
  { href: "/events", label: "Events", Icon: IconCalendar },
  { href: "/clips", label: "Video", Icon: IconPlay },
  { href: "/scout", label: "Scout", Icon: IconPlus },
];

const isActive = (path: string, href: string) =>
  href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);

export function Header() {
  return <HeaderShell path={usePathname() ?? ""} />;
}

/** Rendered as-is (no active tab) while the pathname is resolving. */
export function HeaderShell({ path }: { path: string }) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="FTC Scout home">
            <span className="brand-mark">FS</span>
            <span className="brand-name">
              FTC Scout
              <small>JAMAICA · 2026–27</small>
            </span>
          </Link>
          <nav className="nav" aria-label="Main">
            {NAV.map(({ href, label }) => (
              <Link key={href} href={href} aria-current={isActive(path, href) ? "page" : undefined}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="topbar-right">
            <Search />
            <ThemeToggle />
            <Account />
          </div>
        </div>
      </header>
      <nav className="tabbar" aria-label="Main">
        {NAV.map(({ href, label, Icon }) => (
          <Link key={href} href={href} aria-current={isActive(path, href) ? "page" : undefined}>
            <Icon />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  const toggle = () => {
    const next = !(document.documentElement.dataset.theme === "dark");
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  };
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <IconSun /> : <IconMoon />}
    </button>
  );
}

function Search() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const term = q.trim();
  const { data: hits = [] } = useSWR<SearchHit[]>(
    term ? `/api/search?q=${encodeURIComponent(term)}` : null,
    fetcher,
    { keepPreviousData: true, refreshInterval: 0 },
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !isTyping(e))) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  const go = (n: string) => {
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
    router.push(`/team/${encodeURIComponent(n)}`);
  };

  return (
    <div className={`search${open ? " open" : ""}`} ref={boxRef}>
      <label className="search-field" onClick={() => inputRef.current?.focus()}>
        <IconSearch />
        <input
          ref={inputRef}
          value={q}
          placeholder="Search teams"
          aria-label="Search teams by number or name"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              const hit = hits[active] ?? hits[0];
              if (hit) go(hit.number);
              else if (/^\d+$/.test(term)) go(term);
            } else if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
        />
        <kbd>/</kbd>
      </label>
      {open && term ? (
        <div className="search-pop" role="listbox">
          {hits.length ? (
            hits.map((h, i) => (
              <Link
                key={h.number}
                href={`/team/${h.number}`}
                data-active={i === active}
                onClick={() => {
                  setQ("");
                  setOpen(false);
                }}
              >
                <span className="tn">{h.number}</span>
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{h.name || "Unnamed team"}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {h.org || "—"}
                  </div>
                </span>
                {h.rank ? (
                  <span className="badge signal" style={{ marginLeft: "auto" }}>
                    #{h.rank}
                  </span>
                ) : null}
              </Link>
            ))
          ) : (
            <p className="muted">No teams match “{term}”.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
};

/** "Sign in" when signed out; initials + menu when signed in. */
function Account() {
  const { user, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  if (!user) {
    return (
      <Link href="/login" className="btn sm" style={{ height: 38 }}>
        Sign in
      </Link>
    );
  }
  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="acct" ref={box}>
      <button type="button" className="acct-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label={`Account: ${user.name}`}>
        <span className="acct-av">{initials}</span>
        <span className="acct-name">{user.name.split(" ")[0]}</span>
      </button>
      {open ? (
        <div className="acct-menu" role="menu">
          <div className="who">
            <div style={{ fontWeight: 700 }}>{user.name}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {user.email} · {isAdmin ? "Admin" : "Scout"}
            </div>
          </div>
          <Link href="/scout" role="menuitem" onClick={() => setOpen(false)}>
            Log a match
          </Link>
          <Link href="/admin" role="menuitem" onClick={() => setOpen(false)}>
            {isAdmin ? "Team & invites" : "Account"}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              router.refresh();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
