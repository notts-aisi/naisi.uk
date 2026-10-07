import "server-only";
import { NextResponse } from "next/server";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { AdmissionApplicationStatus } from "@/lib/firestore/admissionApplications";
import { FORM_VERSION, type AboutYou, type ApplicationContent, type QuestionSetDoc } from "../model";
import { isId, normaliseApplication, type ApplicationForm } from "../normalise";
import { applicationRef, formRef, loadForm, loadOwnApplication, loadQuestionSets } from "../repo";
import { orderedSets } from "../sections";
import { contentForSend, issuesFor, type Issue } from "../validate";
import { aboutYouFromAccount } from "./account";
import { cleanContent, openProgrammeIds } from "./draft";
import {
  projectApplicationForOwner,
  projectFormForApplicant,
  projectQuestionSetForApplicant,
} from "./project";
import type { ApplicantForm, ApplicantView } from "./types";
import { isFormVisible } from "./window";

/**
 * Reading and writing ONE PERSON'S OWN APPLICATION.
 *
 * Everything here is addressed by the caller's own uid, which the routes take
 * from the session and never from the request, so there is no id a caller can
 * change to reach somebody else's document. It reads through `../repo.ts`,
 * the applicant-safe half of the data layer, and names neither the reviews
 * nor the decisions.
 *
 * ## Two copies, two writers
 *
 * `saveDraft` writes `draft` and nothing else: it is what the form calls as
 * somebody types. `sendApplication` is the only writer of `sent`. It takes NO
 * content from the request. It reads the draft that is stored, holds it to
 * the form with `issuesFor`, and copies `contentForSend(...)` into `sent`, so
 * what a reviewer reads is exactly what the applicant last saw the site say
 * it had saved. Two writers of `sent` with two validation contracts would
 * make the version that reached a reviewer depend on which request landed
 * second.
 *
 * After a send the applicant can go on changing their answers until the
 * close. Those changes are saved to `draft`; `sent` moves only when they
 * press Send again.
 *
 * ## Counters move with the status
 *
 * The first save creates the document as a draft and the first send makes it
 * submitted. Each of those moves the round's `applicationCounts` in the same
 * transaction as the status, so the count the committee reads cannot drift
 * from the documents it counts. A later save or send changes no status and
 * moves no counter.
 */

/** An error carrying the sentence and the status a route should answer with. */
export class ApplicantError extends Error {
  status: number;
  extra: Record<string, unknown>;

  constructor(message: string, status: number, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApplicantError";
    this.status = status;
    this.extra = extra;
  }

  toResponse(): NextResponse {
    return NextResponse.json({ error: this.message, ...this.extra }, { status: this.status });
  }
}

/** What a missing form, a draft form and an archived form all answer with. */
export const FORM_NOT_FOUND = "Form not found.";

export type LoadedForm = { form: ApplicationForm; sets: QuestionSetDoc[] };

/**
 * The form and its question sets in asked order, or null.
 *
 * Null covers a round that does not exist, a round that is not an application
 * form, and a form that is still a draft or has been archived. An applicant
 * is told the same thing about all of them.
 */
export async function loadVisibleForm(
  db: Firestore,
  roundId: string,
  now: Date,
): Promise<LoadedForm | null> {
  if (!isId(roundId)) return null;
  const form = await loadForm(db, roundId);
  if (!form || !isFormVisible(form, now)) return null;
  const sets = await loadQuestionSets(db, roundId);
  return { form, sets: orderedSets(form, sets) };
}

/**
 * What the form's page needs for its title: the form's name and whether it is
 * open. Null exactly when `loadVisibleForm` is null, so a form that is still a
 * draft or has been archived has no title of its own, the same as a round
 * that is not there.
 *
 * Read through the applicant's projection, so a title can only ever carry what
 * an applicant is shown on the page under it.
 */
export async function loadFormTitle(
  db: Firestore,
  roundId: string,
  now: Date,
): Promise<Pick<ApplicantForm, "label" | "windowState"> | null> {
  const loaded = await loadVisibleForm(db, roundId, now);
  if (!loaded) return null;
  const form = projectFormForApplicant(loaded.form, now);
  return { label: form.label, windowState: form.windowState };
}

export type Account = {
  /** The About you answers the account's profile holds. */
  about: AboutYou;
};

/** The caller's own account, read for the answers the form opens with. */
export async function loadAccount(db: Firestore, uid: string): Promise<Account> {
  const snap = await db.collection("users").doc(uid).get();
  return { about: aboutYouFromAccount(snap.exists ? snap.data() : null) };
}

/**
 * Everything the form needs to open, for the page's first render. The GET
 * route answers with the same four projections.
 */
export async function loadApplicantView(
  db: Firestore,
  roundId: string,
  uid: string,
  now: Date,
): Promise<ApplicantView | null> {
  const loaded = await loadVisibleForm(db, roundId, now);
  if (!loaded) return null;
  const [application, account] = await Promise.all([
    loadOwnApplication(db, loaded.form, uid),
    loadAccount(db, uid),
  ]);
  return {
    form: projectFormForApplicant(loaded.form, now),
    sets: loaded.sets.map(projectQuestionSetForApplicant),
    application: application ? projectApplicationForOwner(application) : null,
    account: account.about,
  };
}

/** The statuses an applicant's own writes are allowed to act on. */
function assertStillTheirs(status: AdmissionApplicationStatus): void {
  if (status === "draft" || status === "submitted") return;
  throw new ApplicantError(
    status === "withdrawn"
      ? "This application was withdrawn, so it cannot be changed here. Email ai-safety@uonsu.com and we will sort it out."
      : "This application has already been decided, so it cannot be changed.",
    409,
  );
}

const NOT_READY = "Your application is not ready to send yet.";

const OLDER_FORM =
  "Your application to this round was started on an older form, so it cannot be changed here. Email ai-safety@uonsu.com and we will sort it out.";

export type Caller = {
  uid: string;
  /** From the session. Never from the request. */
  email: string | null;
  displayName: string;
};

/**
 * Save the draft, creating the application on the first save.
 *
 * `tx.create` at the deterministic id IS the one-application-per-person rule:
 * a second tab racing the first cannot make a second document. `pausedMessage`
 * is the site-wide pause, which stops a NEW application starting and leaves
 * an existing one saveable, because stranding somebody mid-sentence helps
 * nobody.
 */
export async function saveDraft(
  db: Firestore,
  form: ApplicationForm,
  caller: Caller,
  draft: ApplicationContent,
  pausedMessage: string | null,
): Promise<"created" | "saved"> {
  const roundId = form.round.id;
  const appRef = applicationRef(db, roundId, caller.uid);
  const roundRef = formRef(db, roundId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(appRef);
    if (!snap.exists) {
      if (pausedMessage) throw new ApplicantError(pausedMessage, 503);
      tx.create(appRef, {
        formVersion: FORM_VERSION,
        roundId,
        uid: caller.uid,
        email: caller.email,
        displayName: caller.displayName,
        draft,
        sent: null,
        status: "draft" satisfies AdmissionApplicationStatus,
        submittedAt: null,
        sentAt: null,
        withdrawnAt: null,
        result: null,
        invitation: null,
        attendance: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(roundRef, {
        "applicationCounts.draft": FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "created" as const;
    }
    // The document AS OF THIS TRANSACTION, so a save that was in flight when
    // decision day published cannot write over a decided application.
    const application = normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid);
    if (!application) throw new ApplicantError(OLDER_FORM, 409);
    assertStillTheirs(application.status);
    tx.update(appRef, { draft, updatedAt: FieldValue.serverTimestamp() });
    return "saved" as const;
  });
}

/** One thing that stops a send, as the route reports it. */
export type SendIssue = Pick<Issue, "step" | "questionId" | "message">;

/**
 * Send the application: hold the STORED draft to the form and, when nothing
 * is wrong with it, make it the application of record.
 *
 * `account` is the caller's own About you from their profile, read by the
 * route. The university email on the application is the account's at the
 * moment of sending, whatever the draft held.
 */
export async function sendApplication(
  db: Firestore,
  loaded: LoadedForm,
  caller: Caller,
  account: AboutYou,
): Promise<"sent" | "sent-again"> {
  const { form, sets } = loaded;
  const roundId = form.round.id;
  const appRef = applicationRef(db, roundId, caller.uid);
  const roundRef = formRef(db, roundId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(appRef);
    if (!snap.exists) {
      throw new ApplicantError("There is no application to send yet. Fill in the form first.", 404);
    }
    const application = normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid);
    if (!application) throw new ApplicantError(OLDER_FORM, 409);
    assertStillTheirs(application.status);

    // The stored draft, cleaned the way a save cleans one, so that what is
    // held to the form is only ever what the form could have asked for,
    // whoever or whatever wrote the document.
    const draft: ApplicationContent = cleanContent(application.draft, form, sets, account, "on-form");
    const issues = issuesFor(form, sets, draft);
    if (issues.length > 0) {
      const reported: SendIssue[] = issues.map((issue) => ({
        step: issue.step,
        questionId: issue.questionId,
        message: issue.message,
      }));
      throw new ApplicantError(NOT_READY, 400, { issues: reported });
    }

    const sent = contentForSend(form, sets, draft);
    // Every programme in the order of record is one this form is taking
    // applications for, checked against the form's own list of them.
    const open = openProgrammeIds(form);
    if (sent.rankedProgrammeIds.length === 0 || !sent.rankedProgrammeIds.every((id) => open.includes(id))) {
      const reported: SendIssue[] = [
        { step: "choose", questionId: null, message: "Tick at least one programme that is taking applications." },
      ];
      throw new ApplicantError(NOT_READY, 400, { issues: reported });
    }

    const first = application.status === "draft";
    const update: Record<string, unknown> = {
      draft,
      sent,
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (first) update.status = "submitted" satisfies AdmissionApplicationStatus;
    // The FIRST time they pressed Send, kept across every later send.
    if (!application.submittedAt) update.submittedAt = FieldValue.serverTimestamp();
    tx.update(appRef, update);
    if (first) {
      tx.update(roundRef, {
        "applicationCounts.draft": FieldValue.increment(-1),
        "applicationCounts.submitted": FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return first ? ("sent" as const) : ("sent-again" as const);
  });
}
