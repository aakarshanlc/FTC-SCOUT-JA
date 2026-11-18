// The whole Express API (server/src/app.js) mounted inside the Next.js app,
// so the site and its API deploy as ONE Vercel project on one domain:
//   /api/*       → Express routes
//   /events.ics  → rewritten here by next.config.ts
// Pages Router API routes hand us Node's req/res, which Express accepts as-is.
import { app } from "ftc-scout-server/app";

export const config = {
  api: { bodyParser: false, externalResolver: true }, // Express parses bodies itself
  maxDuration: 300, // the full data import can take a few minutes
};

export default function handler(req, res) {
  return app(req, res);
}
