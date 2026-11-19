import type { AboutKey, KeptEntry } from "./model";
import { ABOUT_AFTER_COLON, ADMIN_WORDS, dayKeyWords, dayWords, weekWords } from "./words";

/**
 * WHAT THE ADMINS' PAGE DRAWS, from the kept entries: pure, so every shape of
 * it is pinned by a test over built worlds.
 *
 *  - ONLY DAYS BEFORE TODAY in London, whatever is handed in: an entry is
 *    read from the day after it was sent.
 *  - BY DAY, the newest day first, and within a day by the entry's id, which
 *    the move drew at random for each kept entry, so the order on the page
 *    has nothing to do with the order they came in.
 *  - A tab per programme named, one for "Not about a programme", and All,
 *    each with its count; the role filter's options are the fixed list.
 *  - The words go out as text. Nothing here is HTML, and nothing handed to
 *    the page says which admin did what beyond the note's own line.
 */

export type ProgrammeTab = { key: string; label: string; count: number };

export type EntryView = {
  id: string;
  /** The tab it belongs to: "none", or the programme's key. */
  programmeKey: string;
  /** The programme's name, or "Not about a programme". */
  programmeLabel: string;
  /** "Week 2", or null when no session was named. */
  weekLabel: string | null;
  /** The role, or "" when none was named. */
  about: AboutKey | "";
  /** "About: my group’s facilitator", or null. */
  aboutLabel: string | null;
  words: string;
  dealtWith: boolean;
  /** "Zach, Sun 8 Nov: sent the guide out early for spring.", or null. */
  noteLine: string | null;
};

export type DayView = { day: string; label: string; entries: EntryView[] };

export type AdminView = {
  /** "4 this term", or null when no term has begun and every kept entry is shown. */
  countLine: string | null;
  total: number;
  tabs: ProgrammeTab[];
  days: DayView[];
};

export const ALL_TAB = "all";
export const NO_PROGRAMME_TAB = "none";

/** The tab key of an entry's programme. */
export function programmeKeyOf(entry: Pick<KeptEntry, "roundId" | "programmeId">): string {
  return entry.roundId && entry.programmeId ? `${entry.roundId}/${entry.programmeId}` : NO_PROGRAMME_TAB;
}

function entryView(entry: KeptEntry): EntryView {
  const programmeKey = programmeKeyOf(entry);
  return {
    id: entry.id,
    programmeKey,
    programmeLabel: programmeKey === NO_PROGRAMME_TAB ? ADMIN_WORDS.noProgramme : entry.programmeName || ADMIN_WORDS.noProgramme,
    weekLabel: entry.week !== null && programmeKey !== NO_PROGRAMME_TAB ? weekWords(entry.week) : null,
    about: entry.about,
    aboutLabel: entry.about ? ADMIN_WORDS.about(ABOUT_AFTER_COLON[entry.about]) : null,
    words: entry.words,
    dealtWith: entry.dealtWith !== null,
    noteLine: entry.note ? ADMIN_WORDS.note(entry.note.byName, dayWords(entry.note.at), entry.note.text) : null,
  };
}

/**
 * The page, from the kept entries read (`./admin`), today's day key in London,
 * and the day this term began (null before any form has opened, when every
 * kept entry is shown and no count line is drawn).
 */
export function buildAdminView(entries: readonly KeptEntry[], today: string, termStartDay: string | null): AdminView {
  const shown = entries.filter((entry) => entry.day < today && (termStartDay === null || entry.day >= termStartDay));

  const byDay = new Map<string, KeptEntry[]>();
  for (const entry of shown) {
    const list = byDay.get(entry.day) ?? [];
    list.push(entry);
    byDay.set(entry.day, list);
  }
  const days: DayView[] = [...byDay.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((day) => ({
      day,
      label: dayKeyWords(day),
      entries: (byDay.get(day) ?? [])
        .slice()
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map(entryView),
    }));

  // A tab per programme named, in alphabetical order of its name, then the entries naming none.
  const programmes = new Map<string, { label: string; count: number }>();
  let none = 0;
  for (const entry of shown) {
    const key = programmeKeyOf(entry);
    if (key === NO_PROGRAMME_TAB) {
      none += 1;
      continue;
    }
    const tab = programmes.get(key) ?? { label: entry.programmeName || ADMIN_WORDS.noProgramme, count: 0 };
    tab.count += 1;
    programmes.set(key, tab);
  }
  const collator = new Intl.Collator("en-GB", { sensitivity: "base", numeric: true });
  const tabs: ProgrammeTab[] = [
    { key: ALL_TAB, label: ADMIN_WORDS.all, count: shown.length },
    ...[...programmes.entries()]
      .sort(([ak, a], [bk, b]) => collator.compare(a.label, b.label) || (ak < bk ? -1 : 1))
      .map(([key, tab]) => ({ key, label: tab.label, count: tab.count })),
    ...(none > 0 ? [{ key: NO_PROGRAMME_TAB, label: ADMIN_WORDS.noProgramme, count: none }] : []),
  ];

  return {
    countLine: termStartDay === null ? null : ADMIN_WORDS.count(shown.length),
    total: shown.length,
    tabs,
    days,
  };
}

/** The days and entries one tab and one role choice leave, empty days dropped. */
export function filterDays(days: readonly DayView[], tab: string, about: AboutKey | ""): DayView[] {
  return days
    .map((day) => ({
      ...day,
      entries: day.entries.filter((entry) => (tab === ALL_TAB || entry.programmeKey === tab) && (about === "" || entry.about === about)),
    }))
    .filter((day) => day.entries.length > 0);
}
