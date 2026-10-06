import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";
import { getCurrentUser } from "@/lib/firebase/session";
import TestEmail from "@/emails/TestEmail";

/**
 * Admin-only: send a test email to the caller's own email address.
 * Useful for verifying SMTP + templating end-to-end without spamming anyone else.
 */
export async function POST() {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!actor.email) {
    return NextResponse.json(
      { error: "Your account has no email address on file." },
      { status: 400 },
    );
  }

  try {
    const result = await sendEmail({
      to: actor.email,
      subject: "NAISI email pipeline test",
      react: TestEmail({ name: actor.displayName ?? actor.email.split("@")[0] }),
      kind: "admin-test",
      actorUid: actor.uid,
    });
    // `held` is true when this copy of the site may not write to the caller's
    // address (see src/lib/email/audience.ts). The send did not fail, so this
    // is still a 200, and the panel says what happened instead of "Sent".
    return NextResponse.json({
      ok: true,
      sentTo: actor.email,
      messageId: result.messageId,
      held: result.held.length > 0,
    });
  } catch (err) {
    console.error("[admin test-email]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 500 },
    );
  }
}
