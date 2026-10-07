import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { ApplicationFormFields, QuestionSetDoc } from "@/lib/applications/model";
import {
  normaliseApplication,
  normaliseFormFields,
  normaliseReview,
} from "@/lib/applications/normalise";
import { formRef, loadQuestionSets } from "@/lib/applications/repo";
import {
  APPLICATIONS_COLLECTION,
  normalizeAdmissionApplication,
} from "@/lib/firestore/admissionApplications";
import {
  normalizeAdmissionReview,
  type AdmissionReviewDoc,
} from "@/lib/firestore/admissionReviews";
import type { AdmissionRoundDoc } from "@/lib/firestore/admissionRounds";
import {
  MEMBER_RECORDS_COLLECTION,
  MEMBER_RECORD_APPLICATIONS,
  buildApplicationRecord,
  buildFormApplicationRecord,
  upsertApplicationRecord,
  type ApplicationRecordInput,
} from "@/lib/firestore/memberRecords";

/**
 * THE MEMBER RECORD, written from a round.
 *
 * The owner's rule above every other rule in the deletion work: a destroy
 * never deletes what the committee wants to remember about a person. What
 * they want to remember is not the round, it is the PERSON: when they
 * applied, what they applied for, what was decided, how they scored, and what
 * the reviewers wrote. That belongs on the person, so it lives at
 * `memberRecords/{uid}/applications/{roundId}` and outlives the round it came
 * from, the way the delivery log outlives the message it describes.
 *
 * This module is the one place that turns a round into those records. Two
 * callers, and they are the two moments the record can be owed:
 *
 *  - the STATUS route, when a round lands on `settled`. That is the moment
 *    the intake is finished and the scores stop moving, so it is the natural
 *    moment to copy them onto the people they are about. A failure there is a
 *    warning, never a refusal: refusing to settle a round because one member
 *    record could not be written would hold a whole intake hostage to one bad
 *    row, and the destroy below writes anything still missing anyway.
 *  - the DESTROY cascade, before it deletes anything at all. A failure there
 *    IS a refusal, because after the delete there is nothing left to write
 *    the record from.
 *
 * ## Idempotent by construction
 *
 * `upsertApplicationRecord` sets the document at a deterministic id
 * (`{uid}/applications/{roundId}`), so running this twice rewrites the same
 * documents with the same content and a fresh `writtenAt`. That is what lets
 * the destroy re-run it on a resume without a second copy of anybody's
 * record appearing, and what lets an admin settle, reopen and settle again
 * without the record splitting in two.
 *
 * ## A DESTROY FILLS GAPS. IT NEVER REWRITES AN ENTRY THAT IS ALREADY THERE
 *
 * This is the one place the two callers behave differently, and the difference
 * is a correctness rule rather than an optimisation.
 *
 * `upsertApplicationRecord` uses `set`, which REPLACES, and the reviewer notes
 * it writes are rebuilt from the reviews that exist at that moment. Account
 * deletion deletes a departed member's authored `admissionReviews` rows
 * (`accountDeletion.ts`), so those two facts compose into a way to lose
 * exactly what this collection exists to keep: a round settles and the entry
 * stores reviewer R's written assessment, R deletes their account, an admin
 * destroys the round, and a rewrite at that moment would replace the entry
 * with one that has never heard of R. The destroy would have deleted the
 * committee's reasoning that the settle had preserved.
 *
 * So `destroy` writes only the entries that are MISSING, which is also exactly
 * what the contract says it does (`docs/worksheets.md`, Deletion: "writes any
 * missing record entries FIRST"). `settle` still replaces, because a settle IS
 * the authoritative snapshot of a finished intake and the reviews it reads are
 * the live ones; and `backfill` still replaces, because a tool run over old
 * rounds is being asked to restate them.
 *
 * The cost of gap-filling is that a decision moved after the round settled is
 * not refreshed onto the entry by the destroy. That is the smaller loss: a
 * stale outcome is a summary a reader can still check against the runs, and a
 * missing note is gone for good. Merging the two entries was considered and
 * rejected for the reason `upsertApplicationRecord` states in its own comment:
 * a merge cannot remove a field, so it would keep a note under a reviewer who
 * withdrew their assessment, and the score summary would then count reviewers
 * whose criterion scores it could not read.
 *
 * If the check for "is there already an entry" cannot be READ, the application
 * is reported as failed rather than rewritten. That direction is deliberate
 * too: a failure makes the destroy refuse and it can be retried, whereas a
 * rewrite made in ignorance is not retractable.
 *
 * ## Drafts are recorded, and recorded AS drafts
 *
 * Every application on the round is written, including one still in draft
 * when the round settled or was destroyed. The record's job is to answer "has
 * this person come to us before, and what happened", and "they started an
 * application and never sent it" is an answer to that question rather than an
 * absence of one. The status is copied as it stands, so nothing here has to
 * decide what a half-written application means.
 *
 * ## An application made on an application form
 *
 * A round that is an application form (`src/lib/applications/`) holds a
 * different kind of application, and the entry it owes is built by
 * `buildFormApplicationRecord` from that system's own readers: the ranking,
 * the published outcome, and review rows whose scores are keyed by question
 * rather than by criterion.
 *
 * WHICH BUILDER RUNS IS DECIDED PER APPLICATION, by the document itself
 * (`normaliseApplication` answers null for anything that is not one of these),
 * so a round is never guessed at and an older round takes exactly the path it
 * always took, with exactly the reads it always made. The form and its
 * question sets are read once, the first time such an application turns up.
 *
 * THE REVIEW ROWS ARE READ TWICE OVER, on purpose. Both kinds of round share
 * `admissionReviews`, and the older reader keeps at most ten scores per row,
 * which is right for a round with ten criteria and wrong for a reviewer who
 * scored a dozen answers across two programmes. So each row is kept as it was
 * stored and the form path reads it through `normaliseReview`, which keeps
 * every score. Reading a form's rows through the older reader would write a
 * mean taken over whichever ten keys happened to come first.
 *
 * If the form or its question sets cannot be read, every application that
 * needed them is reported as failed, never written from half the facts: a
 * destroy then refuses and can be run again, and a settle warns.
 *
 * ## One failure does not stop the others
 *
 * Each application is written inside its own try/catch and a failure becomes
 * an entry in `failed` rather than a throw. A round is one write per
 * applicant; letting the twelfth stop the remaining forty would turn one bad
 * row into a round with no record at all, which is the opposite of the point.
 * The caller decides what a non-empty `failed` list means, and the two
 * callers decide differently on purpose.
 */

/**
 * `admissionReviews` as a literal, the way `accountDeletion.ts` writes it.
 * The collection's module exports its id builder and its normaliser but no
 * name constant, and adding one is a change to a file this work does not own.
 */
const REVIEWS_COLLECTION = "admissionReviews";

/**
 * Applications fetched per `getAll`. One RPC per chunk, and each document
 * carries a whole application form, so the chunk is the memory ceiling as
 * much as the request size.
 */
const APPLICATION_CHUNK = 100;

/** Uids per addressed name read. Well inside `getAll`'s own limits. */
const NAME_CHUNK = 200;

/**
 * Preferred name, then account name, then a neutral placeholder. NEVER an
 * email: the record is read by admins and SU-recognised committee and quotes
 * reviewers by name, and a reviewer whose display name is missing must not be
 * recorded as an address. Mirrors `displayNameOf` in the worksheet and course
 * route trees; the repo carries one copy per tree by convention.
 */
function displayNameOf(data: Record<string, unknown>): string {
  const profile = (data.profile as Record<string, unknown> | undefined) ?? {};
  const preferred = profile.preferredName;
  const display = data.displayName;
  return (
    (typeof preferred === "string" && preferred.trim()) ||
    (typeof display === "string" && display.trim()) ||
    "NAISI member"
  );
}

export type MemberRecordSyncResult = {
  /** Records written on this call. A rewrite counts, because it was written. */
  written: number;
  /**
   * Applications a `destroy` sweep found already recorded and deliberately left
   * alone. Zero for `settle` and `backfill`, which replace what they find.
   *
   * It is reported rather than folded into `written` because the two numbers
   * answer different questions, and the destroy's audit row keeps both: "how
   * many people did this destroy have to record" and "how many were already
   * safe". A destroy of a settled round is the normal case and it writes
   * nothing, which without this number would read as a sweep that did not run.
   */
  alreadyPresent: number;
  /**
   * One entry per application whose record could not be written.
   *
   * `name` is the applicant's denormalised display name off the application,
   * never an email: the destroy route returns this list to the admin who was
   * refused, and a list of uids tells them nothing they can act on.
   */
  failed: { uid: string; name: string; message: string }[];
};

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * One stored review row: what Firestore held, and the older round's reading
 * of it. The form path reads `data` again through its own normaliser; see the
 * module comment for why one reading cannot serve both.
 */
type ReviewRow = {
  id: string;
  data: Record<string, unknown>;
  review: AdmissionReviewDoc;
};

/**
 * Every review on this round, grouped by the applicant it is about.
 *
 * ONE query for the whole round rather than one per applicant. It is a single
 * equality on `roundId`, so it is served by the automatic single-field index
 * and needs nothing declared; a per-applicant loop would be the same rows
 * read in fifty round trips. A review document is a score map, a
 * recommendation and up to 4000 characters of notes, so a round of three
 * hundred applicants with three reviewers each is a low single-digit number of
 * megabytes, which is the same order as the applications themselves.
 */
async function reviewsByApplicant(
  db: Firestore,
  roundId: string,
): Promise<Map<string, ReviewRow[]>> {
  const snap = await db
    .collection(REVIEWS_COLLECTION)
    .where("roundId", "==", roundId)
    .get();
  const byApplicant = new Map<string, ReviewRow[]>();
  for (const doc of snap.docs) {
    const data = doc.data() ?? {};
    const review = normalizeAdmissionReview(doc.id, data);
    if (!review.applicantUid) continue;
    const row: ReviewRow = { id: doc.id, data, review };
    const list = byApplicant.get(review.applicantUid);
    if (list) list.push(row);
    else byApplicant.set(review.applicantUid, [row]);
  }
  return byApplicant;
}

/**
 * Display names for every reviewer who wrote one of those reviews.
 *
 * A reviewer whose account has since been deleted keeps their notes on the
 * record and loses only their name: the entry reads "NAISI member" rather
 * than being dropped. Losing the note would be losing the committee's
 * reasoning because the person who wrote it left, which is precisely the
 * thing this record exists to prevent.
 */
async function reviewerNamesFor(
  db: Firestore,
  reviews: Map<string, ReviewRow[]>,
): Promise<Record<string, string>> {
  const uids = new Set<string>();
  for (const list of reviews.values()) {
    for (const { review } of list) if (review.reviewerUid) uids.add(review.reviewerUid);
  }
  const names: Record<string, string> = {};
  for (const batch of chunk([...uids], NAME_CHUNK)) {
    const docs = await db.getAll(...batch.map((uid) => db.collection("users").doc(uid)));
    for (const doc of docs) {
      if (doc.exists) names[doc.id] = displayNameOf(doc.data() ?? {});
    }
  }
  return names;
}

/**
 * The applicant's own name, for a failure report. The application carries a
 * denormalised `displayName` so a review list can render without a `users`
 * read, and that is the copy this uses: never an email, and never a uid
 * dressed up as a name.
 */
function applicantNameOf(raw: Record<string, unknown>): string {
  const name = raw.displayName;
  return (typeof name === "string" && name.trim()) || "an applicant";
}

/** What the form path needs from the round it is on. Read once per sweep. */
type FormContext = {
  form: ApplicationFormFields;
  sets: QuestionSetDoc[];
};

/**
 * One application, normalised and turned into the entry it owes, or the reason
 * it could not be. Built for the whole chunk BEFORE anything is written, so the
 * "is there already an entry" question can be asked in one round trip.
 */
type PendingRecord =
  | { ok: true; uid: string; name: string; record: ApplicationRecordInput }
  | { ok: false; uid: string; name: string; message: string };

/**
 * Write the member-record entry for every application on this round.
 *
 * The application ids are read FIRST with a projection (`.select()`), so the
 * list of who applied costs one small query and the forms themselves are
 * fetched a chunk at a time. That is what keeps a three-hundred-applicant
 * round from being one enormous read, and it is why there is no cursor to
 * persist: the id list is the cursor.
 *
 * `writtenBy` and `writtenByUid` are stamped onto every entry, so the record
 * says whether it was written when the round settled, by a destroy, or by a
 * backfill, and by whom. `writtenBy` ALSO decides whether an entry that
 * already exists is replaced or left alone: see the module comment, because
 * that difference is the one thing in this file that can lose data.
 */
export async function writeRecordsForRound(
  db: Firestore,
  round: AdmissionRoundDoc,
  writtenBy: "settle" | "destroy" | "backfill",
  actorUid: string,
): Promise<MemberRecordSyncResult> {
  const idSnap = await db
    .collection(APPLICATIONS_COLLECTION)
    .where("roundId", "==", round.id)
    .select()
    .get();
  const ids = idSnap.docs.map((doc) => doc.id);
  if (ids.length === 0) return { written: 0, alreadyPresent: 0, failed: [] };

  // A destroy fills gaps; a settle and a backfill restate. See the module
  // comment: this single boolean is the whole difference, and it is what stops
  // a destroy replacing a settled entry with one that has lost a departed
  // reviewer's notes.
  const fillGapsOnly = writtenBy === "destroy";

  const reviews = await reviewsByApplicant(db, round.id);
  const reviewerNames = await reviewerNamesFor(db, reviews);

  /**
   * The form's programmes and its question sets, read ONCE and only when an
   * application made on an application form turns up. A round with none never
   * makes these two reads, so it behaves exactly as it did before forms
   * existed.
   *
   * The promise is kept whether it resolved or rejected: a form that could
   * not be read fails every application that needed it with the same sentence,
   * instead of being asked for again once per applicant.
   */
  let formRead: Promise<FormContext> | null = null;
  const formContext = (): Promise<FormContext> => {
    formRead ??= (async () => {
      try {
        const snap = await formRef(db, round.id).get();
        return {
          form: normaliseFormFields(snap.data() ?? {}),
          sets: await loadQuestionSets(db, round.id),
        };
      } catch (err) {
        console.error("[memberRecordSync] could not read the form for round", round.id, err);
        throw new Error(
          "the application form could not be read, so what they applied for could not be named",
        );
      }
    })();
    return formRead;
  };

  let written = 0;
  let alreadyPresent = 0;
  const failed: { uid: string; name: string; message: string }[] = [];

  for (const batch of chunk(ids, APPLICATION_CHUNK)) {
    const docs = await db.getAll(
      ...batch.map((id) => db.collection(APPLICATIONS_COLLECTION).doc(id)),
    );

    const pending: PendingRecord[] = [];
    for (const doc of docs) {
      // A row deleted between the id read and this fetch is not a failure:
      // there is no application left to record, and the account cascade that
      // took it away is entitled to.
      if (!doc.exists) continue;
      const raw = doc.data() ?? {};
      // Kept outside the try so a failure can still name who it was about.
      let uid = "";
      let name = "";
      try {
        let record: ApplicationRecordInput;
        // Null for anything that is not an application made on an application
        // form, which is what sends an older round down the path it always took.
        const onForm = normaliseApplication(doc.id, raw, round.availabilityGrid);
        if (onForm) {
          uid = onForm.uid;
          name = onForm.displayName;
          if (!uid) throw new Error("this application has no applicant on it");
          const { form, sets } = await formContext();
          record = buildFormApplicationRecord({
            round,
            form,
            sets,
            application: onForm,
            reviews: (reviews.get(uid) ?? []).map((row) => normaliseReview(row.id, row.data)),
            reviewerNames,
            writtenBy,
            writtenByUid: actorUid,
          });
        } else {
          const application = normalizeAdmissionApplication(
            doc.id,
            raw,
            round.availabilityGrid,
          );
          uid = application.uid;
          name = application.displayName;
          // An application with no uid is a row nothing can hang a record off.
          // It is reported rather than skipped: the whole promise of this pass
          // is that every applicant on the round ends up with an entry, so a
          // row that cannot have one is exactly what the caller needs told.
          if (!uid) throw new Error("this application has no applicant on it");
          record = buildApplicationRecord({
            round,
            application,
            reviews: (reviews.get(uid) ?? []).map((row) => row.review),
            reviewerNames,
            writtenBy,
            writtenByUid: actorUid,
          });
        }
        pending.push({ ok: true, uid, name: name || applicantNameOf(raw), record });
      } catch (err) {
        pending.push({
          ok: false,
          uid: uid || doc.id,
          name: name || applicantNameOf(raw),
          message: err instanceof Error ? err.message : "the record could not be built",
        });
      }
    }

    const writable = pending.filter((entry): entry is Extract<PendingRecord, { ok: true }> =>
      entry.ok,
    );

    /**
     * Which of this chunk's applicants already has an entry for this round.
     *
     * ONE `getAll` for the chunk rather than a `get` per applicant, and it is
     * index-aligned with `writable` because `getAll` returns documents in the
     * order they were asked for. `null` means the read itself failed, and the
     * caller is then told about every applicant in the chunk rather than
     * having their entries rewritten in ignorance of what was there.
     */
    let recorded: Set<string> | null = null;
    if (fillGapsOnly && writable.length > 0) {
      try {
        const snaps = await db.getAll(
          ...writable.map((entry) =>
            db
              .collection(MEMBER_RECORDS_COLLECTION)
              .doc(entry.uid)
              .collection(MEMBER_RECORD_APPLICATIONS)
              .doc(round.id),
          ),
        );
        recorded = new Set(
          writable.filter((_, index) => snaps[index]?.exists === true).map((e) => e.uid),
        );
      } catch (err) {
        console.error(
          "[memberRecordSync] could not read the existing entries for round",
          round.id,
          err,
        );
        recorded = null;
      }
    }
    const readFailed = fillGapsOnly && writable.length > 0 && recorded === null;

    for (const entry of pending) {
      if (!entry.ok) {
        failed.push({ uid: entry.uid, name: entry.name, message: entry.message });
        continue;
      }
      if (readFailed) {
        failed.push({
          uid: entry.uid,
          name: entry.name,
          message:
            "the entry already on file could not be read, so it was left alone rather than overwritten",
        });
        continue;
      }
      if (recorded?.has(entry.uid)) {
        alreadyPresent += 1;
        continue;
      }
      try {
        await upsertApplicationRecord(db, entry.uid, entry.record);
        written += 1;
      } catch (err) {
        failed.push({
          uid: entry.uid,
          name: entry.name,
          message: err instanceof Error ? err.message : "the record could not be written",
        });
      }
    }
  }

  return { written, alreadyPresent, failed };
}
