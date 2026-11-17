/**
 * Gmail SMTP sending for Better Auth (verification + password reset).
 * If SMTP_PASS is missing, log and skip — never crash sign-up or sign-in.
 */
import nodemailer from "nodemailer";

export type AppMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}

export async function sendAppMail(message: AppMail): Promise<void> {
  if (!process.env.SMTP_PASS?.trim()) {
    console.log("[mail] SMTP_PASS is not set — skipping send");
    return;
  }
  const user = process.env.SMTP_USER?.trim();
  if (!user) {
    console.log("[mail] SMTP_USER is not set — skipping send");
    return;
  }
  const from =
    process.env.MAIL_FROM?.trim() || `World War Command <${user}>`;
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
