// Email: confirmations, event reminders and updates to people who signed up.
//
// Sending uses any SMTP account set in SMTP_URL, for example a Gmail account
// with an app password:
//   SMTP_URL=smtps://you%40gmail.com:APP_PASSWORD@smtp.gmail.com:465
//   MAIL_FROM="FTC Scout Jamaica <you@gmail.com>"
// Without SMTP_URL, emails are printed to the server log in development and
// sign-up is switched off in production.

import nodemailer from "nodemailer";
import { HttpError } from "../lib/util.js";

let transport = null;

export const mailEnabled = () => Boolean(process.env.SMTP_URL);
const devLog = () => !mailEnabled() && !process.env.VERCEL;

/** The public site address, used in email links. */
export function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  // Local dev: the site runs on the client port, not the API's
  if (!process.env.VERCEL && process.env.CLIENT_ORIGIN) return process.env.CLIENT_ORIGIN.split(",")[0].replace(/\/$/, "");
  if (req) {
    const origin = req.get("origin");
    if (origin) return origin;
    return `${req.get("x-forwarded-proto") ?? req.protocol}://${req.get("x-forwarded-host") ?? req.get("host")}`;
  }
  return process.env.CLIENT_ORIGIN?.split(",")[0] ?? "http://localhost:3000";
}

export function assertMail() {
  if (!mailEnabled() && !devLog()) throw new HttpError(503, "Email updates aren't switched on yet", "mail_off");
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Plain, readable emails. `paragraphs` are text; `button` is an optional
 * { label, url }. `unsubscribe` adds the footer link and List-Unsubscribe headers.
 */
export async function sendMail({ to, subject, paragraphs, button, unsubscribe }) {
  const text = [
    ...paragraphs,
    button ? `${button.label}: ${button.url}` : null,
    unsubscribe ? `You signed up for FTC Scout Jamaica email updates. Unsubscribe: ${unsubscribe}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f3f1ec;font-family:Arial,Helvetica,sans-serif;color:#17181c">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="font-weight:700;font-size:15px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:18px">FTC Scout <span style="color:#ff5b14">Jamaica</span></div>
<div style="background:#fff;border:1px solid #e3dfd5;border-radius:14px;padding:24px;font-size:15px;line-height:1.6">
${paragraphs.map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("\n")}
${button ? `<p style="margin:20px 0 4px"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#ff5b14;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:999px">${escapeHtml(button.label)}</a></p>` : ""}
</div>
${unsubscribe ? `<p style="font-size:12px;color:#77756e;margin:16px 4px 0">You signed up for FTC Scout Jamaica email updates. <a href="${escapeHtml(unsubscribe)}" style="color:#77756e">Unsubscribe</a></p>` : ""}
</div></body></html>`;

  const message = {
    to,
    subject,
    text,
    html,
    ...(unsubscribe
      ? { headers: { "List-Unsubscribe": `<${unsubscribe.replace("/updates/unsubscribe", "/api/updates/unsubscribe")}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
      : {}),
  };

  if (devLog()) {
    console.log(`\n[mail] to ${to}: ${subject}\n${text}\n`);
    return { logged: true };
  }
  assertMail();
  transport ??= nodemailer.createTransport(process.env.SMTP_URL);
  const from = process.env.MAIL_FROM || transport.options?.auth?.user;
  return transport.sendMail({ from, ...message });
}
