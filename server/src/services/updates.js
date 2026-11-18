// Sending to the email list: event reminders (from the daily cron) and
// updates written by an admin.

import { MailLog, Subscriber } from "../models/index.js";
import { allEvents, splitUpcoming } from "./calendar.js";
import { mailEnabled, sendMail, siteUrl } from "./mail.js";
import { todayISO } from "../lib/util.js";

const unsubscribeUrl = (base, token) => `${base}/updates/unsubscribe?token=${token}`;

const fmtDate = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

/** Send one message to every confirmed subscriber. Returns { sent, failed }. */
export async function sendToList({ subject, paragraphs, button, base }) {
  const subs = await Subscriber.find({ confirmedAt: { $ne: null } }).lean();
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    try {
      await sendMail({ to: s.email, subject, paragraphs, button, unsubscribe: unsubscribeUrl(base, s.token) });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`[mail] ${s.email}: ${err.message}`);
    }
  }
  return { sent, failed, total: subs.length };
}

const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

/**
 * Reminders a week and a day before each dated event. Safe to run more than
 * once a day: each reminder is logged and never sent twice.
 */
export async function sendEventReminders(req) {
  if (!mailEnabled() && process.env.VERCEL) return { skipped: "mail off" };
  const today = todayISO();
  const { upcoming } = splitUpcoming(await allEvents(), today);
  const base = siteUrl(req);
  const results = [];
  for (const e of upcoming) {
    if (!e.start) continue;
    const days = daysBetween(today, e.start);
    // Within the window rather than exact, so a missed cron run still sends.
    const which = days >= 0 && days <= 1 ? "1d" : days >= 6 && days <= 7 ? "7d" : null;
    if (!which) continue;
    const key = `reminder:${e.id}:${which}`;
    if (which === "7d" && (await MailLog.exists({ key: `reminder:${e.id}:1d` }))) continue;
    try {
      await MailLog.create({ key, kind: "reminder", subject: e.name });
    } catch {
      continue; // already sent
    }
    const when = e.end && e.end !== e.start ? `${fmtDate(e.start)} to ${fmtDate(e.end)}` : fmtDate(e.start);
    const subject = which === "1d" ? `Tomorrow: ${e.name}` : `Next week: ${e.name}`;
    const paragraphs = [
      which === "1d" ? `${e.name} is tomorrow.` : `${e.name} is one week away.`,
      [`When: ${when}`, e.location ? `Where: ${e.location}` : null, e.kind ? `Type: ${e.kind}` : null].filter(Boolean).join("\n"),
      e.liveStream ? `If you can't make it, there's a livestream: ${e.liveStream}` : null,
    ].filter(Boolean);
    const button = { label: "See the event calendar", url: `${base}/events` };
    const r = await sendToList({ subject, paragraphs, button, base });
    await MailLog.updateOne({ key }, { sent: r.sent, failed: r.failed });
    results.push({ event: e.name, which, ...r });
  }
  return { reminders: results };
}
