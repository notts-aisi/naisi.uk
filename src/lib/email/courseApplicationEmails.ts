import "server-only";
import ApplicationEmail from "@/emails/ApplicationEmail";
import { getAdminDb } from "@/lib/firebase/admin";
import { unfilledTokens } from "@/lib/courses/placementEmail";
import {
  buildCourseTokens,
  courseTemplateDefaults,
  normalizeCourseTemplate,
  type CourseTemplateId,
} from "@/lib/firestore/courseEmails";
import {
  personaliseBlocks,
  personaliseString,
  type Block,
  type TokenValues,
} from "@/lib/firestore/newsletterBlocks";
import { sendEmail } from "./send";

/**
 * Course application lifecycle emails. Thin wrapper over `sendEmail` in the
 * `collaboratorEmails.ts` shape, but block-based rather than a hard-coded JSX
 * body: the copy lives in `courseEmailTemplates/{id}` and renders through the
 * SAME `ApplicationEmail` component + `EmailChrome` the member-application
 * emails use, so course mail is visually identical to the rest of the estate.
 *
 * Template resolution is FALLBACK-FIRST: until an admin saves a template in the
 * course email designs editor, no `courseEmailTemplates` doc exists and
 * `courseTemplateDefaults` (courseEmails.ts) is what actually sends. A stored
 * template only wins when it is well-formed AND non-empty — an admin who saves
 * a blank body gets the seed copy rather than an empty email. A Firestore read
 * failure degrades the same way: the send still happens, on the defaults.
 *
 * Errors are the caller's to swallow — every call site fires these after its
 * write has committed, and a failed niceness email must never fail the
 * request that earned it.
 *
 * WHAT THE DECISION COPY MAY PROMISE: an acceptance is an OFFER, not a seat.
 * Deciding does not enrol anyone — allocation places accepted applicants into
 * groups afterwards — so the accepted template says a placement email follows
 * with the group, facilitator, and time slot, and never names one. The
 * group-scoped tokens ({groupName}, {facilitatorNames}, {firstSessionWhen}) are
 * deliberately NOT supplied on the application-lifecycle paths: an admin who
 * pastes one into a decision template sees the literal `{token}` in a test send
 * and notices, rather than shipping a blank where a group name should be.
 *
 * THE PLACEMENT EMAIL (`allocated`) IS SENT AS COMPOSED, AND NO OTHER WAY. The
 * allocation publish route writes it with `composePlacementEmail`
 * (`src/lib/courses/placementEmail.ts`), or for the people of a run an
 * incubator names with `composeIncubatorStartEmail`
 * (`src/lib/courses/incubatorStartEmail.ts`), each of which fills every token
 * or says why it cannot, and hands the finished subject and blocks to this
 * function.
 * Nothing here fills a token for that kind, and a placement email that still
 * carries one is refused rather than sent. The facilitators' email that goes
 * beside it at Publish (`facilitating`, written by `composeFacilitatingEmail`)
 * is sent the same way, under the same refusal.
 *
 * A COMPOSED EMAIL CAN BE A TEST: the same words to the address of whoever
 * pressed "Send a test to me", marked in its subject the way decision day
 * marks one, and logged as `course-test` so the deliverability tab can tell
 * it from the real thing.
 *
 * EVERY SEND SAYS WHAT HAPPENED. The mail door can hand an email to the
 * provider, hold it (this copy of the site may not write to that address) or
 * drop it (the address is on the do-not-email list), and the answer comes
 * back so Publish can say which. A send that fails throws, as before.
 */

/**
 * The five lifecycle triggers, one per template id. `submitted` is fired by
 * the apply route; `accepted`/`waitlisted`/`rejected` by the decide route
 * (/api/courses/runs/[runId]/applications/[uid]/decide) once a decision has
 * COMMITTED, one email per status change — a re-decision into the same status
 * sends nothing, so a double-clicked Accept can't mail twice. `allocated` is
 * fired by the allocation publish route
 * (/api/courses/runs/[runId]/allocation/publish) once per placement, guarded
 * by `courseEnrolments.allocatedEmailAt`, and `facilitating` by the same
 * press once per facilitator per group, guarded by a marker in
 * `courseNudges` (`src/lib/courses/allocationPublish.ts`).
 */
export type CourseApplicationEmailKind =
  | "submitted"
  | "accepted"
  | "waitlisted"
  | "rejected"
  | "allocated"
  | "facilitating";

/** The two emails Publish writes with a composer and hands over finished. */
export type ComposedCourseEmailKind = "allocated" | "facilitating";

const TEMPLATE_FOR_KIND: Record<Exclude<CourseApplicationEmailKind, ComposedCourseEmailKind>, CourseTemplateId> = {
  submitted: "course-application-submitted",
  accepted: "course-application-accepted",
  waitlisted: "course-application-waitlisted",
  rejected: "course-application-rejected",
};

/** What became of one email the mail door was handed. */
export type CourseEmailDelivery =
  /** Handed to the mail provider. */
  | "sent"
  /** This copy of the site may not write to that address, so nothing went. */
  | "held"
  /** The address is on the do-not-email list, so nothing went. */
  | "suppressed";

/** The placement email or the facilitators' email, already written. See the module comment. */
export type ComposedCourseEmailOptions = {
  kind: ComposedCourseEmailKind;
  /** Deliverable address: the recipient's own, or for a test the address on the presser's session. */
  to: string;
  /** The subject and blocks the composer returned for this person. */
  composed: { subject: string; blocks: Block[] };
  /** The template's own sender name, when an admin set one. */
  fromName?: string;
  /**
   * The recipient's uid, recorded as the deliverability log's actor. For a
   * test, the uid of whoever pressed "Send a test to me".
   */
  uid: string;
  /** Run id, the deliverability log's reference. */
  runId: string;
  /** A rehearsal to the presser's own address: marked in the subject and logged as `course-test`. */
  test?: boolean;
};

export type CourseApplicationEmailOptions = {
  kind: Exclude<CourseApplicationEmailKind, ComposedCourseEmailKind>;
  /** Deliverable address — sourced from the SESSION at the call site, never a body field. */
  to: string;
  /** The applicant's display name; drives the {preferredName} / {firstName} tokens. */
  name: string;
  courseTitle: string;
  runLabel: string;
  /**
   * Human-formatted run start ("Monday 6 October") for the {startDate} token.
   * Omitted when the run has no start date set yet: the token then stays
   * literal in the sent mail, which is the house convention for a value that
   * should have been there (an admin notices; an empty gap in a sentence
   * nobody does).
   */
  startDate?: string;
  /** Applicant uid — recorded as the deliverability log's actor. */
  uid: string;
  /** Run id — the deliverability log's reference, so a run's mail is greppable. */
  runId: string;
};

/** One course email's wording as it would be sent now. */
export type CourseEmailTemplate = { subject: string; blocks: Block[]; fromName?: string };

/**
 * The wording of one course email: the template an admin saved, or the seed
 * copy where there is none, it is blank, or it could not be read (the
 * fallback-first rule in the module comment).
 */
export async function loadCourseEmailTemplate(templateId: CourseTemplateId): Promise<CourseEmailTemplate> {
  const defaults = courseTemplateDefaults[templateId];
  const db = getAdminDb();
  if (db) {
    try {
      const snap = await db.collection("courseEmailTemplates").doc(templateId).get();
      if (snap.exists) {
        const template = normalizeCourseTemplate(snap.id, snap.data() ?? {});
        if (template && template.subject && template.blocks.length > 0) {
          return { subject: template.subject, blocks: template.blocks, fromName: template.fromName };
        }
      }
    } catch (err) {
      console.warn("[courseApplicationEmails] template read failed", templateId, err);
    }
  }
  return { subject: defaults.subject, blocks: defaults.blocks };
}

/** Every piece of text a block prints, for the check below. */
function printedText(block: Block): string {
  if (block.type === "heading") return block.text;
  if (block.type === "richText") return block.html;
  if (block.type === "image") return `${block.alt}\n${block.caption ?? ""}`;
  if (block.type === "video") return block.caption ?? "";
  return "";
}

/** How a test's subject is marked: the way decision day marks one. */
export function courseTestSubject(subject: string): string {
  return `[TEST] ${subject}`;
}

function isComposed(
  opts: CourseApplicationEmailOptions | ComposedCourseEmailOptions,
): opts is ComposedCourseEmailOptions {
  return opts.kind === "allocated" || opts.kind === "facilitating";
}

export async function sendCourseApplicationEmail(
  opts: CourseApplicationEmailOptions | ComposedCourseEmailOptions,
): Promise<CourseEmailDelivery> {
  const written = isComposed(opts) ? asComposed(opts) : await filledFromTemplate(opts);
  const test = isComposed(opts) && opts.test === true;
  const subject = test ? courseTestSubject(written.subject) : written.subject;

  const result = await sendEmail({
    to: opts.to,
    subject,
    react: ApplicationEmail({
      subject,
      blocks: written.blocks,
      preheader: subject,
    }),
    fromName: written.fromName,
    kind: test ? "course-test" : "course-application",
    actorUid: opts.uid,
    referenceId: opts.runId,
  });
  if (result.delivered.length > 0) return "sent";
  return result.held.length > 0 ? "held" : "suppressed";
}

/**
 * The placement email or the facilitators' email, exactly as it was written
 * for this person.
 *
 * The composer's own promise is asked once more at the door: an email with a
 * token still in it is not sent. The caller's send fails, which leaves that
 * person untold, so a later publish reaches them.
 */
function asComposed(opts: ComposedCourseEmailOptions): CourseEmailTemplate {
  const { subject, blocks } = opts.composed;
  const left = unfilledTokens([subject, ...blocks.map(printedText)].join("\n"));
  if (left.length > 0) {
    const what = opts.kind === "facilitating" ? "facilitators' email" : "placement email";
    throw new Error(`${what} not sent: unfilled ${left.map((token) => `{${token}}`).join(", ")}`);
  }
  return { subject, blocks, fromName: opts.fromName };
}

/** One of the four application emails: its template, with this applicant's tokens filled. */
async function filledFromTemplate(opts: CourseApplicationEmailOptions): Promise<CourseEmailTemplate> {
  const templateId = TEMPLATE_FOR_KIND[opts.kind];
  const { subject, blocks, fromName } = await loadCourseEmailTemplate(templateId);

  const tokens: TokenValues = {
    ...buildCourseTokens({
      // `name` is already the resolved preferredName → displayName fallback at
      // the call site, so it feeds the token builder as the display name.
      user: { displayName: opts.name },
      courseTitle: opts.courseTitle,
      runLabel: opts.runLabel,
      startDate: opts.startDate ?? "",
    }),
  };
  // Leave {startDate} literal rather than substituting an empty string.
  if (!opts.startDate) delete tokens.startDate;

  return {
    subject: personaliseString(subject, tokens),
    blocks: personaliseBlocks(blocks, tokens),
    fromName,
  };
}
