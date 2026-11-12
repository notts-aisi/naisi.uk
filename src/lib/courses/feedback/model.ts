import {
  feedbackIsClaimed,
  type CourseFeedbackDoc,
  type FeedbackDelivery,
  type FeedbackOn,
  type FeedbackRole,
} from "@/lib/firestore/courseFeedback";
import type { GivenLevel } from "../rubric";
import { versionAbout, type PieceFacts } from "../weekWork/versions";

/**
 * FEEDBACK AS A SIGNED COMMENT (privacy v15, "Feedback"), as every page and
 * the batch email read it: one piece is a short comment on one person's week,
 * signed with its writer's name, shown on their week's page as soon as it is
 * saved, and announced by an email an admin sends in a batch. Never a level,
 * a mark or a number goes to the person.
 *
 * TWO KINDS OF STORED FEEDBACK, ONE CARD. A piece in `courseFeedback`
 * (`src/lib/firestore/courseFeedback.ts`), and feedback given before pieces
 * existed: the `feedback` field on a written answer's row, with a level for
 * each row of the course's rubric and a comment, emailed when it was given.
 * The old one is never moved or migrated. It is read here as one more card,
 * already emailed: its comment, or, when the comment is empty, its levels as
 * plain lines, since the person was emailed about them and has read them.
 * Being emailed, it is never in a batch.
 *
 * WHICH NAME SIGNS A PIECE: the name its writer goes by, for every reader.
 * Privacy v15 says only the committee sees a full name and everyone else
 * the name you go by, and the person a piece is about need not be on the
 * committee, so a piece is signed with the name anybody may see. The
 * signature is the first word of it ("Feedback from Rahul"), as the member
 * area names people; the chip's initials come from the whole of it, so no
 * initial is taken from a full name. The people running the group read each
 * piece signed as the person reads it, beside course screens that name
 * people the same way (`fullNameOfUser`); a piece never reads one way to the
 * person and another to the people running their group.
 *
 * WHICH VERSION A PIECE WAS ABOUT (the week stays open): a piece on the
 * written answer stores the mark of the version of the answer it was about
 * (`aboutSavedAt`). When the words have changed since, the card carries that
 * version (`about`), to the people running the group and to the person
 * alike, so nothing anyone wrote about an answer reads as if it were about
 * words it was not about. Every version a piece can be about was read by its
 * writer when it was saved: sent, or after the person's session.
 *
 * Pure: no reads, no clock. The pages in the browser import it.
 */

/** The version of a written answer a piece was about, when the answer has changed since. */
export type AboutVersion = {
  text: string;
  /** An answer in labelled boxes, box id to words, or null. */
  boxes: Record<string, string> | null;
  words: number;
  /** ISO 8601: when those words were last saved. */
  savedAt: string | null;
};

/** Who signs a card, as the person's page says it. */
export type CardRole = FeedbackRole;

/**
 * ONE PIECE AS THE PERSON IT IS ABOUT READS IT (their week page's Feedback
 * section): who signed it and as what, when, and what it says. Never whether
 * it was emailed, and never the writer's account beyond their name.
 */
export type OwnFeedbackCard = {
  id: string;
  on: FeedbackOn["kind"];
  /** The written answer it is on, by its block's id; null for a piece on the week as a whole. */
  itemId: string | null;
  byRole: CardRole;
  /** The first name the writer goes by, or "" when no account is on record. */
  byName: string;
  /**
   * The chip beside a facilitator's card: the name they go by and their uid,
   * for its initials and colour. Null for a card from the team, which carries
   * the society's own.
   */
  chip: { name: string; uid: string } | null;
  /** ISO 8601: when it was saved. */
  at: string | null;
  text: string;
  /** Feedback given before pieces existed with no comment: its levels, one plain line each. */
  lines: string[];
  /**
   * On the written answer, when its words have changed since the piece was
   * saved: the version it was about. Null when it is about the latest words,
   * on the week as a whole, or no longer kept (`aboutGone`).
   */
  about: AboutVersion | null;
  /** The version it was about is no longer kept: the answer has changed since, beyond what is kept. */
  aboutGone: boolean;
};

/**
 * ONE PIECE AS THE PEOPLE RUNNING THE GROUP READ IT (the review page, the
 * Coursework tab's person page): the card, who wrote it, whether its email
 * has gone, and what the reader may do with it.
 */
export type StaffFeedbackCard = OwnFeedbackCard & {
  byUid: string;
  /** ISO 8601: its last change, or null. */
  editedAt: string | null;
  /** Its email: when, and what became of it; null while it is owed. Feedback from before pieces is always emailed. */
  emailed: { at: string | null; delivery: FeedbackDelivery } | null;
  /** A press is sending its email now. */
  sending: boolean;
  /** Given before pieces existed, on the answer's own row: nobody changes or deletes it here. */
  legacy: boolean;
  /** The reader wrote it. */
  mine: boolean;
  /** The reader may change its words: theirs, not emailed, not being sent. */
  mayChange: boolean;
  /** The reader may delete it: theirs and not emailed, or any piece for an admin; never one being sent. */
  mayDelete: boolean;
};

/** The old `feedback` field of a written answer's row, as `readWrittenAnswer` reads it. */
export type LegacyFeedback = { levels: GivenLevel[]; comment: string; byUid: string; sentAt: Date | null };

/** The id a card made from old feedback carries: never a piece's, which are Firestore's own ids. */
export function legacyCardId(answerId: string): string {
  return `legacy:${answerId}`;
}

/** Old feedback's words: its comment, or its levels as plain lines when the comment is empty. */
export function legacyWords(feedback: LegacyFeedback): { text: string; lines: string[] } {
  const comment = feedback.comment.trim();
  if (comment) return { text: comment, lines: [] };
  return { text: "", lines: feedback.levels.map((level) => `${level.row}: ${level.level}`) };
}

/** What a reader knows of the people named on cards: the first word of the name each goes by, and the whole of it. */
export type CardNames = {
  firstName: (uid: string) => string;
  goByName: (uid: string) => string;
};

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/**
 * The version of `answer` a piece was about, as a card carries it: null for
 * the latest words or a piece on the week, gone when no longer kept.
 */
export function aboutOf(
  piece: Pick<CourseFeedbackDoc, "on" | "aboutSavedAt" | "createdAt">,
  answer: PieceFacts | null,
): { about: AboutVersion | null; aboutGone: boolean } {
  if (piece.on.kind !== "writtenAnswer" || !answer) return { about: null, aboutGone: false };
  const version = versionAbout(answer, piece.aboutSavedAt, piece.createdAt);
  if (!version) return { about: null, aboutGone: true };
  if (version.latest) return { about: null, aboutGone: false };
  return {
    about: { text: version.text, boxes: version.boxes, words: version.words, savedAt: iso(version.savedAt) },
    aboutGone: false,
  };
}

/**
 * A piece as the person it is about reads it. `answer` is the written answer
 * it may be on, for the version it was about; left out, nothing is said of
 * versions.
 */
export function ownCardOf(piece: CourseFeedbackDoc, names: CardNames, answer: PieceFacts | null = null): OwnFeedbackCard {
  const facilitator = piece.byRole === "facilitator";
  return {
    id: piece.id,
    on: piece.on.kind,
    itemId: piece.on.kind === "writtenAnswer" ? piece.on.itemId : null,
    byRole: piece.byRole,
    byName: piece.byUid ? names.firstName(piece.byUid) : "",
    chip: facilitator && piece.byUid ? { name: names.goByName(piece.byUid) || names.firstName(piece.byUid), uid: piece.byUid } : null,
    at: iso(piece.createdAt),
    text: piece.text,
    lines: [],
    ...aboutOf(piece, answer),
  };
}

/**
 * Old feedback as the person it is about reads it. `byRole` is worked out by
 * the reader from who runs the person's group now (it was never stored): one
 * of their group's facilitators signs as their facilitator, anybody else as
 * the team.
 */
export function ownLegacyCardOf(answerId: string, feedback: LegacyFeedback, byRole: CardRole, names: CardNames): OwnFeedbackCard {
  const words = legacyWords(feedback);
  return {
    id: legacyCardId(answerId),
    on: "writtenAnswer",
    itemId: answerId,
    byRole,
    byName: feedback.byUid ? names.firstName(feedback.byUid) : "",
    chip: byRole === "facilitator" && feedback.byUid ? { name: names.goByName(feedback.byUid) || names.firstName(feedback.byUid), uid: feedback.byUid } : null,
    at: iso(feedback.sentAt),
    text: words.text,
    lines: words.lines,
    // Given before versions were kept, and before an answer could change after it was read.
    about: null,
    aboutGone: false,
  };
}

/** What the reader of a staff card is: their uid, whether they are an admin, and the time. */
export type StaffReader = { uid: string; isAdmin: boolean; now: Date };

/** A piece as the people running the group read it; `answer` as `ownCardOf` takes it. */
export function staffCardOf(piece: CourseFeedbackDoc, names: CardNames, reader: StaffReader, answer: PieceFacts | null = null): StaffFeedbackCard {
  const mine = piece.byUid !== "" && piece.byUid === reader.uid;
  const emailed = piece.emailedAt ? { at: iso(piece.emailedAt), delivery: piece.emailDelivery ?? "sent" } : null;
  const sending = feedbackIsClaimed(piece, reader.now);
  return {
    ...ownCardOf(piece, names, answer),
    byUid: piece.byUid,
    editedAt: iso(piece.editedAt),
    emailed,
    sending,
    legacy: false,
    mine,
    mayChange: mine && emailed === null && !sending,
    mayDelete: !sending && ((mine && emailed === null) || reader.isAdmin),
  };
}

/** Old feedback as the people running the group read it: emailed when it was given, and nobody's to change here. */
export function staffLegacyCardOf(
  answerId: string,
  feedback: LegacyFeedback,
  byRole: CardRole,
  names: CardNames,
  reader: Pick<StaffReader, "uid">,
): StaffFeedbackCard {
  return {
    ...ownLegacyCardOf(answerId, feedback, byRole, names),
    byUid: feedback.byUid,
    editedAt: null,
    emailed: { at: iso(feedback.sentAt), delivery: "sent" },
    sending: false,
    legacy: true,
    mine: feedback.byUid !== "" && feedback.byUid === reader.uid,
    mayChange: false,
    mayDelete: false,
  };
}

/** Cards oldest first, as the person's page lists them; ties by id so the order never wobbles. */
export function byOldest<T extends { at: string | null; id: string }>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "") || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// The batch email
// ---------------------------------------------------------------------------

/** What one person's email is about: the pieces it announces, each by its week, what it is on and who wrote it. */
export type EmailPiece = { weekNumber: number; on: FeedbackOn["kind"]; byName: string; at: Date | null };

/**
 * WHAT ONE PERSON'S EMAIL SAYS IT IS ABOUT, from the pieces it announces:
 * who wrote them (first names, in the order they were saved, each once),
 * the weeks they are on (each once, in order), whether every one is on the
 * week's written answer, and the newest week, where "Read your feedback"
 * leads.
 */
export type EmailAbout = { names: string[]; weeks: number[]; allOnTheAnswer: boolean; newestWeek: number };

export function emailAboutOf(pieces: readonly EmailPiece[]): EmailAbout {
  const ordered = [...pieces].sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
  const names: string[] = [];
  for (const piece of ordered) {
    const name = piece.byName.trim();
    if (name && !names.includes(name)) names.push(name);
  }
  const weeks = [...new Set(pieces.map((piece) => piece.weekNumber).filter((n) => n > 0))].sort((a, b) => a - b);
  return {
    names,
    weeks,
    allOnTheAnswer: pieces.length > 0 && pieces.every((piece) => piece.on === "writtenAnswer"),
    newestWeek: weeks[weeks.length - 1] ?? 0,
  };
}
