
import nodemailer from "nodemailer";
import twilio from "twilio";

let cachedTransporter;

function getTransporter() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_FROM
  } = process.env;

  // Google App Passwords may contain spaces.
  const SMTP_PASS = (process.env.SMTP_PASS || "").replace(/\s+/g, "");

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    return null;
  }

  if (!cachedTransporter) {
    const port = Number(SMTP_PORT || 587);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(
        "SMTP_PORT must be a valid port number (usually 587 or 465)."
      );
    }

    const secure =
      String(
        SMTP_SECURE || (port === 465 ? "true" : "false")
      ).toLowerCase() === "true";

    cachedTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure,
      requireTLS: !secure && port === 587,
      pool: true,
      maxConnections: 1,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
  }

  return cachedTransporter;
}

function describeEmailError(error) {
  if (error.code === "EAUTH") {
    return (
      "SMTP login rejected. For Gmail, use a 16-character App Password " +
      "with 2-Step Verification enabled, not your normal password."
    );
  }

  if (
    error.code === "ESOCKET" ||
    error.code === "ECONNECTION" ||
    error.code === "ETIMEDOUT" ||
    error.code === "EDNS"
  ) {
    return (
      `Could not reach the SMTP server (${error.code}). ` +
      "Check SMTP_HOST, SMTP_PORT, SMTP_SECURE, and your internet connection."
    );
  }

  if (error.code === "EENVELOPE") {
    return "The recipient address was rejected as invalid.";
  }

  return (
    `Email send failed: ${error.code || "provider error"}` +
    `${error.responseCode ? ` (SMTP ${error.responseCode})` : ""}`
  );
}

export async function verifyEmail() {
  let transporter;

  try {
    transporter = getTransporter();
  } catch (error) {
    return {
      ok: false,
      detail: error.message
    };
  }

  if (!transporter) {
    return {
      ok: false,
      detail: "SMTP is not configured in backend/.env."
    };
  }

  try {
    await transporter.verify();

    return {
      ok: true,
      detail: "SMTP login succeeded."
    };
  } catch (error) {
    return {
      ok: false,
      detail: describeEmailError(error)
    };
  }
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  attachments = []
}) {
  let transporter;

  try {
    transporter = getTransporter();
  } catch (error) {
    console.error("SMTP configuration error:", error.message);

    return {
      status: "failed",
      detail:
        "SMTP configuration is invalid. Check SMTP_PORT and backend/.env."
    };
  }

  if (!transporter) {
    return {
      status: "skipped",
      detail:
        "Email provider is not configured. Complete SMTP_HOST, SMTP_USER, " +
        "SMTP_PASS, and SMTP_FROM in backend/.env."
    };
  }

  try {
    const safeAttachments = attachments.map(attachment => {
      if (
        !attachment ||
        typeof attachment.filename !== "string" ||
        !Buffer.isBuffer(attachment.content)
      ) {
        throw new Error("Invalid email attachment.");
      }

      return {
        filename: attachment.filename,
        content: attachment.content,
        contentType:
          attachment.contentType || "application/octet-stream"
      };
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
      attachments: safeAttachments
    });

    return {
      status: "submitted",
      detail:
        `Accepted by SMTP server (` +
        `${info.messageId || "message accepted"}).`
    };
  } catch (error) {
    console.error("Email provider error:", error.message);

    return {
      status: "failed",
      detail: describeEmailError(error)
    };
  }
}

export async function sendSms({ to, body }) {
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER
  } = process.env;

  if (
    !TWILIO_ACCOUNT_SID ||
    !TWILIO_AUTH_TOKEN ||
    !TWILIO_FROM_NUMBER
  ) {
    return {
      status: "skipped",
      detail: "SMS provider is not configured."
    };
  }

  try {
    const client = twilio(
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN
    );

    const message = await client.messages.create({
      from: TWILIO_FROM_NUMBER,
      to,
      body
    });

    return {
      status: "submitted",
      detail:
        `Accepted by SMS provider (ID ${message.sid}).`
    };
  } catch (error) {
    console.error("SMS provider error:", error.message);

    return {
      status: "failed",
      detail:
        `SMS send failed: ${error.code || "provider error"}`
    };
  }
}
