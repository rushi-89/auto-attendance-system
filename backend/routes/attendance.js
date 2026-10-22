
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

    if (
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      name.endsWith(".csv")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx, .xls, and .csv files are accepted."));
    }
  }
});

// In-memory storage: batches and logs clear when the server restarts.
const previewBatches = new Map();
const deliveryLogs = [];

function runPython(buffer, originalName) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";

    const python =
      process.env.PYTHON_BIN ||
      (isWindows ? "python" : "python3");

    const script = fileURLToPath(
      new URL("../python/attendance.py", import.meta.url)
    );

    const child = spawn(
      python,
      [
        script,
        "preview",
        originalName || "attendance.xlsx"
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8"
        },
        windowsHide: true
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", chunk => {
      stdout += chunk;
    });

    child.stderr.on("data", chunk => {
      stderr += chunk;
    });

    child.on("error", () => {
      reject(
        new Error(
          `Could not start Python ("${python}"). Install Python 3.10+ ` +
          "and the packages in backend/python/requirements.txt, " +
          "or configure PYTHON_BIN in backend/.env."
        )
      );
    });

    child.on("close", code => {
      if (code !== 0) {
        try {
          const result = JSON.parse(stdout);
          reject(
            new Error(
              result.error ||
              stderr.trim() ||
              "Python failed to process the attendance file."
            )
          );
        } catch {
          reject(
            new Error(
              stderr.trim() ||
              "Python failed to process the attendance file."
            )
          );
        }

        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(
          new Error(
            "Python returned an invalid response. Check attendance.py."
          )
        );
      }
    });

    child.stdin.on("error", () => {
      // The child process may exit before consuming the input.
    });

    child.stdin.end(buffer);
  });
}

function providerStatus() {
  return {
    emailConfigured: Boolean(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM
    ),

    smsConfigured: Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
    )
  };
}

function makePreviewRecord(row) {
  // Use the category-specific email subject and message generated
  // by attendance.py instead of overwriting them with generic text.
  const message =
    row.emailMessage ||
    row.message ||
    `Dear Parent/Guardian,

This is an attendance update for ${row.studentName}
(Registration No. ${row.registrationNo}).

Overall attendance: ${row.attendancePercentage}%

Please contact the institution if you believe this record is incorrect.

Regards,
Smart Attendance System`;

  return {
    ...row,
    message,
    emailSubject:
      row.emailSubject ||
      `Attendance Information for ${row.studentName}`
  };
}

router.post(
  "/upload",
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "Choose an Excel workbook or CSV file to upload."
        });
      }

      const result = await runPython(
        req.file.buffer,
        req.file.originalname
      );

      if (result.error) {
        return res.status(400).json(result);
      }

      if (!result.records?.length) {
        return res.status(400).json({
          ...result,
          error:
            "No valid student records were found. Review the file " +
            "headings and row errors."
        });
      }

      const batchId = randomUUID();

      const records = result.records.map(makePreviewRecord);

      previewBatches.set(batchId, records);

      const { emailConfigured, smsConfigured } = providerStatus();

      return res.json({
        batchId,
        filename: req.file.originalname,
        validCount: records.length,
        invalidCount: result.rowErrors?.length || 0,
        rowErrors: result.rowErrors || [],
        subjectColumns: result.subjectColumns || [],
        records,
        providers: {
          emailConfigured,
          smsConfigured
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post("/send", async (req, res) => {
  const { batchId, channels, confirmSend } = req.body || {};

  if (confirmSend !== true) {
    return res.status(400).json({
      error: "Explicit confirmation is required before sending."
    });
  }

  if (
    !Array.isArray(channels) ||
    channels.length === 0 ||
    channels.some(channel => !["email", "sms"].includes(channel))
  ) {
    return res.status(400).json({
      error: "Select email, SMS, or both."
    });
  }

  const records = previewBatches.get(batchId);

  if (!records) {
    return res.status(404).json({
      error: "Preview batch expired or not found. Upload the file again."
    });
  }

  const results = [];

  for (const student of records) {
    for (const channel of channels) {
      let recipient = "";
      let outcome;

      if (channel === "email") {
        recipient = student.emailRecipient || "";

        if (!recipient) {
          outcome = {
            status: "skipped",
            detail: "No parent or student email was provided."
          };
        } else if (!providerStatus().emailConfigured) {
          outcome = {
            status: "skipped",
            detail: "SMTP email provider is not configured."
          };
        } else {
          try {
            const attachments = [];

            if (student.attendancePdfBase64) {
              const pdfBuffer = Buffer.from(
                student.attendancePdfBase64,
                "base64"
              );

              // Verify the PDF signature before attaching it.
              if (
                pdfBuffer.length < 5 ||
                pdfBuffer.subarray(0, 5).toString("ascii") !== "%PDF-"
              ) {
                outcome = {
                  status: "failed",
                  detail: "The generated attendance PDF is invalid."
                };
              } else {
                attachments.push({
                  filename:
                    student.attendancePdfFilename ||
                    `attendance_${student.registrationNo}.pdf`,
                  content: pdfBuffer,
                  contentType: "application/pdf"
                });
              }
            }

            if (!outcome) {
              outcome = await sendEmail({
                to: recipient,
                subject: student.emailSubject,
                text: student.message,
                attachments
              });
            }
          } catch (error) {
            outcome = {
              status: "failed",
              detail: error.message || "Email delivery failed."
            };
          }
        }
      } else {
        recipient = student.parentMobile || "";

        if (!recipient) {
          outcome = {
            status: "skipped",
            detail: "No parent mobile number was provided."
          };
        } else if (!providerStatus().smsConfigured) {
          outcome = {
            status: "skipped",
            detail: "SMS provider is not configured."
          };
        } else {
          try {
            outcome = await sendSms({
              to: recipient,
              body: student.smsMessage || student.message
            });
          } catch (error) {
            outcome = {
              status: "failed",
              detail: error.message || "SMS delivery failed."
            };
          }
        }
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

      if (
        channel === "email" &&
        outcome.status !== "skipped"
      ) {
        await new Promise(resolve =>
          setTimeout(
            resolve,
            Math.max(0, Number(process.env.EMAIL_DELAY_MS || 300))
          )
        );
      }

      deliveryLogs.unshift({
        batchId,
        ...item
      });
    }
  }

  return res.json({
    batchId,
    attempted: results.length,
    submitted: results.filter(
      result => result.status === "submitted"
    ).length,
    failed: results.filter(
      result => result.status === "failed"
    ).length,
    skipped: results.filter(
      result => result.status === "skipped"
    ).length,
    results
  });
});

router.get("/report", (_req, res) => {
  res.json({
    count: deliveryLogs.length,
    results: deliveryLogs.slice(0, 1000)
  });
});

export default router;
