// Accounts and sessions, using only Node's crypto.
//   • Passwords: scrypt with a random salt — stored as "salt:hash", never readable.
//   • Sessions: a random token in an httpOnly cookie; only its SHA-256 is stored,
//     so a database leak doesn't leak live sessions.
//   • Invites: same idea — the link carries a token, the DB keeps its hash.

import crypto from "node:crypto";
import { promisify } from "node:util";
import { Session, User } from "../models/index.js";
import { HttpError } from "../lib/util.js";

const scrypt = promisify(crypto.scrypt);

export const COOKIE = "fs_session";
const SESSION_DAYS = 30;
export const INVITE_DAYS = 7;
const MAX_FAILED = 5; // wrong passwords before a short lockout
const LOCK_MINUTES = 10;
export const MIN_PASSWORD = 8;

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
export const newToken = () => crypto.randomBytes(32).toString("base64url");

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored || "").split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function checkPassword(password) {
  const p = String(password ?? "");
  if (p.length < MIN_PASSWORD) throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters`);
  if (p.length > 200) throw new HttpError(400, "Password is too long");
  return p;
}

/** Public shape of a user (never includes hashes). */
export const publicUser = (u) =>
  u && {
    id: String(u._id),
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
    pending: !u.passwordHash,
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt ?? null,
  };

/** Small attribution stamp stored on records a user creates. */
export const stamp = (user) => (user ? { id: String(user._id), name: user.name } : null);

// ── cookies ──

function readCookie(req, name) {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function cookieAttrs(maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  return [`Path=/`, `HttpOnly`, `SameSite=Lax`, secure ? "Secure" : "", `Max-Age=${maxAgeSeconds}`].filter(Boolean).join("; ");
}

export async function startSession(res, user, req) {
  const token = newToken();
  await Session.create({
    user: user._id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
    userAgent: String(req.get("user-agent") ?? "").slice(0, 200),
  });
  res.append("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; ${cookieAttrs(SESSION_DAYS * 86_400)}`);
}

export async function endSession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) await Session.deleteOne({ tokenHash: sha256(token) });
  res.append("Set-Cookie", `${COOKIE}=; ${cookieAttrs(0)}`);
}

/** Middleware: attach req.user when a valid session cookie is present. */
export async function loadUser(req, _res, next) {
  try {
    const token = readCookie(req, COOKIE);
    if (token) {
      const session = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } }).lean();
      if (session) {
        const user = await User.findById(session.user).lean();
        if (user?.active && user.passwordHash) req.user = user;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireUser(req, _res, next) {
  if (!req.user) return next(new HttpError(401, "Sign in as a scout to do that", "auth_required"));
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(new HttpError(401, "Sign in as an admin to do that", "auth_required"));
  if (req.user.role !== "admin") return next(new HttpError(403, "Only admins can do that", "admin_required"));
  next();
}

/** Check a login; enforces the short lockout after repeated failures. */
export async function attemptLogin(email, password) {
  const user = await User.findOne({ email: String(email ?? "").trim().toLowerCase() });
  // Same message for unknown email and wrong password, so emails can't be probed.
  const fail = new HttpError(401, "Wrong email or password");
  if (!user || !user.active || !user.passwordHash) {
    await verifyPassword(String(password ?? ""), "00:00"); // keep timing similar
    throw fail;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil - Date.now()) / 60_000);
    throw new HttpError(429, `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
  }
  if (!(await verifyPassword(String(password ?? ""), user.passwordHash))) {
    user.failedLogins += 1;
    if (user.failedLogins >= MAX_FAILED) {
      user.failedLogins = 0;
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
    }
    await user.save();
    throw fail;
  }
  user.failedLogins = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

export const inviteHash = sha256;
