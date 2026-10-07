import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { admissionApplicationUrl } from "@/lib/email/admissionEmails";
import type { ApplicationForm } from "../normalise";
import { loadFirstNames } from "./people";
import { civilDateLabel } from "./plan";
import { programmeOf } from "./programmes";

/**
 * What every decision-day email needs to know about the form it comes from:
 * who signs for each programme, the day an invitation is to be answered by,
 * and where its buttons lead.
 *
 * Read once per press, per test and per reminder run, and shared by all of
 * them, so the preview, the email and the reminder that follows it are built
 * from the same facts.
 */
export type EmailContext = {
  form: ApplicationForm;
  leadNames: Record<string, string>;
  replyBy: string | null;
  links: { application: string; events: string };
};

/** This site's own address, with no trailing slash. Empty when it is not set. */
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
}

export async function emailContext(db: Firestore, form: ApplicationForm): Promise<EmailContext> {
  const leads = form.programmeIds.map((programmeId) => programmeOf(form, programmeId)?.leadUid ?? "");
  const names = await loadFirstNames(db, leads);
  // Built from entries, so every programme id is the object's own key
  // whatever the id happens to be called.
  const leadNames: Record<string, string> = Object.fromEntries(
    form.programmeIds.map((programmeId) => {
      const leadUid = programmeOf(form, programmeId)?.leadUid;
      return [programmeId, leadUid ? (names.get(leadUid) ?? "") : ""];
    }),
  );
  return {
    form,
    leadNames,
    replyBy: civilDateLabel(form.invitationReplyBy),
    links: {
      application: admissionApplicationUrl(form.round.id, "status"),
      events: `${appUrl()}/events`,
    },
  };
}
