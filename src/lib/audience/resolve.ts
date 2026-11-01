import {
  addressesForSend,
  normaliseNotifications,
  wantsCategory,
} from "@/lib/firestore/notifications";
import { GRID_ROWS, suggestedRow, tagsAllowNotice, wholeMode, type GridRow, type Policy, type SendMode } from "./kind";
import { mayUse, seesReasonsByName, type Scope } from "./scope";
import { parseTag, tagId, type Selection, type Tag } from "./tags";
import { LEFT_OUT_REASONS, NO_NAME, ROW_LABELS, type LeftOutReason } from "./words";

/**
 * FROM A SELECTION TO PEOPLE, over a world the loader has read (`./load.ts`).
 *
 * The world is everything one person's tags are made of, read once for one
 * request and scoped to that person: each tag they may use with the people
 * in it, the facts about each person a send needs (a name, the addresses
 * their account holds, the settings their profile stores), and who among them
 * the person runs a programme for. Everything here is a function of that
 * world, so the number the picker shows, the names See who lists and the
 * people a send reaches are worked out by the same code from the same read.
 *
 * ONE PERSON, ONCE. An account is its uid; a guest who signed up without an
 * account is their address, so the same guest at two events is one person
 * (and a guest whose address is an account's own was folded into that
 * account by the loader); a walk-in with no account is their check-in, and
 * is never emailed: the address a walk-in leaves is for that event's survey
 * and nothing else (privacy policy, "Coming to an event").
 *
 * INCLUDED, THEN LEFT OUT. The people of every included tag, less the people
 * of every tag left out. Somebody who left a group is in its tag as having
 * left: listed, and never emailed.
 *
 * Pure: no reads, no clock. The two facts that need a read after the people
 * are known (which guests said yes to a row, and which addresses are on the
 * suppression list) are handed in.
 */

/** One person, as the picker tells people apart: "a:<uid>", "g:<address>", "w:<checkInId>" or "s:<signupId>". */
export type PersonKey = string;

export const accountKey = (uid: string): PersonKey => `a:${uid}`;
export const guestKey = (address: string): PersonKey => `g:${address.trim().toLowerCase()}`;
export const walkInKey = (checkInId: string): PersonKey => `w:${checkInId}`;
/** A sign-up made without an account and without an address: nobody to write to. */
export const signupKey = (signupId: string): PersonKey => `s:${signupId}`;

/** How somebody is in a tag: in it, in it as a walk-in, or listed as having left it. */
export type Membership = "in" | "walk-in" | "left";

/** What the world knows about an account, for a send. Never handed to a page. */
export type WorldAccount = {
  uid: string;
  /** Their name on the list (`accountName` in the loader). */
  name: string;
  /** The account's own address. */
  email: string | null;
  /** The university address their profile holds. */
  universityEmail: string | null;
  /** Whether they verified it. */
  universityVerified: boolean;
  /** The profile as stored, for their settings. */
  profile: unknown;
};

/** A guest, a walk-in or an address-less sign-up. Never handed to a page with its address. */
export type WorldGuest = { key: PersonKey; name: string; address: string | null };

/** One tag a person may use, with the people in it. */
export type WorldTag = {
  id: string;
  tag: Tag;
  /** The chip's words. */
  label: string;
  /** Its words under its heading in the list of tags. */
  listLabel: string;
  /** A day or a date beside it in the list, or null. */
  hint: string | null;
  /** The heading it is listed under. */
  heading: string;
  members: ReadonlyMap<PersonKey, Membership>;
};

export type AudienceWorld = {
  viewerUid: string;
  scope: Scope;
  /** The term the tags are for, or null before any form has opened. */
  term: { roundId: string; label: string } | null;
  /** Every tag the viewer may use, in the order the picker lists them. People by name are `nameable`. */
  tags: WorldTag[];
  /** The people the viewer may name one by one, by uid, with their names: approved accounts, for the committee. */
  nameable: ReadonlyMap<string, string>;
  accounts: ReadonlyMap<string, WorldAccount>;
  guests: ReadonlyMap<PersonKey, WorldGuest>;
  /**
   * Everybody the viewer runs a programme for, with the programmes
   * (`<roundId>:<programmeId>`) they run them under: who a programme notice
   * may reach.
   */
  runs: ReadonlyMap<PersonKey, ReadonlySet<string>>;
  /** Whether this copy of the site writes to account addresses only (`EMAIL_GMAIL_ONLY_MODE`). */
  gmailOnly: boolean;
};

// ---------------------------------------------------------------------------
// The tags a person may use, as the picker lists them
// ---------------------------------------------------------------------------

export type CatalogueTag = {
  id: string;
  label: string;
  listLabel: string;
  hint: string | null;
  /** How many people are in it now. */
  count: number;
};

export type Catalogue = {
  /** The term's name, or null before any form has opened. */
  term: string | null;
  groups: { heading: string; tags: CatalogueTag[] }[];
  /** People the viewer may name, as `person:` tags. Empty for everybody but the committee. */
  names: { id: string; name: string }[];
  /** The rows a message by settings may read. */
  rows: { id: GridRow; label: string }[];
};

const counted = (members: ReadonlyMap<PersonKey, Membership>) =>
  [...members.values()].filter((membership) => membership !== "left").length;

/**
 * The tags a person may use, as the picker lists them: names and counts only,
 * never an address, and an account's id only in the tag of a person the
 * viewer may name.
 */
export function projectCatalogue(world: AudienceWorld): Catalogue {
  const groups: Catalogue["groups"] = [];
  for (const tag of world.tags) {
    let group = groups.find((each) => each.heading === tag.heading);
    if (!group) {
      group = { heading: tag.heading, tags: [] };
      groups.push(group);
    }
    group.tags.push({ id: tag.id, label: tag.label, listLabel: tag.listLabel, hint: tag.hint, count: counted(tag.members) });
  }
  const names = [...world.nameable.entries()]
    .map(([uid, name]) => ({ id: tagId({ kind: "person", uid }), name }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB") || a.id.localeCompare(b.id));
  return {
    term: world.term?.label ?? null,
    groups,
    names,
    rows: GRID_ROWS.map((row) => ({ id: row, label: ROW_LABELS[row] })),
  };
}

// ---------------------------------------------------------------------------
// The people of a selection
// ---------------------------------------------------------------------------

export type Picked =
  | { ok: true; include: Tag[]; people: Map<PersonKey, Membership> }
  /** A tag the viewer may not use, or one that is not there any more. Nothing is resolved. */
  | { ok: false; unknown: string[] };

/** The people of one tag, as this world holds them, or null when the viewer may not use it. */
function membersOf(world: AudienceWorld, id: string): ReadonlyMap<PersonKey, Membership> | null {
  const tag = parseTag(id);
  if (!tag || !mayUse(world.scope, tag)) return null;
  if (tag.kind === "person") {
    // Only somebody the viewer may name: an approved account, for the committee.
    return world.nameable.has(tag.uid) ? new Map([[accountKey(tag.uid), "in" as const]]) : null;
  }
  return world.tags.find((each) => each.id === id)?.members ?? null;
}

/**
 * The people a selection reaches, before anything is asked about sending to
 * them. Every tag in it must be one the viewer may use and the world holds;
 * otherwise nothing is resolved and the tags that failed are named.
 */
export function pickPeople(world: AudienceWorld, selection: Selection): Picked {
  const unknown: string[] = [];
  const included = new Map<PersonKey, Membership>();
  const include: Tag[] = [];
  for (const id of selection.include) {
    const members = membersOf(world, id);
    const tag = parseTag(id);
    if (!members || !tag) {
      unknown.push(id);
      continue;
    }
    include.push(tag);
    for (const [key, membership] of members) {
      const was = included.get(key);
      // In a tag beats having left another: somebody who left one group and
      // is in the next is in.
      if (was === undefined || (was === "left" && membership !== "left")) included.set(key, membership);
    }
  }
  const leftOut = new Set<PersonKey>();
  for (const id of selection.exclude) {
    const members = membersOf(world, id);
    if (!members) {
      unknown.push(id);
      continue;
    }
    for (const key of members.keys()) leftOut.add(key);
  }
  if (unknown.length > 0) return { ok: false, unknown };
  for (const key of leftOut) included.delete(key);
  return { ok: true, include, people: included };
}

// ---------------------------------------------------------------------------
// How they would be sent to, and who is left out
// ---------------------------------------------------------------------------

export type ResolveOptions = {
  /** "whole" (one class for everybody, the default) or "per-person". */
  policy?: Policy;
  /** The row a message by settings reads. Defaults to the one the tags suggest. */
  row?: GridRow | null;
  /** "grid" when the writer says it is not about running a programme. Defaults to the rule. */
  mode?: "auto" | "grid";
};

export type Plan = {
  picked: Extract<Picked, { ok: true }>;
  policy: Policy;
  /** The class of a whole send. Per person, each person's own. */
  mode: SendMode;
  row: GridRow;
  suggestedRow: GridRow;
  /** Whether the tags are about running a programme at all. */
  tagsAllow: boolean;
  /** The row whose guests' own subscriptions have to be read, or null when no guest is asked. */
  guestRow: "newsletter" | "events" | null;
};

const isRunBy = (world: AudienceWorld, key: PersonKey) =>
  key === accountKey(world.viewerUid) || world.runs.has(key);

/** How a selection's people would be sent to, before the per-person facts. */
export function planFor(
  world: AudienceWorld,
  picked: Extract<Picked, { ok: true }>,
  options: ResolveOptions = {},
): Plan {
  const policy = options.policy ?? "whole";
  const suggested = suggestedRow(picked.include);
  const row = options.row ?? suggested;
  const inPeople = [...picked.people.entries()].filter(([, membership]) => membership === "in").map(([key]) => key);
  const everybodyIsRun = inPeople.every((key) => isRunBy(world, key));
  const tagsAllow = tagsAllowNotice(picked.include);
  const mode: SendMode = options.mode === "grid" ? "grid" : wholeMode(picked.include, everybodyIsRun, inPeople.length === 0);
  const guestsAsked = inPeople.some((key) => key.startsWith("g:")) && (policy === "per-person" || mode === "grid");
  return {
    picked,
    policy,
    mode,
    row,
    suggestedRow: suggested,
    tagsAllow,
    guestRow: guestsAsked && (row === "newsletter" || row === "events") ? row : null,
  };
}

/** One person a selection reaches. `addresses` and `uid` are for a send, never for a page. */
export type Reached = {
  key: PersonKey;
  uid: string | null;
  name: string;
  /** The viewer themselves. */
  you: boolean;
  /** How a message would reach them. */
  kind: SendMode;
  /** Where it would go: empty when they are left out. */
  addresses: string[];
  leftOut: LeftOutReason | null;
  /** The programmes the viewer runs them under, for a send that asks which. */
  under: string[];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** An account's own address for a notice: the account's, else a university address it verified. */
function noticeAddressOf(account: WorldAccount, gmailOnly: boolean): string | null {
  if (account.email) return account.email;
  if (gmailOnly) return null;
  return account.universityEmail && account.universityVerified ? account.universityEmail : null;
}

/**
 * Each person a plan reaches, with where a message would go or why it would
 * not: before the suppression list, which `withSuppression` applies.
 * `guestSaidYes` answers for a guest's own subscription to the plan's
 * `guestRow`; it is not asked otherwise.
 */
export function reachedBy(world: AudienceWorld, plan: Plan, guestSaidYes: (address: string) => boolean): Reached[] {
  const out: Reached[] = [];
  const you = accountKey(world.viewerUid);
  for (const [key, membership] of plan.picked.people) {
    const under = [...(world.runs.get(key) ?? [])];
    const kind: SendMode = plan.policy === "per-person" ? (isRunBy(world, key) ? "notice" : "grid") : plan.mode;
    const base = { key, you: key === you, kind, under, addresses: [] as string[] };
    if (key.startsWith("a:")) {
      const uid = key.slice(2);
      const account = world.accounts.get(uid);
      const name = account?.name ?? world.nameable.get(uid) ?? NO_NAME;
      if (membership === "left") {
        out.push({ ...base, uid, name, leftOut: "left" });
        continue;
      }
      if (!account) {
        // An account that is gone, or never had a document: nothing to send to.
        out.push({ ...base, uid, name, leftOut: "no-address" });
        continue;
      }
      if (kind === "notice") {
        const address = noticeAddressOf(account, world.gmailOnly);
        out.push({ ...base, uid, name, addresses: address ? [address] : [], leftOut: address ? null : "no-address" });
        continue;
      }
      const prefs = normaliseNotifications(isObject(account.profile) ? account.profile : {});
      if (!wantsCategory(prefs, plan.row)) {
        out.push({ ...base, uid, name, leftOut: "settings" });
        continue;
      }
      const addresses = addressesForSend({
        prefs,
        category: plan.row,
        gmailEmail: account.email,
        universityEmail: account.universityEmail,
        gmailOnlyMode: world.gmailOnly,
      });
      out.push({ ...base, uid, name, addresses, leftOut: addresses.length > 0 ? null : "no-address" });
      continue;
    }

    const guest = world.guests.get(key);
    const name = guest?.name ?? NO_NAME;
    if (membership === "walk-in") {
      out.push({ ...base, uid: null, name, leftOut: "walk-in" });
      continue;
    }
    if (membership === "left") {
      out.push({ ...base, uid: null, name, leftOut: "left" });
      continue;
    }
    const address = guest?.address ?? null;
    if (!address) {
      out.push({ ...base, uid: null, name, leftOut: "no-address" });
      continue;
    }
    if (kind === "notice") {
      out.push({ ...base, uid: null, name, addresses: [address], leftOut: null });
      continue;
    }
    // A guest has no settings grid: their own subscription to the row's list
    // is their yes, and course announcements have no list a guest can be on.
    const yes = plan.row !== "courses" && plan.guestRow === plan.row && guestSaidYes(address);
    out.push({ ...base, uid: null, name, addresses: yes ? [address] : [], leftOut: yes ? null : "settings" });
  }
  return out;
}

/**
 * The suppression list applied: an address that bounced or complained is
 * never written to, and somebody whose every address is on it is left out.
 * `suppressed` holds lower-cased addresses.
 */
export function withSuppression(reached: readonly Reached[], suppressed: ReadonlySet<string>): Reached[] {
  return reached.map((person) => {
    if (person.leftOut || person.addresses.length === 0) return person;
    const addresses = person.addresses.filter((address) => !suppressed.has(address.trim().toLowerCase()));
    return addresses.length > 0 ? { ...person, addresses } : { ...person, addresses: [], leftOut: "suppressed" };
  });
}

/** Every address a send would try, for the one suppression read. */
export function addressesToCheck(reached: readonly Reached[]): string[] {
  return [...new Set(reached.flatMap((person) => person.addresses))];
}

export type Resolution = {
  /** Everybody it reaches, by name. */
  people: Reached[];
  policy: Policy;
  /** The class of a whole send; per person, read each person's `kind`. */
  mode: SendMode;
  row: GridRow;
  suggestedRow: GridRow;
  tagsAllow: boolean;
  counts: { people: number; emailed: number; leftOut: number; you: boolean };
  /** Who is left out, by why, in the order they are listed. Reasons nobody has are not listed. */
  reasons: { reason: LeftOutReason; count: number }[];
};

export function resolutionOf(plan: Plan, reached: readonly Reached[]): Resolution {
  const people = [...reached].sort((a, b) => a.name.localeCompare(b.name, "en-GB") || a.key.localeCompare(b.key));
  const emailed = people.filter((person) => person.leftOut === null).length;
  const reasons = LEFT_OUT_REASONS.map((reason) => ({
    reason,
    count: people.filter((person) => person.leftOut === reason).length,
  })).filter((each) => each.count > 0);
  return {
    people,
    policy: plan.policy,
    mode: plan.mode,
    row: plan.row,
    suggestedRow: plan.suggestedRow,
    tagsAllow: plan.tagsAllow,
    counts: { people: people.length, emailed, leftOut: people.length - emailed, you: people.some((person) => person.you) },
    reasons,
  };
}

// ---------------------------------------------------------------------------
// What leaves the server
// ---------------------------------------------------------------------------

/** The count and its reasons, as the picker draws them: numbers, never a name or an address. */
export type CountView = {
  people: number;
  emailed: number;
  leftOut: number;
  you: boolean;
  mode: SendMode;
  row: GridRow;
  suggestedRow: GridRow;
  tagsAllow: boolean;
  reasons: { reason: LeftOutReason; count: number }[];
};

export function projectAudienceCount(resolution: Resolution): CountView {
  return {
    ...resolution.counts,
    mode: resolution.mode,
    row: resolution.row,
    suggestedRow: resolution.suggestedRow,
    tagsAllow: resolution.tagsAllow,
    reasons: resolution.reasons,
  };
}

/** One line of See who: a name, never an address; why they are left out only for an admin. */
export type WhoLine = { name: string; you: boolean; emailed: boolean; reason: LeftOutReason | null };

export function projectWhoLines(world: AudienceWorld, resolution: Resolution): WhoLine[] {
  const reasons = seesReasonsByName(world.scope);
  return resolution.people.map((person) => ({
    name: person.name,
    you: person.you,
    emailed: person.leftOut === null,
    reason: reasons ? person.leftOut : null,
  }));
}
