import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";

export const metadata: Metadata = {
  title: "About",
  description: "What FTC Scout Jamaica is, where its data comes from and who can edit it.",
};

export default function AboutPage() {
  return (
    <>
      <PageHead eyebrow="About" title="About FTC Scout" />
      <div className="prose">
        <p>
          FTC Scout Jamaica is a scouting site for <em>FIRST</em> Tech Challenge teams in Jamaica. It puts official
          results, our own scouting notes, match video and the event calendar in one place, so teams can prepare for
          scrimmages and the national championship and see how everyone is doing.
        </p>
        <p>Anyone can browse it. You don&apos;t need an account to look at rankings, teams, events or video.</p>

        <h2>What&apos;s on the site</h2>
        <ul>
          <li>
            <Link href="/rankings">Rankings</Link> for each season, based on official results.
          </li>
          <li>
            <Link href="/scrimmages">Scrimmages</Link>: who went, the matches played and what scouts noticed about each
            robot.
          </li>
          <li>
            <Link href="/events">Events</Link>, with results, alliances and awards for past events and a calendar you can
            add to your phone.
          </li>
          <li>
            <Link href="/clips">Video</Link>: recordings of FTC Jamaica events and the World Championship, split into
            one clip per match.
          </li>
          <li>A page for every Jamaican team with its full competition history.</li>
        </ul>

        <h2>Where the data comes from</h2>
        <p>
          Official match results, rankings, OPR and awards come from{" "}
          <a href="https://ftcscout.org" target="_blank" rel="noreferrer">
            FTCScout
          </a>{" "}
          and the{" "}
          <a href="https://ftc-events.firstinspires.org/services/API" target="_blank" rel="noreferrer">
            FIRST Tech Challenge Events API
          </a>
          . The site checks them for new results regularly.
        </p>
        <p>
          Scouting notes, scrimmage reports and robot details are added by our scouts. Match video comes from the FTC
          Jamaica YouTube channel and other public recordings, and plays from YouTube.
        </p>

        <h2>Who can edit it</h2>
        <p>
          Only invited scouts can add or change scouting data, events and video. Every entry shows the name of the
          scout who added it. If you&apos;d like to help scout, ask a site admin for an invite.
        </p>

        <h2>Not an official site</h2>
        <p>
          This site is run by volunteers. It isn&apos;t made or endorsed by <em>FIRST</em>, FTCScout or FTC Jamaica.
          For official announcements, check with FTC Jamaica directly. See the <Link href="/privacy">privacy page</Link>{" "}
          for what we store and why.
        </p>
      </div>
    </>
  );
}
