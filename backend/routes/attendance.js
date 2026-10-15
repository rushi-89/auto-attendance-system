import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sendEmail, sendSms } from "../services/notifications.js";

const router = Router();
const maxMb = Number(process.env.MAX_UPLOAD_MB || 10);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || "").toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) cb(null, true);
    else cb(new Error("Only .xlsx and .xls files are accepted."));
  }
});

// No database by design. Restarting the server clears both collections.
const previewBatches = new Map();
const deliveryLogs = [];

function runPython(buffer, originalName) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const python = process.env.PYTHON_BIN || (isWindows ? "python" : "python3");
    const script = fileURLToPath(new URL("../python/attendance.py", import.meta.url));
    const child = spawn(python, [script, "preview", originalName || "attendance.xlsx"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", () => reject(new Error(`Could not start Python ("${python}"). Install Python 3.10+ and the packages in backend/python/requirements.txt, or set PYTHON_BIN in backend/.env.`)));
    child.on("close", code => {
      if (code !== 0) {
        try { reject(new Error(JSON.parse(stdout).error || stderr.trim().split("\n").pop() || "Python failed to parse the workbook.")); }
        catch { reject(new Error(stderr.trim() || "Python failed to parse the workbook.")); }
        return;
      }
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error("Python returned an invalid response. Check the Python script output.")); }
    });
    child.stdin.end(buffer);
  });
}

router.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Choose an Excel workbook to upload." });
    const result = await runPython(req.file.buffer, req.file.originalname);
    if (result.error) return res.status(400).json(result);
    if (!result.records?.length) {
      return res.status(400).json({
        ...result,
        error: result.error || "No valid student records were found. Review the Excel headings and row errors."
      });
    }
    const batchId = randomUUID();
    const records = result.records.map(row => ({
      ...row,
      emailSubject: `Attendance Information for ${row.studentName}`,
      message: `Dear Parent/Guardian,\n\nThis is an attendance update for your ward, ${row.studentName} (Registration No. ${row.registrationNo}). The recorded attendance for the uploaded period is ${row.attendancePercentage}%.\n\nPlease review this information with your ward. If you believe this record is incorrect, kindly contact the institution.\n\nRegards,\nSmart Attendance System`
    }));
    previewBatches.set(batchId, records);
    const { emailConfigured, smsConfigured } = providerStatus();
    res.json({
      batchId,
      filename: req.file.originalname,
      validCount: records.length,
      invalidCount: result.rowErrors?.length || 0,
      rowErrors: result.rowErrors || [],
      records,
      providers: { emailConfigured, smsConfigured }
    });
  } catch (error) {
    next(error);
  }
});

function providerStatus() {
  return {
    emailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM),
    smsConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER)
  };
}

router.post("/send", async (req, res) => {
  const { batchId, channels, confirmSend } = req.body || {};
  if (confirmSend !== true) return res.status(400).json({ error: "Explicit confirmation is required before sending." });
  if (!Array.isArray(channels) || channels.length === 0 || channels.some(c => !["email", "sms"].includes(c))) {
    return res.status(400).json({ error: "Select email, SMS, or both." });
  }
  const records = previewBatches.get(batchId);
  if (!records) return res.status(404).json({ error: "Preview batch expired or not found. Upload the workbook again." });

  const results = [];
  for (const student of records) {
    for (const channel of channels) {
      let recipient = "";
      let outcome;
      if (channel === "email") {
        recipient = student.emailRecipient || "";
        if (!recipient) outcome = { status: "skipped", detail: "No parent or student email was provided." };
        else outcome = await sendEmail({ to: recipient, subject: student.emailSubject, text: student.message });
      } else {
        recipient = student.parentMobile || "";
        if (!recipient) outcome = { status: "skipped", detail: "No parent mobile number was provided." };
        else if (!providerStatus().smsConfigured) outcome = { status: "skipped", detail: "SMS provider is not configured." };
        else outcome = await sendSms({ to: recipient, body: student.message });
      }
      const item = {
        registrationNo: student.registrationNo,
        studentName: student.studentName,
        channel,
        recipient,
        status: outcome.status,
        detail: outcome.detail,
        createdAt: new Date().toISOString()
      };
      results.push(item);
      if (channel === "email" && outcome.status !== "skipped") await new Promise(r => setTimeout(r, Number(process.env.EMAIL_DELAY_MS || 300)));
      deliveryLogs.unshift({ batchId, ...item });
    }
  }
  res.json({
    batchId,
    attempted: results.length,
    submitted: results.filter(r => r.status === "submitted").length,
    failed: results.filter(r => r.status === "failed").length,
    skipped: results.filter(r => r.status === "skipped").length,
    results
  });
});

router.get("/report", (_req, res) => {
  res.json({ count: deliveryLogs.length, results: deliveryLogs.slice(0, 1000) });
});

export default router;
