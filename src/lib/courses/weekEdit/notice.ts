import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readWeekReach, readWeekWork } from "./counts";
import type { WeekSaveDoc } from "./history";
import { resolveNoticeAudience, type CohortAudienceLane } from "@/lib/email/courseFacilitatorEmails";
import type { WeekBlock } from "../weekBlocks/model";
import { NOTICE_LETTERS, TELL_WORDS, sourceOwnerWords, type NoticeLetter } from "./words";

/**
 * TELLING PEOPLE ABOUT A CHANGE TO A LIVE WEEK, AS A CHOICE.
 *
 * After a save to a published week the editor is offered a notice, off
 * unless chosen: nobody (most fixes need no email), the people who have
 * started the week (anything of theirs on it: a tick, a word, a pick),
 * everyone the week is open for (everybody whose group reads the run's week:
 * a group with its own copy did not get the change), or everyone on the
 * programme.
 *
 * WHO A NOTICE CAN REACH AT ALL is the audience every notice to a run has,
 * `resolveNoticeAudience`: everybody holding a place on the run whose group
 * Publish has told them, whatever they unsubscribed from, each at their
 * cohort row's address or else their account's own, deduped, suppression
 * applied, and over the lane's ceiling refused whole. The three choices
 * narrow it, and none ever reaches the person pressing. The same function
 * counts for the preview and for the press, so the number on the button is
 * the number the press sends to, and the press is refused (409, with the new
 * number) when the two no longer agree.
 *
 * A NOTICE, DECLARED AS ONE (docs/notifications.md, "The notice lane"): the
 * programme's lead or an admin telling the people on it about the programme
 * they are on. It carries the notice marker, a `kind: "notice"` receipt on
 * the `course-run` surface, no unsubscribe link and NO MEETING LINK: nothing
 * here reads a group's link, and the email says only what changed and where
 * the week is. "Send me a test first" reaches the presser's own address
 * alone, marked [TEST], and is not a notice.
 */

/** The notice audience's words for this send: its log tag and its over-the-cap advice. */
export const TELL_LANE: CohortAudienceLane = {
  logTag: "courses week change notice",
  overCapAdvice: "choose the people who have started the week",
};

export type TellAudience = "started" | "open" | "programme";
export const TELL_AUDIENCES: readonly TellAudience[] = ["started", "open", "programme"];

export type TellRecipient = { uid: string; address: string };

export type TellAudiences = {
  /** Over what one notice can reach: nothing is offered. */
  refused: boolean;
  recipients: Record<TellAudience, TellRecipient[]>;
};

/** Who each choice reaches, for the presser who will press: never the presser. */
export async function tellAudiences(
  db: Firestore,
  runId: string,
  weekId: string,
  blocks: readonly WeekBlock[],
  presserUid: string,
): Promise<TellAudiences> {
  const empty = { started: [], open: [], programme: [] };
  const audience = await resolveNoticeAudience(db, runId, TELL_LANE);
  if (audience.refusal) return { refused: true, recipients: empty };
  const [work, reach] = await Promise.all([readWeekWork(db, runId, weekId, blocks), readWeekReach(db, runId, weekId)]);
  const reading = new Set(reach.groups.filter((group) => !group.ownCopy).map((group) => group.id));
  const everyone = audience.members.filter((member) => member.uid !== presserUid);
  const pick = (keep: (member: (typeof everyone)[number]) => boolean) =>
    everyone.filter(keep).map((member) => ({ uid: member.uid, address: member.address }));
  return {
    refused: false,
    recipients: {
      started: pick((member) => work.started.has(member.uid)),
      open: pick((member) => member.groupId !== null && reading.has(member.groupId)),
      programme: pick(() => true),
    },
  };
}

/** The choices as the dialog lists them, each with its live count. */
export type TellChoice = { audience: "nobody" | TellAudience; label: string; hint: string; count: number };

export function tellChoices(audiences: TellAudiences, weekNumber: number, programme: string): TellChoice[] {
  const count = (audience: TellAudience) => (audiences.refused ? 0 : audiences.recipients[audience].length);
  return [
    { audience: "nobody", label: TELL_WORDS.choice.nobody, hint: TELL_WORDS.hint.nobody, count: 0 },
    { audience: "started", label: TELL_WORDS.choice.started(weekNumber), hint: TELL_WORDS.hint.started, count: count("started") },
    { audience: "open", label: TELL_WORDS.choice.open(weekNumber), hint: TELL_WORDS.hint.open, count: count("open") },
    { audience: "programme", label: TELL_WORDS.choice.programme(programme), hint: TELL_WORDS.hint.programme, count: count("programme") },
  ];
}

/**
 * What the notice about one save says: a new link, a new title, a reworded
 * reflection, a new word range, a reworded question, or, for anything else
 * (a text, a paste, a restore), that the week changed and nothing anybody
 * ticked or wrote is lost.
 */
export function letterFor(save: WeekSaveDoc, weekNumber: number): NoticeLetter {
  const change = save.change;
  const part = save.partNumber;
  if (save.kind === "edit" && change) {
    switch (change.type) {
      case "source":
        if (change.changed.includes("url")) return NOTICE_LETTERS.link(weekNumber, part, change.by, change.title, change.kind);
        if (change.changed.includes("title")) return NOTICE_LETTERS.title(weekNumber, part, change.title, change.by, change.kind);
        return NOTICE_LETTERS.source(weekNumber, part, sourceOwnerWords(change.by, change.title, change.kind), change.kind);
      case "reflection": {
        const reworded = change.prompts.find((prompt) => prompt.before !== prompt.after) ?? change.prompts[0];
        return NOTICE_LETTERS.reflection(weekNumber, part, reworded?.after ?? "");
      }
      case "writtenAnswer":
        if (change.changed.length === 1 && change.changed[0] === "words") return NOTICE_LETTERS.range(weekNumber, part, change.words.after);
        return NOTICE_LETTERS.question(weekNumber, part);
      default:
        return NOTICE_LETTERS.week(weekNumber, part);
    }
  }
  return NOTICE_LETTERS.week(weekNumber, null);
}

/** The email's body as the composer's lanes take it: the letter's lines, then where the week is. */
export function letterBody(letter: NoticeLetter, weekNumber: number, weekUrl: string): string {
  return [...letter.lines, ...(weekUrl ? [TELL_WORDS.weekLine(weekNumber, weekUrl)] : [])].join("\n\n");
}

/** The week's page for somebody on the run: "/learn/{runId}/weeks/{n}", on this site. */
export function weekPageUrl(appUrl: string, runId: string, weekNumber: number): string {
  return appUrl ? `${appUrl}/learn/${encodeURIComponent(runId)}/weeks/${weekNumber}` : "";
}
