import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What FTC Scout Jamaica stores, where its data comes from and how to get something removed.",
};

const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function PrivacyPage() {
  return (
    <>
      <PageHead eyebrow="Privacy" title="Privacy" sub="Last updated November 18, 2026" />
      <div className="prose">
        <p>
          We keep this short. The site exists to share FTC results and scouting with the Jamaican robotics community. We
          don&apos;t run ads, we don&apos;t sell data, and we don&apos;t use tracking or analytics cookies.
        </p>

        <h2>If you&apos;re just browsing</h2>
        <p>
          You don&apos;t need an account and we don&apos;t ask who you are. Your browser remembers whether you picked the
          light or dark theme. That setting never leaves your device. Our host keeps standard server logs (IP address,
          pages requested) for a short time to keep the site running.
        </p>

        <h2>Data we show about teams</h2>
        <p>This site is about teams and robots, not individual students. It shows:</p>
        <ul>
          <li>
            <strong>Official results</strong> from{" "}
            <a href="https://ftcscout.org" target="_blank" rel="noreferrer">
              FTCScout
            </a>{" "}
            and the{" "}
            <a href="https://ftc-events.firstinspires.org/services/API" target="_blank" rel="noreferrer">
              FIRST Tech Challenge Events API
            </a>
            : team names and numbers, schools, cities, sponsors, rankings, match scores and awards. This is already
            public on those sites.
          </li>
          <li>
            <strong>Scouting notes</strong> that our scouts write about robots and matches, kept in our own scouting sheet
            and database.
          </li>
          <li>
            <strong>Match video</strong> embedded from YouTube. We store only the link and the times each match starts.
            Videos are played through YouTube&apos;s privacy-enhanced player, and YouTube may set its own cookies once you
            press play.
          </li>
        </ul>

        <h2>Scout accounts</h2>
        <p>
          Scouts are invited by an admin. For each account we store a name, email address, a scrambled (hashed) version
          of the password, the role and when the scout last signed in. Signing in sets one cookie that keeps you signed
          in for up to 30 days. The scout&apos;s name is shown next to anything they add.
        </p>

        <h2>Email updates</h2>
        <p>
          If you sign up for <Link href="/updates">email updates</Link>, we store your email address and when you
          confirmed it. We only email you after you click the confirmation link, and only about FTC events and the
          calendar. Every email has a link to unsubscribe, and unsubscribing deletes your address.
        </p>

        <h2>Where it&apos;s stored</h2>
        <p>
          The site runs on Vercel and the database is on MongoDB Atlas. Emails are sent through our email provider. None of
          these services get to use the data for anything else.
        </p>

        <h2>Getting something changed or removed</h2>
        <p>
          If something about your team is wrong, or you want your account, email address or a scouting note removed,{" "}
          {contact ? (
            <>
              email <a href={`mailto:${contact}`}>{contact}</a>
            </>
          ) : (
            "contact one of the site admins"
          )}{" "}
          and we&apos;ll take care of it. Official results have to be corrected at the source (FTCScout or <em>FIRST</em>),
          and the fix will show up here on the next sync.
        </p>
      </div>
    </>
  );
}
