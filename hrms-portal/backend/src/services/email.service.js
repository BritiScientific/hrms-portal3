const nodemailer = require("nodemailer");

const isEmailConfigured = () => {
  const port = Number(process.env.SMTP_PORT);
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_FROM &&
    Number.isInteger(port) &&
    port > 0 &&
    port <= 65535 &&
    (Boolean(process.env.SMTP_USER) === Boolean(process.env.SMTP_PASSWORD)) &&
    (!process.env.SMTP_SECURE || ["true", "false"].includes(process.env.SMTP_SECURE))
  );
};

const sendPasswordResetCode = async (email, code) => {
  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port");
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || (process.env.SMTP_SECURE !== "false" && port === 465),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
    ...(process.env.SMTP_USER ? {
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    } : {})
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Your HRMS password reset code",
    text: `Your HRMS password reset code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
    html: `<p>Your HRMS password reset code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:5px">${code}</p><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>`
  });
};

module.exports = { isEmailConfigured, sendPasswordResetCode };
