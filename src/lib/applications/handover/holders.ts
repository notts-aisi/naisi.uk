import type { CourseApplicationDoc } from "@/lib/firestore/courseApplications";
import { hasBeenTold, holdingOf, isInTerm } from "../decisions";
import type { ApplicationDoc, DecisionDoc } from "../model";
import type { ApplicationForm } from "../normalise";
import { applicantName } from "../review/people";
import { rankedProgrammes } from "../sections";

/**
 * WHO IS HANDED OVER, AND HOW THE RUN'S LIST COMPARES WITH THAT.
 *
 * Two questions, both answered from documents somebody else has already read:
 *
 *  - `placeHoldersOn`: who holds a place on this programme now. It is
 *    `holdingOf()` (`../decisions.ts`) and nothing else, asked of the people
 *    who are in the term, so the hand-over, the panel beside it and the
 *    allocation board cannot disagree with the rest of the system about a
 *    place. Somebody who gave their place back holds none. Somebody invited
 *    holds one from the moment they accept, and not before.
 *  - `compareWithRun`: where each of those people stands on the run's own
 *    list, and who is on that list without holding a place any more.
 *
 * A PERSON IS HANDED OVER ONLY ONCE THEY HAVE BEEN TOLD (`hasBeenTold`). A
 * row on a run is its owner's to read under that collection's own rule, and
 * being put in a group shows somebody the run, so neither may come before
 * decision day has reached them.
 *
 * Pure, with no server import, so the writer, the panel and a test all ask
 * the same functions of the same shapes.
 */

type Sent = Pick<
  ApplicationDoc,
  "uid" | "displayName" | "sent" | "status" | "result" | "invitation" | "attendance"
>;

export type PlaceHolder = {
  uid: string;
  /** Their name as the committee's own screens read it. */
  name: string;
};

const byName = (a: PlaceHolder, b: PlaceHolder) =>
  a.name.localeCompare(b.name, "en") || a.uid.localeCompare(b.uid);

/** The name the review list shows for this person, by the same function. */
export function nameOnRecord(application: Pick<ApplicationDoc, "displayName" | "sent">): string {
  return applicantName(
    { preferredName: application.sent?.aboutYou.preferredName ?? "" },
    application.displayName,
  );
}

/**
 * Does this person hold a place on `programmeId` right now, having been told
 * so? The one test, for one person. `decision` is their decision document,
 * or null when there is none.
 */
export function holdsPlaceOn(
  form: ApplicationForm,
  programmeId: string,
  application: Sent,
  decision: DecisionDoc | null,
): boolean {
  if (!application.sent || !isInTerm(application) || !hasBeenTold(application)) return false;
  const ranked = rankedProgrammes(form, application.sent).map((programme) => programme.id);
  const holding = holdingOf(
    { uid: application.uid, ranked, decision, application },
    new Set(form.programmeIds),
  );
  return holding.places.includes(programmeId);
}

/** Everybody who holds a place on this programme now and has been told, by name. */
export function placeHoldersOn(
  form: ApplicationForm,
  programmeId: string,
  applications: readonly Sent[],
  decisions: ReadonlyMap<string, DecisionDoc>,
): PlaceHolder[] {
  const holders: PlaceHolder[] = [];
  for (const application of applications) {
    // Counted from the people in the term, like every other count of places.
    if (!isInTerm(application)) continue;
    if (!holdsPlaceOn(form, programmeId, application, decisions.get(application.uid) ?? null)) {
      continue;
    }
    holders.push({ uid: application.uid, name: nameOnRecord(application) });
  }
  return holders.sort(byName);
}

/** The fields of a run's row this comparison reads. */
type Row = Pick<CourseApplicationDoc, "uid" | "status" | "fromForm" | "displayName">;

export type RunComparison = {
  /** Hold a place and have no row on the run: a press hands them over. */
  toHandOver: PlaceHolder[];
  /** Hold a place and are on the run's list, accepted. */
  onTheList: PlaceHolder[];
  /**
   * Hold a place, and their row on the run says something other than
   * accepted. The hand-over never changes a row, so this is for a person to
   * put right on the run's own applications list.
   */
  notAccepted: PlaceHolder[];
  /**
   * On the run's list, put there from this programme, and no longer holding
   * a place: they gave it back after they were handed over. Nothing removes
   * them, so they are named for an admin to act on.
   */
  gaveBack: PlaceHolder[];
  /** Rows on the run that this programme's hand-over did not write. */
  otherRows: number;
};

/**
 * Compare who holds a place with the run's own list. `names` is every name
 * the caller could find by uid (the applications it read), for somebody who
 * is on the list and no longer among the holders.
 */
export function compareWithRun(input: {
  holders: readonly PlaceHolder[];
  rows: readonly Row[];
  roundId: string;
  programmeId: string;
  names: ReadonlyMap<string, string>;
}): RunComparison {
  const rowByUid = new Map(input.rows.map((row) => [row.uid, row] as const));
  const holding = new Set(input.holders.map((holder) => holder.uid));
  const out: RunComparison = { toHandOver: [], onTheList: [], notAccepted: [], gaveBack: [], otherRows: 0 };
  for (const holder of input.holders) {
    const row = rowByUid.get(holder.uid);
    if (!row) out.toHandOver.push(holder);
    else if (row.status === "accepted") out.onTheList.push(holder);
    else out.notAccepted.push(holder);
  }
  for (const row of input.rows) {
    const fromHere =
      row.fromForm?.roundId === input.roundId && row.fromForm.programmeId === input.programmeId;
    if (!fromHere) {
      // A holder's own row is already counted above, wherever it came from.
      if (!holding.has(row.uid)) out.otherRows += 1;
      continue;
    }
    if (holding.has(row.uid) || row.status !== "accepted") continue;
    out.gaveBack.push({
      uid: row.uid,
      name: input.names.get(row.uid) ?? (row.displayName.trim() || "Somebody whose application has gone"),
    });
  }
  out.gaveBack.sort(byName);
  return out;
}
