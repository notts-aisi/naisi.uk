import { isId } from "@/lib/applications/keys";
import { ALL_TRACKS, type Track } from "@/lib/firestore/users";
import { isGridRow, type GridRow } from "./kind";

/**
 * THE TAGS OF "WHO IS THIS FOR?", BY ID.
 *
 * A tag names a group of people the way the records already describe them:
 * everybody holding a place on a programme this term, a group's people, the
 * people who came to an event, the people subscribed to the newsletter, the
 * committee. A selection is tags to include and tags to leave out, and the
 * people it reaches are worked out from the records each time it is read
 * (`./load.ts`). NOTHING HERE IS A STORED LIST OF PEOPLE: a tag is a sentence
 * about the records, so somebody who joins a group tomorrow is in its tag
 * tomorrow, and somebody who leaves is out of it.
 *
 * An id is a plain string, so a selection travels in a request body and can
 * be kept by whatever later sends with it. The term's tags and a programme's
 * carry the form they are about (`roundId`), because a programme's id is
 * reused from term to term ("agi-strategy" on every form): a selection kept
 * from last term names last term's people, and is read as a tag that is not
 * there any more rather than quietly meaning this term's.
 *
 *   term:<roundId>:applied | holding | facilitating | leading | invited
 *   programme:<roundId>:<programmeId>:everyone | holding | facilitating
 *   group:<groupId>
 *   event:<eventId>:came | signed-up | no-show
 *   subscribed:newsletter | events
 *   role:committee | admin
 *   track:technical | governance
 *   person:<uid>
 *
 * Who may use which is `./scope.ts`; what each is called is `./words.ts`.
 *
 * Pure, with no server import, so the picker in the browser and the routes
 * read a tag the same way.
 */

export type TermPart = "applied" | "holding" | "facilitating" | "leading" | "invited";
export const TERM_PARTS: readonly TermPart[] = ["applied", "holding", "facilitating", "leading", "invited"];

export type ProgrammePart = "everyone" | "holding" | "facilitating";
export const PROGRAMME_PARTS: readonly ProgrammePart[] = ["everyone", "holding", "facilitating"];

export type EventPart = "came" | "signed-up" | "no-show";
export const EVENT_PARTS: readonly EventPart[] = ["came", "signed-up", "no-show"];

export type SubscribedChannel = "newsletter" | "events";
export const SUBSCRIBED_CHANNELS: readonly SubscribedChannel[] = ["newsletter", "events"];

export type RoleTag = "committee" | "admin";
export const ROLE_TAGS: readonly RoleTag[] = ["committee", "admin"];

export type Tag =
  | { kind: "term"; roundId: string; part: TermPart }
  | { kind: "programme"; roundId: string; programmeId: string; part: ProgrammePart }
  | { kind: "group"; groupId: string }
  | { kind: "event"; eventId: string; part: EventPart }
  | { kind: "subscribed"; channel: SubscribedChannel }
  | { kind: "role"; role: RoleTag }
  | { kind: "track"; track: Track }
  | { kind: "person"; uid: string };

/** An account id as the site mints them: letters, digits, hyphen and underscore. */
const UID_SHAPE = /^[A-Za-z0-9_-]{1,128}$/;

export function isUid(value: unknown): value is string {
  return typeof value === "string" && UID_SHAPE.test(value);
}

/** The one spelling of a tag. */
export function tagId(tag: Tag): string {
  switch (tag.kind) {
    case "term":
      return `term:${tag.roundId}:${tag.part}`;
    case "programme":
      return `programme:${tag.roundId}:${tag.programmeId}:${tag.part}`;
    case "group":
      return `group:${tag.groupId}`;
    case "event":
      return `event:${tag.eventId}:${tag.part}`;
    case "subscribed":
      return `subscribed:${tag.channel}`;
    case "role":
      return `role:${tag.role}`;
    case "track":
      return `track:${tag.track}`;
    case "person":
      return `person:${tag.uid}`;
  }
}

const oneOf = <T extends string>(list: readonly T[], value: string): value is T =>
  (list as readonly string[]).includes(value);

/**
 * A tag from its id, or null for anything that is not exactly one. Every id
 * inside a tag is held to the shape the site mints, so a tag can never carry
 * a path separator or a name every object answers to.
 */
export function parseTag(raw: unknown): Tag | null {
  if (typeof raw !== "string" || raw.length > 300) return null;
  const parts = raw.split(":");
  const [kind] = parts;
  if (kind === "term" && parts.length === 3) {
    const [, roundId, part] = parts;
    return isId(roundId) && oneOf(TERM_PARTS, part) ? { kind, roundId, part } : null;
  }
  if (kind === "programme" && parts.length === 4) {
    const [, roundId, programmeId, part] = parts;
    return isId(roundId) && isId(programmeId) && oneOf(PROGRAMME_PARTS, part)
      ? { kind, roundId, programmeId, part }
      : null;
  }
  if (kind === "group" && parts.length === 2) {
    return isId(parts[1]) ? { kind, groupId: parts[1] } : null;
  }
  if (kind === "event" && parts.length === 3) {
    const [, eventId, part] = parts;
    return isId(eventId) && oneOf(EVENT_PARTS, part) ? { kind, eventId, part } : null;
  }
  if (kind === "subscribed" && parts.length === 2) {
    return oneOf(SUBSCRIBED_CHANNELS, parts[1]) ? { kind, channel: parts[1] } : null;
  }
  if (kind === "role" && parts.length === 2) {
    return oneOf(ROLE_TAGS, parts[1]) ? { kind, role: parts[1] } : null;
  }
  if (kind === "track" && parts.length === 2) {
    return oneOf(ALL_TRACKS, parts[1]) ? { kind, track: parts[1] } : null;
  }
  if (kind === "person" && parts.length === 2) {
    return isUid(parts[1]) ? { kind, uid: parts[1] } : null;
  }
  return null;
}

/**
 * What a picker has chosen: tags whose people are included, and tags whose
 * people are left out. Leaving out wins: somebody in both is left out.
 * People named one by one are `person:` tags in either list.
 */
export type Selection = { include: string[]; exclude: string[] };

/** How many tags one selection may hold, in each list. */
export const SELECTION_LIMIT = 60;

export type ParsedSelection = { ok: true; selection: Selection } | { ok: false };

function idList(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > SELECTION_LIMIT) return null;
  const out: string[] = [];
  for (const each of raw) {
    const tag = parseTag(each);
    if (!tag) return null;
    const id = tagId(tag);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * A selection from a request body (`{ include, exclude }`, either may be
 * missing), or refused whole when anything in it is not a tag. Every id comes
 * back in its one spelling, once.
 */
export function parseSelection(raw: unknown): ParsedSelection {
  if (raw === undefined || raw === null) return { ok: true, selection: { include: [], exclude: [] } };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false };
  const body = raw as { include?: unknown; exclude?: unknown };
  const include = idList(body.include);
  const exclude = idList(body.exclude);
  if (!include || !exclude) return { ok: false };
  return { ok: true, selection: { include, exclude } };
}

/**
 * A request to the picker's routes: a selection, and the row a message by
 * settings would read (`row`, absent or null for the one the tags suggest).
 * Refused whole when either is not what it says.
 */
export function parseAudienceBody(raw: unknown): { ok: true; selection: Selection; row: GridRow | null } | { ok: false } {
  const parsed = parseSelection(raw);
  if (!parsed.ok) return { ok: false };
  const row = raw && typeof raw === "object" ? (raw as { row?: unknown }).row : undefined;
  if (row !== undefined && row !== null && !isGridRow(row)) return { ok: false };
  return { ok: true, selection: parsed.selection, row: isGridRow(row) ? row : null };
}
