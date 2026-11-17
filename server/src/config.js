const int = (v, fallback) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isNaN(n) ? fallback : n;
};

export const config = {
  port: int(process.env.PORT, 4000),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ftc-scout",
  clientOrigin: (process.env.CLIENT_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  sheetId: process.env.SHEET_ID || "1PWdTIUPcPH_HxHqmH5rk8OSlTxkeGzbelaZv0GlFBwA",
  syncIntervalSeconds: int(process.env.SYNC_INTERVAL_SECONDS, 60),
  season: int(process.env.FTC_SEASON, 2026),
  region: process.env.FTC_REGION || "JM",
  // FIRST FTC Events API (https://ftc-events.firstinspires.org/services/API)
  firstApiUser: process.env.FTC_API_USER || "",
  firstApiToken: process.env.FTC_API_TOKEN || "",
};
