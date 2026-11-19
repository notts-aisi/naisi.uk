import "server-only";
import { DAY_MS, type NoticeWindow } from "@/lib/email/noticeCaps";

/**
 * HOW OFTEN A GROUP IS EMAILED ITS ROOMS: two stored counters, in the notice
 * lane's `courseNudges` as `emailrate__<key>`, judged by
 * `src/lib/email/noticeCaps.ts`, read and claimed in the press's own
 * transaction (`./send.ts`), so a press refused for any reason claims
 * neither, and the preview reads the same counters first and says the same
 * sentence before the press.
 *
 *  - A group is told once after its term is filled in, perhaps again after a
 *    correction: three times a day per group, whoever presses.
 *  - A presser tells every group they run, perhaps twice: sixty presses a day
 *    per presser, across every group and programme, which no lead or admin
 *    telling each of their groups twice in a day comes near.
 */
export const TERM_ROOMS_LIMITS = {
  /** Emails of one group's rooms, by anybody, in a day. */
  perGroupDay: 3,
  /** Groups emailed their rooms by one presser, in a day. */
  perPresserDay: 60,
} as const;

/** The staff-facing sentences a limit answers with: what was not done, and when to try again. */
export const TERM_ROOMS_LIMIT_WORDS = {
  groupDay: (groupName: string, limit: number) =>
    `${groupName.trim() || "This group"} has been emailed its rooms ${limit} times in the last day, so nobody was emailed: try again tomorrow.`,
  presserDay: (limit: number) => `You’ve emailed groups their rooms ${limit} times in the last day, so nobody was emailed: try again tomorrow.`,
} as const;

/** The two counters one press for `groupId` by `actorUid` is held to. */
export function termRoomsWindows(group: { id: string; name: string }, actorUid: string): NoticeWindow[] {
  return [
    {
      key: `termroomsgroup__${group.id}`,
      limit: TERM_ROOMS_LIMITS.perGroupDay,
      windowMs: DAY_MS,
      refusal: TERM_ROOMS_LIMIT_WORDS.groupDay(group.name, TERM_ROOMS_LIMITS.perGroupDay),
    },
    {
      key: `termroomsby__${actorUid}`,
      limit: TERM_ROOMS_LIMITS.perPresserDay,
      windowMs: DAY_MS,
      refusal: TERM_ROOMS_LIMIT_WORDS.presserDay(TERM_ROOMS_LIMITS.perPresserDay),
    },
  ];
}
