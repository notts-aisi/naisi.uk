import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { formatRoundDate, formatRoundDeadline } from "@/lib/admissions/window";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { formatRunStartShort } from "@/lib/courses/window";
import { admissionApplicationUrl } from "@/lib/email/admissionEmails";
import type { SessionUser } from "@/lib/firebase/session";
import { roleOnProgramme } from "../access";
import { freePlaces } from "../decisions";
import { DECISION_REPLY_TO } from "../decisionDay/emailCopy";
import { emailStanding } from "../decisionDay/emailState";
import { loadFirstNames } from "../decisionDay/people";
import { firstNameOf } from "../decisionDay/plan";
import { programmeOf } from "../decisionDay/programmes";
import { loadTerm } from "../decisionDay/term";
import { paintedWeekOf } from "../handover/paintedWeek";
import { own } from "../keys";
import type { ApplicationDoc } from "../model";
import { loadForm, loadQuestionSets } from "../repo";
import { formatScore, scorableKeysFor, sectionScore } from "../scoring";
import { orderedSets } from "../sections";
import { listReviews } from "../staffRepo";
import { standingOf } from "../status/standing";
import { POOL_REASON_LABEL } from "../words";
import { fits, groupWords, placedOnRun, readGroups, readRun, timedGroupsOf } from "./groups";
import { freedPlaceWindow, offerProblem, offersFreedPlaces, seatsFree, waitingOnGroups, windowSentence } from "./rules";
import { freedPlaceTestStanding } from "./tested";
import type { OfferBoard, OfferChip, OfferGroup, OfferPerson, OfferedPerson } from "./views";
import {
  NO_AVAILABILITY_GIVEN,
  fitsNoneWords,
  fitsWords,
  freeInWords,
  gaveBackSentence,
  offerHeading,
  toldOnWords,
  toldSentence,
} from "./words";

/**
 * EVERYTHING THE "OFFER FREED PLACES" PAGE SHOWS, for whoever is looking.
 *
 * Who may look is `offersFreedPlaces` and nothing else, asked of the caller's
 * role on the programme before anybody's application is read: an admin, this
 * term. Anybody with no role on it is answered as for a programme that is not
 * there; anybody else with a role is told the page is an admin's.
 *
 * NOBODY READS THEIR OWN APPLICATION HERE. The term is read through
 * `loadTerm` for the viewer, so their own application is in no list, no
 * count and no number of places. Nobody is read at all until decisions have
 * gone out: before that there is no window, and nothing to offer.
 *
 * The people listed are the ones a freed place can be offered to, and no
 * others (`offerProblem`): told "No offer this time", holding nothing since,
 * having ranked the programme, and pooled by it. Each comes with what the
 * page needs to choose between them, reduced to words: their score for this
 * programme, when they are free, and which of the run's groups their week
 * covers. The week itself is not sent.
 */

export type OfferLoad =
  | { ok: true; board: OfferBoard }
  /** No such form or programme, or the caller has no role on it. */
  | { ok: false; kind: "not-found" }
  /** The caller has a role on the programme and is not one who offers freed places. */
  | { ok: false; kind: "not-yours" };

/** What the page says about the email of somebody already offered a place. */
function emailWords(state: ReturnType<typeof emailStanding>): string {
  switch (state) {
    case "sent":
      return "Email sent";
    case "owed":
      return "Email still to go";
    case "in-flight":
      return "Email going now";
    case "held":
      return "Email held: this copy of the site doesn’t write to that address";
    case "suppressed":
      return "Not emailed: the address is on the do-not-email list";
    case "not-sent":
      return "Not emailed";
    case "unconfirmed":
      return "Email may not have gone";
  }
}

export async function loadOfferBoard(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  now: Date,
): Promise<OfferLoad> {
  const form = await loadForm(db, roundId);
  const role = form ? roleOnProgramme(user, form, programmeId) : null;
  const programme = form ? programmeOf(form, programmeId) : undefined;
  if (!form || !programme || role === null) return { ok: false, kind: "not-found" };
  if (!offersFreedPlaces(role)) return { ok: false, kind: "not-yours" };

  const run = await readRun(db, programme.runId);
  const window = freedPlaceWindow(form.decisionsSentAt, run, now);
  const leadNames = await loadFirstNames(db, programme.leadUid ? [programme.leadUid] : []);
  const tested = freedPlaceTestStanding(form, programme);
  const testers = await loadFirstNames(db, tested.state === "none" ? [] : [tested.byUid]);

  const base: OfferBoard = {
    roundId: form.round.id,
    programmeId: programme.id,
    termLabel: form.round.label,
    shortName: programme.shortName,
    kind: programme.kind,
    leadName: programme.leadUid ? (leadNames.get(programme.leadUid) ?? "") : "",
    window: { open: window.state === "open", sentence: windowSentence(window, programme, form.round.label) },
    free: 0,
    heading: offerHeading(0),
    gaveBack: null,
    told: toldSentence([]),
    usesScores: programme.useScores,
    people: [],
    timedGroups: 0,
    groups: [],
    offered: [],
    test: {
      state: tested.state,
      by: tested.state === "none" ? null : (testers.get(tested.byUid) ?? null),
      when: tested.state === "none" || !tested.at ? null : formatRoundDeadline(tested.at),
      replyBy: tested.state === "none" ? null : tested.replyBy,
    },
    today: londonDateKey(now),
    applicationLink: admissionApplicationUrl(form.round.id, "status"),
    fromName: process.env.SMTP_FROM_NAME ?? "NAISI",
    replyTo: DECISION_REPLY_TO,
    ownApplication: false,
  };
  // Nobody has been told anything before the send, so nobody is read.
  if (form.decisionsSentAt === null) return { ok: true, board: base };

  const [{ shown, shownApplications, leftApplications, own: ownApplication }, reviews, sets, groups] =
    await Promise.all([
      loadTerm(db, form, user.uid),
      listReviews(db, form.round.id),
      loadQuestionSets(db, form.round.id),
      run ? readGroups(db, run.id) : Promise.resolve([]),
    ]);
  const ordered = orderedSets(form, sets);
  const free = freePlaces(form, shown.tally, programme.id) ?? 0;

  // The groups an email can name, with the seats each can still promise.
  const timed = run ? timedGroupsOf(groups, run.id) : [];
  const offeredHere = [...shownApplications.values(), ...leftApplications.values()].filter(
    (application) => application.freedPlace !== null,
  );
  const placed = run
    ? await placedOnRun(
        db,
        run.id,
        offeredHere.map((application) => application.uid),
      )
    : new Set<string>();
  const waiting = waitingOnGroups(offeredHere, placed);
  const groupViews: OfferGroup[] = run
    ? timed.map((group) => {
        const words = groupWords(run, group, now);
        return {
          id: group.id,
          name: group.name,
          meets: words.meets ?? "",
          freeOn: words.freeOn ?? "",
          startsOn: words.startsOn,
          seatsFree: seatsFree(group, waiting),
        };
      })
    : [];
  const seatOf = new Map(groupViews.map((group) => [group.id, group]));

  // Who gave a place on this programme back: they are why there is one to offer.
  const gaveBack = shown.left
    .filter((person) => {
      const application = leftApplications.get(person.uid);
      if (!application) return false;
      const standing = standingOf(application);
      return standing.kind === "released" && standing.programmeId === programme.id;
    })
    .map((person) => person.name);

  const reviewsOf = new Map<string, typeof reviews>();
  for (const review of reviews) {
    const list = reviewsOf.get(review.applicantUid) ?? [];
    list.push(review);
    reviewsOf.set(review.applicantUid, list);
  }

  const people: { person: OfferPerson; score: number | null; fitsAny: boolean }[] = [];
  const toldDays: string[] = [];
  for (const person of shown.people) {
    const application = shownApplications.get(person.uid);
    if (!application?.sent) continue;
    const candidate = { name: person.name, ranked: person.ranked, decision: person.decision, application };
    if (offerProblem(candidate, programme) !== null) continue;

    const sent = application.sent;
    const reason = own(person.decision?.programmes, programme.id)?.poolReason ?? null;
    const painted = paintedWeekOf(form.round.availabilityGrid, application).kind === "given";
    const freeWords = painted ? freeInWords(sent.availability, form.round.availabilityGrid) : null;
    const detail = [reason ? `Pooled: ${POOL_REASON_LABEL[reason].toLowerCase()}` : "Pooled", freeWords]
      .filter(Boolean)
      .join(" · ");
    const fitting = painted ? timed.filter((group) => fits(form.round.availabilityGrid, application, group)) : [];
    const chips: OfferChip[] = !painted
      ? [{ label: NO_AVAILABILITY_GIVEN, tone: "plain" }]
      : fitting.length > 0
        ? fitting.map((group) => ({ label: fitsWords(group.name), tone: "ok" }))
        : [{ label: fitsNoneWords(timed.length), tone: "warn" }];
    // Only a group with a seat, a time and a next session can be named.
    const groupIds = fitting
      .filter((group) => {
        const view = seatOf.get(group.id);
        return view !== undefined && view.startsOn !== null && (view.seatsFree === null || view.seatsFree > 0);
      })
      .map((group) => group.id);
    const cannot = !painted
      ? "They gave no times, so no email can say when they’re free."
      : fitting.length === 0
        ? "Their week covers none of the groups’ times."
        : groupIds.length === 0
          ? "No group whose time they can make has a seat and a session still to come."
          : null;
    const score = programme.useScores
      ? sectionScore(reviewsOf.get(person.uid) ?? [], scorableKeysFor(form, ordered, programme.id, sent)).score
      : null;
    const toldAt = application.result?.publishedAt ?? form.decisionsSentAt;
    toldDays.push(formatRoundDate(toldAt));
    people.push({
      person: {
        uid: person.uid,
        name: person.name,
        firstName: firstNameOf(application),
        detail,
        chips,
        groupIds,
        score: score === null ? null : formatScore(score),
        toldOn: toldOnWords(toldAt, now),
        cannot,
      },
      score,
      fitsAny: fitting.length > 0,
    });
  }
  // Those whose week covers a group first, then by score, highest first.
  people.sort(
    (a, b) =>
      Number(b.fitsAny) - Number(a.fitsAny) ||
      (b.score ?? -1) - (a.score ?? -1) ||
      a.person.name.localeCompare(b.person.name, "en") ||
      a.person.uid.localeCompare(b.person.uid),
  );

  const offered: OfferedPerson[] = offeredHere
    .filter((application) => application.invitation?.programmeId === programme.id)
    .map((application) => offeredView(application, now))
    .sort((a, b) => a.name.localeCompare(b.name, "en") || a.uid.localeCompare(b.uid));

  return {
    ok: true,
    board: {
      ...base,
      free,
      heading: offerHeading(window.state === "open" ? free : 0),
      gaveBack: gaveBackSentence(gaveBack),
      told: toldSentence(toldDays),
      people: people.map((entry) => entry.person),
      timedGroups: timed.length,
      groups: groupViews,
      offered,
      ownApplication: ownApplication !== "none",
    },
  };
}

/** Somebody offered a freed place here, and where it stands now. */
function offeredView(application: ApplicationDoc, now: Date): OfferedPerson {
  const name = application.displayName.trim() || application.sent?.aboutYou.preferredName.trim() || "Somebody";
  const standing = standingOf(application);
  const replyBy = application.invitation ? (formatRunStartShort(application.invitation.replyBy) ?? "") : "";
  const said =
    standing.kind === "invitation"
      ? `Waiting for an answer, by ${replyBy}`
      : standing.kind === "place"
        ? "Accepted"
        : standing.kind === "released"
          ? standing.how === "no-thanks"
            ? "Said no thanks"
            : "Accepted, then gave the place back"
          : "Withdrawn";
  const state = application.freedPlace ? emailStanding(application.freedPlace, now) : "unconfirmed";
  return {
    uid: application.uid,
    name,
    said,
    email: emailWords(state),
    // An email still to go is sent by a press, while the offer is still theirs to answer.
    owed: state === "owed" && standing.kind === "invitation" && (application.email ?? "").trim() !== "",
  };
}
