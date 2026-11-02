import { exerciseResponseId, isOwnBoxResponse } from "@/lib/firestore/courseExercises";
import type { CourseWorkRatingDoc } from "@/lib/firestore/courseWorkRatings";
import { rowCountsFrom } from "@/lib/legal/courseworkUse";
import { NOTE_SUGGESTIONS, notesShownIn, type MemberNoteDoc, type NoteSuggestion } from "@/lib/memberNotes/model";
import { NEXT_TERM_WORDS, placeWords, suggestedInWords, type FacilitatingAnswer } from "./words";

/**
 * NEXT TERM: WHO TO ASK, BUILT (privacy v15, "Using your work later" and the
 * lawful basis for "using them and your work (written after version 13) when
 * we consider you for something else later").
 *
 * An admin's list, reached from a term's page, of the people a saved note
 * written from one of the term's runs suggests for next term: facilitating,
 * an incubator or the committee, one tab each. A row says their programme and
 * group, the weeks the suggestion was made in, their ratings for the team
 * this term, what they said about facilitating on this term's application,
 * and one comment in the team's own words with whose it is.
 *
 * WHAT COUNTS is only what may be used when somebody is considered for
 * something else: what came after their coursework-use moment
 * (`courseworkCountsFrom`, `src/lib/legal/courseworkUse.ts`).
 *
 *  - A NOTE counts when it was written after the moment. It is asked through
 *    the place beside an application in `notesShownIn`, the one rule for
 *    which notes may be used outside a programme, so a note written before it
 *    is left out whole: its suggestion lists nobody and names no week. A note
 *    with no suggestion lists nobody either, and a note's own words are never
 *    shown here, so nothing Claude drafted is ever given as the team's.
 *  - A RATING counts when it is on one of the term's runs, on the scale, and
 *    the written answer it rates was first written after the moment
 *    (`rowCountsFrom` on the rated row, never a reflection or a box). A
 *    rating of earlier work, or of a row that is gone, is neither listed nor
 *    quoted.
 *  - Nothing else: no check-in, no session report, nothing Claude returned.
 *
 * "IN THE TEAM'S WORDS" is the comment beside their highest counted rating
 * this term, the newest on a tie, with the name of whoever gave it.
 *
 * NOBODY WITHOUT A SUGGESTION IS LISTED, and the viewer is never a row: nobody
 * is shown the notes or ratings about themselves, an admin included.
 *
 * Pure: no reads, no clock. The page in the browser takes the view's types.
 */

/** One row: a person suggested for the tab's thing. */
export type NextTermRow = {
  uid: string;
  /** Their name, as the admin looking sees it. */
  name: string;
  /** "AGI Strategy · Group C", one for each of the term's programmes they are on, in the form's order. */
  places: string[];
  /** The notes the suggestion was made in: "Weeks 2, 3", "A note". */
  suggestedIn: string;
  /** Their counted ratings this term, in week order. */
  ratings: number[];
  /** What they said about facilitating on this term's application. */
  application: FacilitatingAnswer;
  /** One rating's comment, and whose it is; null when no rating of theirs counts. */
  words: { text: string; by: string } | null;
};

/** One tab: everybody a counted note suggests for one thing. */
export type NextTermTab = {
  key: NoteSuggestion;
  label: string;
  rows: NextTermRow[];
};

/** The page, as the browser is sent it: names and words, no account's document. */
export type NextTermView = {
  roundId: string;
  /** The term's name: "Autumn 2026". */
  term: string;
  tabs: NextTermTab[];
};

/** A person a note is about, as their account says. */
export type NextTermPerson = {
  /** Their coursework-use moment (`courseworkCountsFrom`), or null when they have none. */
  from: Date | null;
  /** Their name for the viewer (`nameForViewer`). */
  name: string;
};

/** A person's seat on one of the term's runs. */
export type NextTermSeat = {
  runId: string;
  uid: string;
  /** Their group's name, or null when they sit in none. */
  group: string | null;
  /** They facilitate that group. */
  facilitates: boolean;
  /** They have left the run. */
  left: boolean;
};

/** What is kept of a written answer a rating rates: when it was first written, and what kind of row it is. Never a word. */
export type RatedRow = { kind?: unknown; firstWrittenAt?: unknown };

/** Everything a term's page is built from, read by `load.ts` after its gate. */
export type NextTermInput = {
  roundId: string;
  term: string;
  /** The admin looking: never a row. */
  viewerUid: string;
  /** The term's programmes that name a run, in the form's order. */
  programmes: readonly { runId: string; name: string }[];
  /** Notes written from those runs. */
  notes: readonly MemberNoteDoc[];
  /** By uid: everybody a note is about whose account is on the site. */
  people: ReadonlyMap<string, NextTermPerson>;
  /** Ratings about those people, on any run. */
  ratings: readonly CourseWorkRatingDoc[];
  /** The rows those ratings rate, by `exerciseResponseId`; a row that is gone is absent. */
  ratedRows: ReadonlyMap<string, RatedRow>;
  /** Whoever gave a rating, named for the viewer, by uid. */
  raterNames: ReadonlyMap<string, string>;
  seats: readonly NextTermSeat[];
  /** `wantsToFacilitate` on this term's sent application, by uid; absent for somebody who sent none. */
  facilitating: ReadonlyMap<string, boolean | null>;
};

/**
 * The notes that count, by the person they are about: written from one of
 * the term's runs, about somebody other than the viewer whose account is on
 * the site, suggesting something, and written after that person's moment.
 */
export function countedNotes(input: Pick<NextTermInput, "viewerUid" | "programmes" | "notes" | "people">): Map<string, MemberNoteDoc[]> {
  const runIds = new Set(input.programmes.map((programme) => programme.runId));
  const byPerson = new Map<string, MemberNoteDoc[]>();
  for (const note of input.notes) {
    if (note.uid === input.viewerUid || note.suggest.length === 0) continue;
    if (note.runId === null || !runIds.has(note.runId)) continue;
    byPerson.set(note.uid, [...(byPerson.get(note.uid) ?? []), note]);
  }
  const out = new Map<string, MemberNoteDoc[]>();
  for (const [uid, notes] of byPerson) {
    const person = input.people.get(uid);
    if (!person) continue;
    // What may be used when somebody is considered for something else: the place beside an application.
    const { shown } = notesShownIn({ kind: "application" }, notes, person.from);
    if (shown.length > 0) out.set(uid, shown);
  }
  return out;
}

/** The row a rating rates. */
export function ratedRowId(rating: Pick<CourseWorkRatingDoc, "runId" | "uid" | "weekId" | "itemId">): string {
  return exerciseResponseId(rating.runId, rating.uid, rating.weekId, rating.itemId);
}

/**
 * One person's ratings that count, in week order: on one of the term's runs,
 * on the scale, given by somebody on record, of a written answer first written
 * after the person's moment.
 */
export function countedRatings(
  input: Pick<NextTermInput, "programmes" | "ratings" | "ratedRows">,
  uid: string,
  from: Date | null,
): CourseWorkRatingDoc[] {
  const runIds = new Set(input.programmes.map((programme) => programme.runId));
  return input.ratings
    .filter((rating) => {
      if (rating.uid !== uid || !runIds.has(rating.runId) || rating.rating === null || !rating.raterUid) return false;
      const row = input.ratedRows.get(ratedRowId(rating));
      return row !== undefined && !isOwnBoxResponse(row) && rowCountsFrom(row, from);
    })
    .sort(
      (a, b) =>
        a.weekNumber - b.weekNumber ||
        (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
        a.raterUid.localeCompare(b.raterUid),
    );
}

/** When a rating was last given: its last change, or when it was first given. */
function givenAt(rating: CourseWorkRatingDoc): number {
  return Math.max(rating.createdAt?.getTime() ?? 0, rating.updatedAt?.getTime() ?? 0);
}

/**
 * "In the team's words": the comment beside the highest of these ratings, the
 * newest on a tie, and whose it is. Null when none has a comment.
 */
export function teamWords(
  ratings: readonly CourseWorkRatingDoc[],
  raterNames: ReadonlyMap<string, string>,
): { text: string; by: string } | null {
  const said = ratings.filter((rating) => rating.comment.trim() !== "" && rating.rating !== null);
  if (said.length === 0) return null;
  const [best] = [...said].sort(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || givenAt(b) - givenAt(a) || a.raterUid.localeCompare(b.raterUid),
  );
  return { text: best.comment.trim(), by: raterNames.get(best.raterUid) ?? NEXT_TERM_WORDS.someone };
}

/** What a stored answer says about facilitating. */
function answerOf(stored: boolean | null | undefined): FacilitatingAnswer {
  if (stored === true) return "offered";
  if (stored === false) return "no";
  return "no-answer";
}

/**
 * The page: one tab per suggestion, in the order a note offers them, each
 * listing everybody a counted note suggests for it, by name.
 */
export function buildNextTerm(input: NextTermInput): NextTermView {
  const notes = countedNotes(input);
  const seatsOf = new Map<string, NextTermSeat[]>();
  for (const seat of input.seats) seatsOf.set(seat.uid, [...(seatsOf.get(seat.uid) ?? []), seat]);

  // What does not change from tab to tab: who they are, where, their ratings, their application, the team's words.
  const people = new Map<string, Omit<NextTermRow, "suggestedIn">>();
  for (const [uid, theirs] of notes) {
    const person = input.people.get(uid);
    if (!person) continue;
    const seats = seatsOf.get(uid) ?? [];
    const onRuns = input.programmes.filter((programme) => seats.some((seat) => seat.runId === programme.runId));
    const places =
      onRuns.length > 0
        ? onRuns.map((programme) => placeWords(programme.name, seats.find((seat) => seat.runId === programme.runId) ?? null))
        : // No seat on the term's runs: the programmes their notes were written from.
          input.programmes.filter((programme) => theirs.some((note) => note.runId === programme.runId)).map((programme) => programme.name);
    const ratings = countedRatings(input, uid, person.from);
    people.set(uid, {
      uid,
      name: person.name,
      places,
      ratings: ratings.map((rating) => rating.rating as number),
      application: answerOf(input.facilitating.get(uid)),
      words: teamWords(ratings, input.raterNames),
    });
  }

  const byName = (a: NextTermRow, b: NextTermRow) =>
    a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }) || a.uid.localeCompare(b.uid);
  return {
    roundId: input.roundId,
    term: input.term,
    tabs: NOTE_SUGGESTIONS.map((key) => {
      const rows: NextTermRow[] = [];
      for (const [uid, theirs] of notes) {
        const person = people.get(uid);
        const suggesting = theirs.filter((note) => note.suggest.includes(key));
        if (!person || suggesting.length === 0) continue;
        rows.push({ ...person, suggestedIn: suggestedInWords(suggesting) });
      }
      return { key, label: NEXT_TERM_WORDS.tab[key], rows: rows.sort(byName) };
    }),
  };
}
