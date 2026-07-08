import { env } from "../config/env";

let resend: any = null;
try {
  if (env.RESEND_API_KEY) {
    const { Resend } = require("resend");
    resend = new Resend(env.RESEND_API_KEY);
  }
} catch {
  console.warn("[email] Resend not available, emails disabled");
}

export async function sendInvitationEmail(to: string, password: string) {
  if (!resend) {
    console.log(`[email] Would send invitation to ${to} with password: ${password}`);
    return;
  }
  await resend.emails.send({
    from: "Terra Meetings <invitations@tera-meeting.com>",
    to,
    subject: "Welcome to Terra Meetings",
    html: `<p>Welcome to Terra Meetings!</p><p>Sign in at <a href="${env.APP_URL}/login">${env.APP_URL}/login</a></p><p>Your credentials:</p><p>Email: ${to}<br/>Temporary password: <strong>${password}</strong></p><p>Please change your password after first login.</p>`,
  });
}
