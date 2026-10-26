import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { decisionDayHasBegun } from "@/lib/applications/decisions";
import { listForms } from "@/lib/applications/handover/run";
import { own } from "@/lib/applications/keys";
import { firstSessionWindowWords, groupEmailComingWords, groupsGoOutDay } from "@/lib/courses/groupsGoOut";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import type { SessionUser } from "@/lib/firebase/session";
import { weekOneDoorFor } from "./door";

/**
 * WHAT HOME AND MY PROGRAMMES SAY TO SOMEBODY HOLDING A PLACE BEFORE GROUPS
 * GO OUT (Q13 B: board st-waiting; Q35 B: v20's "Week 1 is open"), one card
 * for each place: "Fellowship: AGI Strategy", "Your group’s on its way",
 * when the group email comes, when the first session will be, the way to
 * their week, and once week 1's door is open to them, the way to week 1.
 *
 * Who gets a card is week 1's door's to say (`weekOneDoorFor`, the one
 * answer): somebody holding a place on the programme that names a run, not
 * told a group on it, in standing, not in a view-as session. A card is gone
 * once Publish has told them, once they gave the place back or left, and on
 * a run that is shut. Every word comes from a record: the programme's kind
 * and short name from the form, the planned day groups go out and the first
 * week from the run.
 *
 * WHAT A CARD MAY SAY, and nothing more, is held by
 * `tests/applications-place-in-the-member-area.test.mjs` (`MAY_SHOW`): never
 * "No offer this time", never anything of another person's, never how many
 * others have answered anything. It names the person's own programme and
 * nothing of their application. A FELLOWSHIP'S place only: an incubator's
 * people are told of no group, and the board draws no card for one.
 *
 * Reads every application form once (one query), and asks the door only of
 * the runs that a programme names on a form whose decision day has begun:
 * nobody holds a place a person has been told about before then.
 */

export type BeforeGroupsCard = {
  runId: string;
  /** "Fellowship: AGI Strategy". Upper case by CSS. */
  eyebrow: string;
  /** "Your group’s on its way". */
  title: string;
  /** "We’re putting groups together now. You’ll get an email with your group, day and room by Wed 28 Oct. Your first session will be between Thu 29 Oct and Wed 4 Nov." */
  body: string;
  /** "Check when you’re free": the application page's card. */
  free: { href: string; label: string };
  /** "Week 1 is open", once week 1's door is open to them; null before. */
  weekOne: { href: string; label: string } | null;
};

export const ON_ITS_WAY = "Your group’s on its way";
export const CHECK_WHEN_FREE = "Check when you’re free";
/** v20's line (Q35 B). Its exact look is not drawn: listed for the boards' designers to confirm. */
export const WEEK_ONE_IS_OPEN = "Week 1 is open";

export async function beforeGroupsCardsFor(db: Firestore, person: SessionUser, now: Date): Promise<BeforeGroupsCard[]> {
  // Not in a view-as session: whether somebody holds a place is read from
  // their application, which is its owner's. Nothing is read.
  if (markerIsLive(await getImpersonator(), person.uid)) return [];
  const forms = await listForms(db);
  const cards: BeforeGroupsCard[] = [];
  const todayKey = londonDateKey(now);
  for (const form of forms) {
    if (!decisionDayHasBegun(form)) continue;
    for (const programmeId of form.programmeIds) {
      const programme = own(form.programmes, programmeId);
      if (!programme?.runId || programme.kind !== "fellowship") continue;
      const door = await weekOneDoorFor(db, person, programme.runId, { forms });
      const place = door.place;
      if (!place) continue;
      const window = firstSessionWindowWords(place.firstWeek);
      cards.push({
        runId: place.runId,
        eyebrow: `Fellowship: ${place.shortName}`,
        title: ON_ITS_WAY,
        body: [groupEmailComingWords(groupsGoOutDay(place.groupsGoOutOn, todayKey)), window].filter(Boolean).join(" "),
        free: { href: `/applications/${encodeURIComponent(place.roundId)}#when-youre-free`, label: CHECK_WHEN_FREE },
        weekOne: door.open
          ? { href: `/learn/${encodeURIComponent(place.runId)}/weeks/1`, label: WEEK_ONE_IS_OPEN }
          : null,
      });
    }
  }
  return cards;
}
