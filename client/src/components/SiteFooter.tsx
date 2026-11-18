import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="shell site-foot">
      <div className="site-foot-row">
        <div>
          <strong className="site-foot-name">FTC Scout Jamaica</strong>
          <span className="muted"> · Scouting for FTC teams in Jamaica</span>
        </div>
        <nav className="site-foot-links" aria-label="Site">
          <Link href="/about">About</Link>
          <Link href="/events">Calendar</Link>
          <Link href="/updates">Email updates</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </div>
      <p className="site-foot-credit">
        Official results come from{" "}
        <a href="https://ftcscout.org" target="_blank" rel="noreferrer">
          FTCScout
        </a>{" "}
        and the{" "}
        <a href="https://ftc-events.firstinspires.org/services/API" target="_blank" rel="noreferrer">
          FIRST Tech Challenge Events API
        </a>
        . Not an official FIRST site.
      </p>
    </footer>
  );
}
