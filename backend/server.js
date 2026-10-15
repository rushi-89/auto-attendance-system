import "dotenv/config";
import express from "express";
import cors from "cors";
import attendanceRouter from "./routes/attendance.js";
import { verifyEmail } from "./services/notifications.js";

const app = express();
const PORT = Number(process.env.PORT || 8000);
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",").map(o => o.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  const emailConfigured = Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER &&
    process.env.SMTP_PASS && process.env.SMTP_FROM
  );
  const smsConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
  res.json({
    status: "ok",
    service: "smart-attendance-api",
    emailConfigured,
    smsConfigured,
    database: false
  });
});

// Opens a real SMTP login to confirm the credentials work: GET /api/email/verify
app.get("/api/email/verify", async (_req, res) => res.json(await verifyEmail()));

app.use("/api/attendance", attendanceRouter);

app.use((err, _req, res, _next) => {
  console.error("Request error:", err.message);
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File is too large. Maximum upload size is 10 MB." });
  }
  if (err.message === "Only .xlsx and .xls files are accepted.") {
    return res.status(400).json({ error: err.message });
  }
  res.status(err.status || 500).json({ error: err.status ? err.message : "An unexpected server error occurred." });
});

app.listen(PORT, () => {
  console.log(`Smart Attendance API running at http://localhost:${PORT}`);
  console.log("Database: disabled (in-memory preview batches and reports)");
});
