import type { SessionSlot } from "@/lib/admissions/availability";
import { dayWords } from "@/lib/courses/sessionChange/words";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { hasBeenTold, holdingOf, joinedByInvitation } from "../decisions";
import { holdsPlaceOn, nameOnRecord } from "../handover/holders";
import { paintedWeekOf } from "../handover/paintedWeek";
import { own } from "../keys";
import type { ApplicationDoc, DecisionDoc } from "../model";
import type { ApplicationForm } from "../normalise";
import { applicantDetail, applicantFirstName } from "../review/people";
import { rankedProgrammes } from "../sections";
import { comingReplyOf } from "../status/coming";
import { reasonInWords } from "../status/reasons";
import { standingOf } from "../status/standing";
import { countRows } from "./filters";
import type { PeopleCounts, PersonCategory, PersonFree, PersonRow, PersonStatus } from "./views";
import { placesSentence } from "./words";

/**
 * EVERYONE WHO HOLDS A PLACE ON A PROGRAMME OR GAVE IT BACK (board st-people),
 * worked out from the records, for the programme's lead and admins.
 *
 * ## One answer per question, shared with every other screen
 *
 *  - WHO HOLDS A PLACE is `holdsPlaceOn` (`../handover/holders.ts`), the test
 *    the hand-over, the times picture and the allocation board ask, so "30
 *    hold a place" here is their 30.
 *  - WHO IS INVITED is `holdingOf`'s place kept for an invitation, the one the
 *    term's tally counts as invited.
 *  - WHO GAVE A PLACE BACK is `standingOf`'s released, for this programme, as
 *    the freed places page reads it; their reason is `reasonInWords`, as the
 *    review screens read it.
 *  - WHO HAS SAID THEY ARE COMING, and when, is `comingReplyOf`, which a
 *    facilitator's Home asks too.
 *  - WHEN THEY ARE FREE is `paintedWeekOf`, the one reading of a painted week
 *    the board and the times picture share, asked of each group's own weekly
 *    session. The week itself is not handed on: a row says which groups it
 *    covers, and nothing else.
 *
 * ## Only what the viewer may read
 *
 * A row is somebody whose application the viewer may open (`canRead`, the
 * review screens' own rule, asked by the caller). Everybody holding a place
 * here ranked the programme or joined it, so the lead reads every one of
 * them. Somebody invited here on decision day who did not rank it is not the
 * lead's to read until they accept, and is a row for an admin alone.
 *
 * ## What comes from the run
 *
 * The run the programme names says two things, from each person's seat on it
 * (`seats`): their group, and whether they have left it. Somebody who left
 * the run by themselves reads "Left the programme" with the day, and somebody
 * staff took off it "Taken off the programme" with the day, as the hand-over
 * panel and their own application page say it. What they said when they left
 * is read out on the programme's Overview, and not here. Which filters they
 * are under is still the form's: the run changes no count.
 *
 * Pure: the loader reads, this decides. No email address, access requirement,
 * painted week or answer to a question is in what it returns.
 */

/** One of the run's live groups, as a row needs it: its name, its letter, and its weekly session if it has one. */
export type PeopleGroup = { id: string; name: string; tag: string; session: SessionSlot | null };

/** Somebody's seat on the run: the group it is in, and whether it has left the run, when, and by whose act. */
export type PeopleSeat = {
  groupId: string | null;
  left: { at: Date | null; by: "themselves" | "staff" } | null;
};

export type PeopleInput = {
  form: ApplicationForm;
  programmeId: string;
  /** Every SENT application on the form, in the term or not. */
  applications: readonly ApplicationDoc[];
  decisions: ReadonlyMap<string, DecisionDoc>;
  /** Who is looking, and whether they may open one application (the programmes it ranked, the one it joined). */
  viewer: { uid: string; canRead: (ranked: readonly string[], joined: string | null) => boolean };
  /** The run's live groups, in the board's order. Empty while the programme names no run. */
  groups: readonly PeopleGroup[];
  /** Each person's seat on the run, by uid. */
  seats: ReadonlyMap<string, PeopleSeat>;
  /** The programme's own address, for the links each row offers. */
  programmePath: string;
  /** Whether the programme names a run, so somebody holding a place can be put in a group there. */
  runNamed: boolean;
};

export type PeopleModel = {
  rows: PersonRow[];
  counts: PeopleCounts;
  /** "30 hold a place; 2 gave theirs back." */
  sentence: string;
};

/** "Mon 26 Oct", in London, or null. */
function dayOf(at: Date | null | undefined): string | null {
  return at ? dayWords(londonDateKey(at)) || null : null;
}

/** When they are free, against the groups that have a weekly session. */
function freeOf(form: ApplicationForm, application: ApplicationDoc, groups: readonly PeopleGroup[]): PersonFree {
  const week = paintedWeekOf(form.round.availabilityGrid, application);
  if (week.kind !== "given") return { kind: "not-said" };
  const timed = groups.filter((group): group is PeopleGroup & { session: SessionSlot } => group.session !== null);
  if (timed.length === 0) return { kind: "no-times" };
  // "Fits A, B, D": the groups' letters in the order they read, as the board writes them.
  const tags = [...new Set(timed.filter((group) => week.covers(group.session)).map((group) => group.tag))].sort((a, b) =>
    a.localeCompare(b, "en-GB", { numeric: true }),
  );
  return tags.length > 0 ? { kind: "fits", tags } : { kind: "fits-none", times: timed.length };
}

/** The day somebody gave a place back: their reply's own day, or when the application was withdrawn. */
function gaveBackOn(application: ApplicationDoc): Date | null {
  const said = application.attendance?.answer === "cant-make-it" ? application.attendance.answeredAt : null;
  const declined = application.invitation?.response === "declined" ? application.invitation.respondedAt : null;
  return said ?? declined ?? application.withdrawnAt ?? null;
}

const CATEGORY_ORDER: Record<PersonCategory, number> = { holding: 0, "gave-back": 1, invited: 2 };

export function programmePeople(input: PeopleInput): PeopleModel {
  const { form, programmeId, decisions, viewer, groups, seats, programmePath } = input;
  const invitable = new Set(form.programmeIds);
  const groupAt = new Map(groups.map((group, at) => [group.id, { group, at }] as const));

  const rows: (PersonRow & { order: number })[] = [];
  for (const application of input.applications) {
    if (!application.sent || !hasBeenTold(application)) continue;
    const decision = decisions.get(application.uid) ?? null;
    const ranked = rankedProgrammes(form, application.sent).map((programme) => programme.id);
    const invitedTo = joinedByInvitation(application);
    const joined = invitedTo !== null && own(form.programmes, invitedTo) && !ranked.includes(invitedTo) ? invitedTo : null;

    let category: PersonCategory | null = null;
    if (holdsPlaceOn(form, programmeId, application, decision)) {
      category = "holding";
    } else {
      const standing = standingOf(application);
      if (standing.kind === "released" && standing.programmeId === programmeId) category = "gave-back";
      else if (holdingOf({ uid: application.uid, ranked, decision, application }, invitable).heldFor === programmeId) {
        category = "invited";
      }
    }
    if (category === null || !viewer.canRead(ranked, joined)) continue;

    const seat = seats.get(application.uid) ?? null;
    const placed = seat && seat.left === null && seat.groupId ? (groupAt.get(seat.groupId) ?? null) : null;
    const reply = comingReplyOf(application, programmeId);

    let status: PersonStatus;
    if (category !== "invited" && seat?.left) {
      status = { kind: "left", on: dayOf(seat.left.at), by: seat.left.by };
    } else if (category === "holding") {
      status = { kind: "holding" };
    } else if (category === "gave-back") {
      status = { kind: "gave-back", reason: reasonInWords(application.releaseReason), on: dayOf(gaveBackOn(application)) };
    } else {
      status = {
        kind: "invited",
        until: application.invitation ? dayWords(application.invitation.replyBy) || null : null,
        on: dayOf(application.freedPlace?.offeredAt ?? application.result?.publishedAt ?? null),
      };
    }

    const isOwn = application.uid === viewer.uid;
    rows.push({
      uid: application.uid,
      name: nameOnRecord(application),
      firstName: applicantFirstName(application.sent.aboutYou, application.displayName),
      detail: applicantDetail(application.sent.aboutYou),
      category,
      group: placed ? placed.group.name : null,
      coming:
        category === "holding"
          ? reply.said
            ? { kind: "yes", on: dayOf(reply.on) }
            : { kind: "not-yet" }
          : category === "gave-back"
            ? { kind: "no" }
            : { kind: "not-yet" },
      free: freeOf(form, application, groups),
      status,
      applicationHref: isOwn ? null : `${programmePath}/applications/${encodeURIComponent(application.uid)}`,
      groupsHref: category === "holding" && input.runNamed ? `${programmePath}/groups` : null,
      // Holding a place first, in a group before not, groups in the board's
      // order; then who gave a place back; then who is invited.
      order: CATEGORY_ORDER[category] * 1000 + (category === "holding" ? (placed ? placed.at : 999) : 0),
    });
  }

  rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "en") || a.uid.localeCompare(b.uid));
  const out: PersonRow[] = rows.map(({ order: _order, ...row }) => row);
  const counts = countRows(out);
  return {
    rows: out,
    counts,
    sentence: placesSentence(
      out.filter((row) => row.category === "holding").length,
      out.filter((row) => row.category === "gave-back").length,
    ),
  };
}
