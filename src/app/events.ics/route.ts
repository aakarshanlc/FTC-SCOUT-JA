import { fetchEvents, REGION, SEASON } from "@/lib/ftcscout";
import { buildCalendar, icsFor } from "@/lib/events";
import { loadTab, SCRIMMAGE_TAB } from "@/lib/sheet";

// Calendar apps poll this occasionally — always answer with fresh data and
// never let it run at build time (a network failure there would break builds).
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const [ftc, sheetRows, scrimmages] = await Promise.all([
      fetchEvents(SEASON, REGION).catch(() => []),
      loadTab("Events").catch(() => []),
      loadTab(SCRIMMAGE_TAB).catch(() => []),
    ]);
    const ics = icsFor(buildCalendar(ftc, sheetRows, scrimmages));
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="ftc-scouting-events.ics"',
        "Cache-Control": "public, max-age=1800",
      },
    });
  } catch (err) {
    return new Response(
      `Calendar unavailable: ${err instanceof Error ? err.message : String(err)}`,
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
}
