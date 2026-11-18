// /api/updates: email sign-up (double opt-in), unsubscribe, and admin sends.

import crypto from "node:crypto";
import { Router } from "express";
import { MailLog, Subscriber } from "../models/index.js";
import { HttpError, ah } from "../lib/util.js";
import { requireAdmin, stamp } from "../services/auth.js";
import { assertMail, mailEnabled, sendMail, siteUrl } from "../services/mail.js";
import { sendToList } from "../services/updates.js";

export const updates = Router();

const str = (v, max) => String(v ?? "").trim().slice(0, max);
const token = (v) => {
  const t = str(v, 100);
  if (!/^[a-f0-9]{48}$/.test(t)) throw new HttpError(400, "That link isn't valid");
  return t;
};
const CONFIRM_DAYS = 7;
const RESEND_MS = 2 * 60 * 1000;

updates.get(
  "/status",
  ah(async (req, res) => {
    const out = { enabled: mailEnabled() || !process.env.VERCEL };
    if (req.user?.role === "admin") {
      const [active, pending, recent] = await Promise.all([
        Subscriber.countDocuments({ confirmedAt: { $ne: null } }),
        Subscriber.countDocuments({ confirmedAt: null }),
        MailLog.find().sort({ createdAt: -1 }).limit(8).lean(),
      ]);
      Object.assign(out, {
        smtp: mailEnabled(),
        subscribers: active,
        pending,
        recent: recent.map((m) => ({ kind: m.kind, subject: m.subject, sent: m.sent, failed: m.failed, at: m.createdAt, by: m.by?.name ?? null })),
      });
    }
    res.json(out);
  }),
);

// Always answers the same way, so the form can't be used to find out who's on the list.
updates.post(
  "/subscribe",
  ah(async (req, res) => {
    assertMail();
    const email = str(req.body.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address");
    const done = () => res.json({ ok: true, message: `Check ${email} for a link to confirm.` });

    let sub = await Subscriber.findOne({ email });
    if (sub?.confirmedAt) return done();
    if (sub?.confirmSentAt && Date.now() - sub.confirmSentAt.getTime() < RESEND_MS) return done();
    sub ??= new Subscriber({ email, token: crypto.randomBytes(24).toString("hex") });
    sub.confirmSentAt = new Date();
    sub.expiresAt = new Date(Date.now() + CONFIRM_DAYS * 86400000);
    await sub.save();

    const base = siteUrl(req);
    await sendMail({
      to: email,
      subject: "Confirm your FTC Scout Jamaica email updates",
      paragraphs: [
        "Someone (hopefully you) asked for email updates about FTC events in Jamaica.",
        "Click the button to confirm. If this wasn't you, ignore this email and nothing else will be sent.",
      ],
      button: { label: "Confirm my email", url: `${base}/updates/confirm?token=${sub.token}` },
    });
    done();
  }),
);

updates.post(
  "/confirm",
  ah(async (req, res) => {
    const sub = await Subscriber.findOne({ token: token(req.body.token) });
    if (!sub) throw new HttpError(404, "This link has expired. Sign up again to get a new one.");
    if (!sub.confirmedAt) {
      sub.confirmedAt = new Date();
      sub.expiresAt = null;
      await sub.save();
    }
    res.json({ ok: true, email: sub.email });
  }),
);

const unsubscribe = ah(async (req, res) => {
  const t = token(req.body?.token ?? req.query.token);
  const sub = await Subscriber.findOneAndDelete({ token: t });
  res.json({ ok: true, email: sub?.email ?? null });
});
updates.post("/unsubscribe", unsubscribe);

// Admin: write an update to everyone on the list.
updates.post(
  "/send",
  requireAdmin,
  ah(async (req, res) => {
    assertMail();
    const subject = str(req.body.subject, 150);
    const message = str(req.body.message, 5000);
    if (!subject || !message) throw new HttpError(400, "Add a subject and a message");
    const paragraphs = message.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const base = siteUrl(req);
    const log = await MailLog.create({ key: `update:${crypto.randomUUID()}`, kind: "update", subject, by: stamp(req.user) });
    const r = await sendToList({ subject, paragraphs, button: { label: "Open FTC Scout", url: `${base}/events` }, base });
    log.sent = r.sent;
    log.failed = r.failed;
    await log.save();
    res.json(r);
  }),
);
