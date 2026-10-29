import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { markedRanges, type MarkedRange } from "@/lib/admissions/availability";
import { loadTerm } from "@/lib/applications/decisionDay/term";
import { paintedWeekOf, type PaintedWeek } from "@/lib/applications/handover/paintedWeek";
import type { ApplicationDoc, ProgrammeSettings, QuestionSetDoc } from "@/lib/applications/model";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { applicantDetail, applicantFirstName, applicantName } from "@/lib/applications/review/people";
import { standingOf, type Standing } from "@/lib/applications/status/standing";
import { answersFor, hasPlaceOn, wouldFacilitate } from "./rules";

/**
 * THE PEOPLE WHO WOULD LIKE TO FACILITATE A PROGRAMME, read for whoever is
 * looking: everybody who sent an application this term, said yes to
 * facilitating, and chose this programme or "Either" (`wouldFacilitate`),
 * from the term as the viewer may see it (`loadTerm`), so the viewer's own
 * application is in no list. Somebody who has given a place back since
 * decision day is still somebody who might facilitate, and is read too.
 *
 * WHAT IS KEPT OF EACH is what the board draws and nothing more: their name,
 * the line under it (degree and stage, as every committee screen writes it),
 * their answers to the form's facilitator questions, where decision day left
 * them, and their account's role. No address: an ask's writer reads the one
 * address it sends to, by itself, when it sends.
 *
 * Staff only: it reaches the term's decisions through `loadTerm`. Nothing
 * that serves the person asked may import it.
 */

export type FacilitatorPerson = {
  uid: string;
  name: string;
  firstName: string;
  /** "BA Philosophy · Graduating 2028". */
  detail: string;
  /** Their answer to each of the form's facilitator questions, by column key. */
  answers: Record<string, string>;
  standing: Standing;
  /** Their account's role now, or null for an account that is gone. */
  role: string | null;
  /**
   * When they said they are free, by the site's own reading, and the stretches
   * they marked. For an admin's chart beside an ask only: the view leaves both
   * out for anybody else, and neither is ever sent to Claude.
   */
  painted: PaintedWeek;
  marked: MarkedRange[];
};

export async function loadFacilitatorPeople(
  db: Firestore,
  form: ApplicationForm,
  sets: readonly QuestionSetDoc[],
  programme: ProgrammeSettings,
  viewerUid: string,
): Promise<FacilitatorPerson[]> {
  if (!form.asksFacilitating) return [];
  const term = await loadTerm(db, form, viewerUid);
  const applications: ApplicationDoc[] = [...term.shownApplications.values(), ...term.leftApplications.values()];
  const wanted = applications.filter(
    (application) => application.sent !== null && wouldFacilitate(form, sets, application.sent, programme),
  );
  if (wanted.length === 0) return [];

  const accounts = await db.getAll(...wanted.map((application) => db.collection("users").doc(application.uid)));
  const roleOf = new Map(
    accounts.map((snap) => {
      const role = snap.exists ? snap.data()?.role : null;
      return [snap.id, typeof role === "string" ? role : null] as const;
    }),
  );

  return wanted
    .map((application) => {
      const sent = application.sent!;
      return {
        uid: application.uid,
        name: applicantName(sent.aboutYou, application.displayName),
        firstName: applicantFirstName(sent.aboutYou, application.displayName),
        detail: applicantDetail(sent.aboutYou),
        answers: answersFor(form, sets, sent),
        standing: standingOf(application),
        role: roleOf.get(application.uid) ?? null,
        painted: paintedWeekOf(form.round.availabilityGrid, application),
        marked: markedRanges(sent.availability, form.round.availabilityGrid),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en") || a.uid.localeCompare(b.uid));
}

/**
 * THE PEOPLE AN ADMIN MAY MAKE THE CASE TO: everybody holding a place on this
 * programme who did NOT say they would like to facilitate it, from the same
 * term as the list above (so the viewer's own application is in neither).
 * Their facilitator answers are empty: they gave none for this programme.
 * Staff only, as above; the ask's writer lets only an admin use it.
 */
export async function loadCasePeople(
  db: Firestore,
  form: ApplicationForm,
  sets: readonly QuestionSetDoc[],
  programme: ProgrammeSettings,
  viewerUid: string,
): Promise<FacilitatorPerson[]> {
  const term = await loadTerm(db, form, viewerUid);
  const applications: ApplicationDoc[] = [...term.shownApplications.values(), ...term.leftApplications.values()];
  const wanted = applications.filter(
    (application) =>
      application.sent !== null &&
      !wouldFacilitate(form, sets, application.sent, programme) &&
      hasPlaceOn(standingOf(application), programme.id),
  );
  if (wanted.length === 0) return [];

  const accounts = await db.getAll(...wanted.map((application) => db.collection("users").doc(application.uid)));
  const roleOf = new Map(
    accounts.map((snap) => {
      const role = snap.exists ? snap.data()?.role : null;
      return [snap.id, typeof role === "string" ? role : null] as const;
    }),
  );
  return wanted
    .map((application) => {
      const sent = application.sent!;
      return {
        uid: application.uid,
        name: applicantName(sent.aboutYou, application.displayName),
        firstName: applicantFirstName(sent.aboutYou, application.displayName),
        detail: applicantDetail(sent.aboutYou),
        answers: {},
        standing: standingOf(application),
        role: roleOf.get(application.uid) ?? null,
        painted: paintedWeekOf(form.round.availabilityGrid, application),
        marked: markedRanges(sent.availability, form.round.availabilityGrid),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en") || a.uid.localeCompare(b.uid));
}
