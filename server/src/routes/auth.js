// /api/auth — sign in/out, first-admin setup, invites, and the team list.

import crypto from "node:crypto";
import { Router } from "express";
import mongoose from "mongoose";
import { Session, User } from "../models/index.js";
import { HttpError, ah } from "../lib/util.js";
import {
  INVITE_DAYS,
  attemptLogin,
  checkPassword,
  endSession,
  hashPassword,
  inviteHash,
  newToken,
  publicUser,
  requireAdmin,
  requireUser,
  startSession,
  verifyPassword,
} from "../services/auth.js";

export const auth = Router();

const str = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const email = (v) => {
  const e = str(v, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, "Enter a valid email address");
  return e;
};
const userId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid user id");
  return id;
};
const sameSecret = (a, b) => {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Issue (or re-issue) an invite link for a user; returns the one-time token. */
async function issueInvite(user, by) {
  const token = newToken();
  user.inviteTokenHash = inviteHash(token);
  user.inviteExpires = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  if (by) user.invitedBy = by._id;
  await user.save();
  return token;
}

// Who's signed in, and whether the site still needs its first admin.
auth.get(
  "/me",
  ah(async (req, res) => {
    const setupNeeded = (await User.estimatedDocumentCount()) === 0;
    res.json({ user: publicUser(req.user) ?? null, setupNeeded, setupEnabled: Boolean(process.env.ADMIN_SETUP_CODE) });
  }),
);

// One-time: create the first admin. Requires ADMIN_SETUP_CODE (set in the
// server environment) and only works while there are no accounts at all.
auth.post(
  "/setup",
  ah(async (req, res) => {
    const code = process.env.ADMIN_SETUP_CODE;
    if (!code) throw new HttpError(403, "Setup is disabled. Set ADMIN_SETUP_CODE on the server first.");
    if ((await User.estimatedDocumentCount()) > 0) throw new HttpError(409, "An admin already exists. Sign in instead.");
    if (!sameSecret(req.body.code, code)) throw new HttpError(403, "That setup code isn't right");
    const user = await User.create({
      email: email(req.body.email),
      name: str(req.body.name, 80) || "Admin",
      role: "admin",
      passwordHash: await hashPassword(checkPassword(req.body.password)),
      lastLoginAt: new Date(),
    });
    await startSession(res, user, req);
    res.status(201).json({ user: publicUser(user) });
  }),
);

auth.post(
  "/login",
  ah(async (req, res) => {
    const user = await attemptLogin(req.body.email, req.body.password);
    await startSession(res, user, req);
    res.json({ user: publicUser(user) });
  }),
);

auth.post(
  "/logout",
  ah(async (req, res) => {
    await endSession(req, res);
    res.status(204).end();
  }),
);

// Change your own password (signs out your other devices).
auth.post(
  "/password",
  requireUser,
  ah(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!(await verifyPassword(String(req.body.current ?? ""), user.passwordHash))) throw new HttpError(400, "Current password is wrong");
    user.passwordHash = await hashPassword(checkPassword(req.body.next));
    await user.save();
    await Session.deleteMany({ user: user._id });
    await startSession(res, user, req);
    res.json({ user: publicUser(user) });
  }),
);

// ── invites ──

// Look up an invite link (shows the email/name on the "set your password" page).
auth.get(
  "/invite/:token",
  ah(async (req, res) => {
    const user = await User.findOne({ inviteTokenHash: inviteHash(str(req.params.token, 100)), inviteExpires: { $gt: new Date() }, active: true }).lean();
    if (!user) throw new HttpError(404, "This invite link is invalid or has expired. Ask an admin for a new one.");
    res.json({ email: user.email, name: user.name, role: user.role, reset: Boolean(user.passwordHash) });
  }),
);

// Accept an invite: set a password and sign in.
auth.post(
  "/invite/:token",
  ah(async (req, res) => {
    const user = await User.findOne({ inviteTokenHash: inviteHash(str(req.params.token, 100)), inviteExpires: { $gt: new Date() }, active: true });
    if (!user) throw new HttpError(404, "This invite link is invalid or has expired. Ask an admin for a new one.");
    user.passwordHash = await hashPassword(checkPassword(req.body.password));
    if (str(req.body.name, 80)) user.name = str(req.body.name, 80);
    user.inviteTokenHash = null;
    user.inviteExpires = null;
    user.failedLogins = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await user.save();
    await Session.deleteMany({ user: user._id }); // a reset link signs out old devices
    await startSession(res, user, req);
    res.json({ user: publicUser(user) });
  }),
);

// ── team (admins) ──

auth.get(
  "/users",
  requireAdmin,
  ah(async (_req, res) => {
    const users = await User.find().sort({ role: 1, name: 1 }).lean();
    res.json(users.map((u) => ({ ...publicUser(u), inviteExpires: u.inviteExpires ?? null })));
  }),
);

// Invite a new scout/admin → returns a one-time link for the admin to share.
auth.post(
  "/users",
  requireAdmin,
  ah(async (req, res) => {
    const addr = email(req.body.email);
    const name = str(req.body.name, 80);
    if (!name) throw new HttpError(400, "Enter the scout's name");
    const role = req.body.role === "admin" ? "admin" : "scout";
    if (await User.exists({ email: addr })) throw new HttpError(409, "Someone with that email already has an account");
    const user = new User({ email: addr, name, role });
    const token = await issueInvite(user, req.user);
    res.status(201).json({ user: publicUser(user), invitePath: `/invite/${token}`, expires: user.inviteExpires });
  }),
);

// New invite link for an existing account (unfinished invite, or a password reset).
auth.post(
  "/users/:id/invite",
  requireAdmin,
  ah(async (req, res) => {
    const user = await User.findById(userId(req.params.id));
    if (!user) throw new HttpError(404, "User not found");
    const token = await issueInvite(user, req.user);
    res.json({ user: publicUser(user), invitePath: `/invite/${token}`, expires: user.inviteExpires });
  }),
);

// Change role or remove access. Admins can't lock themselves out or remove the last admin.
auth.patch(
  "/users/:id",
  requireAdmin,
  ah(async (req, res) => {
    const user = await User.findById(userId(req.params.id));
    if (!user) throw new HttpError(404, "User not found");
    const self = String(user._id) === String(req.user._id);
    const nextRole = req.body.role === "admin" || req.body.role === "scout" ? req.body.role : user.role;
    const nextActive = typeof req.body.active === "boolean" ? req.body.active : user.active;
    if (self && (nextRole !== "admin" || !nextActive)) throw new HttpError(400, "You can't remove your own admin access");
    if (user.role === "admin" && (nextRole !== "admin" || !nextActive)) {
      const admins = await User.countDocuments({ role: "admin", active: true });
      if (admins <= 1) throw new HttpError(400, "There must be at least one admin");
    }
    user.role = nextRole;
    user.active = nextActive;
    await user.save();
    if (!nextActive) await Session.deleteMany({ user: user._id }); // removing access signs them out now
    res.json({ user: publicUser(user) });
  }),
);
