import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import type { CantMakeItView } from "../cantMakeIt/model";
import { cantMakeItFor } from "../cantMakeIt/seat";
import type { ExcusedOwnView } from "../excused/own";
import { excusedFor } from "../excused/own";
import type { JoiningOnlineView } from "../joiningOnline/model";
import { joiningOnlineFor } from "../joiningOnline/seat";

/**
 * WHAT THE CARD FOR A PERSON'S NEXT SESSION CAN BE TOLD, worked out on the
 * server, once, for both places the card is drawn: their programme page
 * (`/learn/[runId]`, handed to the page's client part) and Home (which learns
 * the run in the browser, so it asks `GET /api/courses/runs/[runId]/next-session`,
 * whose answer is this). Nothing here is worked out twice.
 *
 *  - `cantMakeIt`: today's instant "Can't make it" (`cantMakeItFor`), for
 *    somebody who facilitates the group they hold a place in.
 *  - `joiningOnline`: "I'm joining online" (`joiningOnlineFor`), for a
 *    session held in a room, the host's in a visit week.
 *  - `excused`: each of their sessions as the card needs it and their own
 *    requests (`excusedFor`), which decides the way in.
 *
 * Only for somebody taking part (`takesPart`: a live learner's place, the
 * page gate's `isEnrolled`); nobody else is answered anything. Each read that
 * fails draws nothing, as the programme page always has.
 */
export type NextSessionAnswers = {
  cantMakeIt: CantMakeItView | null;
  joiningOnline: JoiningOnlineView | null;
  excused: ExcusedOwnView | null;
};

export const NO_ANSWERS: NextSessionAnswers = { cantMakeIt: null, joiningOnline: null, excused: null };

export async function nextSessionAnswersFor(
  db: Firestore | undefined,
  input: {
    user: SessionUser;
    run: CourseRunDoc;
    enrolment: CourseEnrolmentDoc | null;
    groups: readonly CourseGroupDoc[];
    takesPart: boolean;
    now: Date;
  },
): Promise<NextSessionAnswers> {
  if (!db || !input.takesPart) return NO_ANSWERS;
  const asked = { user: input.user, run: input.run, enrolment: input.enrolment, groups: input.groups, now: input.now };
  // Three reads that do not depend on each other, asked together.
  const [cantMakeIt, joiningOnline, excused] = await Promise.all([
    cantMakeItFor(db, asked).catch(() => null),
    joiningOnlineFor(db, asked).catch(() => null),
    excusedFor(db, asked).catch(() => null),
  ]);
  return { cantMakeIt, joiningOnline, excused };
}
