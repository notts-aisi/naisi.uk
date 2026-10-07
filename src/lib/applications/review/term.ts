import type { ProgrammeRole } from "../access";
import {
  freePlaces,
  isInTerm,
  joinedByInvitation,
  tallyTerm,
  type Applicant,
  type TermTally,
} from "../decisions";
import { own } from "../keys";
import type { ApplicationDoc, DecisionDoc, ReviewDoc } from "../model";
import type { ApplicationForm } from "../normalise";
import { rankedProgrammes } from "../sections";

/**
 * THE TERM AS ONE CALLER MAY SEE IT.
 *
 * Both review screens start from the same picture: every sent application but
 * the caller's own, each with its ranking as the form knows it, and the
 * arithmetic of the whole term worked out from them. The list reads a
 * programme's rows off it and the review screen reads one application and its
 * place in the queue, so the two cannot disagree about a count.
 *
 * A caller's OWN application is left out before anything is counted. Somebody
 * who leads a programme and also applied to one must not learn what was
 * decided about them from a tally, any more than from a row.
 *
 * SOMEBODY WHO HAS LEFT THE TERM IS LISTED AND NOT COUNTED. An application
 * withdrawn after it was sent (which is also what giving a place or an
 * invitation back does) stays in `applications`, so the list can show its row
 * marked as withdrawn and the review screen can still open it. It is handed
 * to the arithmetic by nobody: `tally` is of the people `isInTerm` admits,
 * the same people the pooled applicants and decision-day screens count, so a
 * place given back is free here in the same moment it is free there.
 *
 * SOMEBODY WHO ACCEPTED AN INVITATION IS ON THAT PROGRAMME'S LIST, though
 * they did not rank it: `joined` names the programme, and the list and the
 * review screen treat it as theirs from the moment they accept
 * (`joinedByInvitation`). Before that the programme's staff are shown only
 * the number of places kept for invitations.
 *
 * Pure, with no server import.
 */

/** Who is asking, reduced to what the builders need. */
export type Viewer = {
  uid: string;
  name: string;
  isAdmin: boolean;
  /** The caller's role on each programme they have one on, from `programmeRolesFor`. */
  roles: Readonly<Record<string, ProgrammeRole>>;
};

export type TermPicture = {
  /**
   * Sent applications the caller may be shown, withdrawn ones included. Ask
   * `isInTerm` of one before counting it.
   */
  applications: ApplicationDoc[];
  /** Each applicant's ranking, as the form knows it. */
  ranked: Map<string, string[]>;
  /**
   * The programme each applicant joined by accepting an invitation, for those
   * who did. Always a programme on the form that they did not rank.
   */
  joined: Map<string, string>;
  decisions: ReadonlyMap<string, DecisionDoc>;
  /** Every reviewer's row, by applicant. */
  reviews: Map<string, ReviewDoc[]>;
  /** The arithmetic of the people in the term. A withdrawn application is not in it. */
  tally: TermTally;
};

export function termPictureFor(input: {
  form: ApplicationForm;
  applications: readonly ApplicationDoc[];
  decisions: ReadonlyMap<string, DecisionDoc>;
  reviews: readonly ReviewDoc[];
  viewerUid: string;
}): TermPicture {
  const { form, decisions, viewerUid } = input;
  const applications = input.applications.filter(
    (application) => application.sent !== null && application.uid !== viewerUid,
  );
  const ranked = new Map<string, string[]>();
  const joined = new Map<string, string>();
  const applicants: Applicant[] = [];
  for (const application of applications) {
    const order = application.sent
      ? rankedProgrammes(form, application.sent).map((programme) => programme.id)
      : [];
    ranked.set(application.uid, order);
    const invitedTo = joinedByInvitation(application);
    if (invitedTo !== null && own(form.programmes, invitedTo) && !order.includes(invitedTo)) {
      joined.set(application.uid, invitedTo);
    }
    // Listed, and not counted: see the note at the top.
    if (!isInTerm(application)) continue;
    applicants.push({
      uid: application.uid,
      ranked: order,
      decision: decisions.get(application.uid) ?? null,
      // With the application, so a place taken or given up by a reply is counted.
      application,
    });
  }
  const reviews = new Map<string, ReviewDoc[]>();
  for (const review of input.reviews) {
    if (review.applicantUid === viewerUid) continue;
    const rows = reviews.get(review.applicantUid);
    if (rows) rows.push(review);
    else reviews.set(review.applicantUid, [review]);
  }
  return { applications, ranked, joined, decisions, reviews, tally: tallyTerm(form, applicants) };
}

/**
 * The programmes whose list this applicant is on, in order: the ones they
 * ranked, then the one they joined by accepting an invitation.
 */
export function listedOn(term: TermPicture, uid: string): string[] {
  const order = term.ranked.get(uid) ?? [];
  const invitedTo = term.joined.get(uid);
  return invitedTo === undefined ? order : [...order, invitedTo];
}

/** Places a programme still has, from the term's own tally. */
export function placesLeftOn(form: ApplicationForm, term: TermPicture, programmeId: string): number | null {
  return freePlaces(form, term.tally, programmeId);
}

/**
 * The order both screens walk applications in: newest first, then by name so
 * that people who applied in the same minute keep one order between reads.
 */
export function newestFirst(
  a: { appliedAt: string | null; name: string; uid: string },
  b: { appliedAt: string | null; name: string; uid: string },
): number {
  return (
    (b.appliedAt ?? "").localeCompare(a.appliedAt ?? "") ||
    a.name.localeCompare(b.name) ||
    a.uid.localeCompare(b.uid)
  );
}
