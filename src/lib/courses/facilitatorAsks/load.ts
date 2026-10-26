import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { ProgrammeKind } from "@/lib/applications/model";
import { readRunLead } from "@/lib/courses/programmeLead";
import { londonDateKey } from "@/lib/courses/weekPlan";
import type { SessionUser } from "@/lib/firebase/session";
import { askContext, type AskRefusal } from "./context";
import { groupAskFacts, type GroupAskFacts } from "./groups";
import type { SentAskEmail, WallClock } from "./model";
import { loadFacilitatorPeople } from "./people";
import { listRunAsks, readAskTest, readTraining } from "./read";
import {
  askStateOf,
  facilitatorColumns,
  londonDayOf,
  personStatus,
  type AskState,
  type ChipTone,
  type FacilitatorColumn,
  type PersonStatus,
} from "./rules";
import { askTestStanding } from "./tested";
import {
  askedWords,
  dayIn,
  headlineWords,
  noReplyByWords,
  remindedWords,
  saidNoWords,
  saidYesWords,
  trainingWords,
} from "./words";

/**
 * THE FACILITATORS VIEW OF A PROGRAMME'S GROUPS TAB, as one model the page
 * draws (board st-facilitators): each group with who facilitates it and who
 * has been asked, the email the last person asked got, and the people who
 * said on the form they would like to facilitate, with where each stands.
 *
 * Read for the programme's lead or an admin (`askContext`). Every value is
 * from a record. NO ADDRESS IS IN IT: names, the line under a name, the
 * answers to the form's facilitator questions, and the email as it was sent,
 * which holds none.
 */

export type ViewChip = { words: string; tone: ChipTone };

export type ViewFacilitator = { uid: string; name: string; chip: ViewChip | null };

export type ViewAsk = {
  id: string;
  uid: string;
  name: string;
  firstName: string;
  seat: string;
  state: AskState["kind"];
  chip: ViewChip;
  /** Remind is offered: the ask is waiting, and a reminder may go now. */
  canRemind: boolean;
  /** "Reminded Tue 27 Oct", once reminded. */
  reminded: string | null;
};

export type ViewGroup = GroupAskFacts & {
  facilitators: ViewFacilitator[];
  /** The asks still to show under the group: every one waiting, or the last of a seat nobody has taken. */
  asks: ViewAsk[];
  /** The uids that facilitate it now, for the picker's ticks. */
  facilitatorUids: string[];
};

export type ViewPerson = {
  uid: string;
  name: string;
  firstName: string;
  detail: string;
  answers: Record<string, string>;
  status: Pick<PersonStatus, "chip" | "note" | "ask">;
};

export type FacilitatorsModel = {
  roundId: string;
  programmeId: string;
  runId: string;
  viewer: "admin" | "lead";
  shortName: string;
  programmeName: string;
  kind: ProgrammeKind;
  headline: string;
  groups: ViewGroup[];
  /** The last email sent to ask somebody, exactly as it went. Null before anybody was asked. */
  email: { firstName: string; toName: string; sent: SentAskEmail } | null;
  training: { day: string; time: string; room: string } | null;
  /** The lead's first name, as an ask is signed. "" for none. */
  leadName: string;
  columns: FacilitatorColumn[];
  people: ViewPerson[];
  asksFacilitating: boolean;
  decisionsSent: boolean;
  /** Today in London, the first day an ask may ask for an answer by. */
  today: string;
  test: { state: "none" | "stale" | "fresh"; replyBy: WallClock | null };
  /** False on a copy of the site that does not know its own address: nothing can be sent. */
  siteAddress: boolean;
};

const ORDER: Record<string, number> = { yes: 0, asked: 1, quiet: 2 };

function siteBase(): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  return base ? base : null;
}

export async function loadFacilitatorsModel(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  now: Date,
): Promise<{ ok: true; model: FacilitatorsModel } | AskRefusal> {
  const context = await askContext(db, actor, roundId, programmeId);
  if (!context.ok) return context;
  const { form, programme, sets, run, groups } = context;

  const [people, runAsks, training, test, lead, accounts] = await Promise.all([
    loadFacilitatorPeople(db, form, sets, programme, actor.uid),
    listRunAsks(db, run.id),
    readTraining(db, run.id),
    readAskTest(db, run.id),
    readRunLead(db, run.id),
    // Names of everybody who facilitates a group, for the groups card.
    (async () => {
      const uids = [...new Set(groups.flatMap((group) => group.facilitatorUids))];
      return uids.length ? db.getAll(...uids.map((uid) => db.collection("users").doc(uid))) : [];
    })(),
  ]);
  const asks = runAsks.filter((ask) => ask.programmeId === programme.id);
  const nameOfAccount = new Map(
    accounts.map((snap) => {
      const name = snap.exists ? snap.data()?.displayName : null;
      return [snap.id, typeof name === "string" && name.trim() ? name.trim() : "NAISI member"] as const;
    }),
  );
  const personOf = new Map(people.map((person) => [person.uid, person] as const));
  const groupNames = new Map(groups.map((group) => [group.id, group.name.trim() || "Untitled group"] as const));
  const stateOf = new Map(asks.map((ask) => [ask.id, askStateOf(ask, runAsks, now)] as const));

  // ---- The groups ----------------------------------------------------------
  const viewGroups: ViewGroup[] = groups.map((group) => {
    const facts = groupAskFacts(run, group, now);
    const groupAsks = asks.filter((ask) => ask.groupId === group.id);
    const facilitators: ViewFacilitator[] = group.facilitatorUids.map((uid) => {
      const yes = groupAsks.find((ask) => ask.uid === uid && ask.answer === "yes");
      return {
        uid,
        name: personOf.get(uid)?.name ?? nameOfAccount.get(uid) ?? "NAISI member",
        chip: yes ? { words: saidYesWords(londonDayOf(yes.answeredAt)), tone: "yes" } : null,
      };
    });
    // Under the group: every ask still waiting, and for each seat nobody has
    // taken and nobody is waiting on, its last ask (a no, or no reply in time).
    const shown = new Map<string, (typeof groupAsks)[number]>();
    const seats = [...new Set(groupAsks.map((ask) => ask.seat))];
    for (const seat of seats) {
      const inSeat = groupAsks
        .filter((ask) => ask.seat === seat)
        .sort((a, b) => (b.askedAt?.getTime() ?? 0) - (a.askedAt?.getTime() ?? 0));
      if (inSeat.some((ask) => stateOf.get(ask.id)?.kind === "yes")) continue;
      const waiting = inSeat.filter((ask) => stateOf.get(ask.id)?.kind === "waiting");
      for (const ask of waiting.length > 0 ? waiting : inSeat.slice(0, 1)) shown.set(ask.id, ask);
    }
    const viewAsks: ViewAsk[] = [...shown.values()]
      .sort((a, b) => (a.askedAt?.getTime() ?? 0) - (b.askedAt?.getTime() ?? 0))
      .map((ask) => {
        const state = stateOf.get(ask.id)!;
        const name = personOf.get(ask.uid)?.name ?? ask.toName ?? "NAISI member";
        const chip: ViewChip =
          state.kind === "waiting"
            ? { words: askedWords(londonDayOf(ask.askedAt)), tone: "asked" }
            : state.kind === "no"
              ? { words: saidNoWords(londonDayOf(ask.answeredAt)), tone: "quiet" }
              : { words: noReplyByWords(dayIn(ask.replyBy.dateKey) ?? ""), tone: "quiet" };
        const remindedLong = !ask.remindedAt || now.getTime() - ask.remindedAt.getTime() >= 12 * 60 * 60 * 1000;
        return {
          id: ask.id,
          uid: ask.uid,
          name,
          firstName: ask.firstName || personOf.get(ask.uid)?.firstName || name,
          seat: ask.seat,
          state: state.kind,
          chip,
          canRemind: state.kind === "waiting" && ask.reminders < 3 && remindedLong,
          reminded: ask.remindedAt ? remindedWords(londonDayOf(ask.remindedAt)) : null,
        };
      });
    return { ...facts, facilitators, asks: viewAsks, facilitatorUids: [...group.facilitatorUids] };
  });

  // The headline counts the people on the groups: those who facilitate, and
  // those asked who have not answered yet ("5 facilitators for 4 groups").
  const counted = new Set<string>();
  for (const group of viewGroups) {
    for (const facilitator of group.facilitators) counted.add(facilitator.uid);
    for (const ask of group.asks) if (ask.state === "waiting") counted.add(ask.uid);
  }

  // ---- The people ----------------------------------------------------------
  const decisionsSent = form.decisionsSentAt !== null;
  const facilitatesByUid = new Map<string, Map<string, string>>();
  for (const group of groups) {
    for (const uid of group.facilitatorUids) {
      const map = facilitatesByUid.get(uid) ?? new Map<string, string>();
      map.set(group.id, group.name.trim() || "Untitled group");
      facilitatesByUid.set(uid, map);
    }
  }
  const ranked = people.map((person) => {
    const status = personStatus(person.uid, {
      programme,
      standing: person.standing,
      role: person.role,
      decisionsSent,
      runAsks: asks,
      facilitates: facilitatesByUid.get(person.uid) ?? new Map(),
      groupNames,
      now,
    });
    const decided = status.askId ? asks.find((ask) => ask.id === status.askId) : undefined;
    const view: ViewPerson = {
      uid: person.uid,
      name: person.name,
      firstName: person.firstName,
      detail: person.detail,
      answers: person.answers,
      status: { chip: status.chip, note: status.note, ask: status.ask },
    };
    // The board's order: said yes, then asked, then said no; then those who
    // may be asked; then those who may not. Within each, by when, then name.
    const band = status.ask === "asked" ? ORDER[status.chip?.tone ?? "quiet"] : status.ask === "button" ? 3 : 4;
    const when = (decided?.answeredAt ?? decided?.askedAt)?.getTime() ?? 0;
    return { view, band, when };
  });
  const viewPeople = ranked
    .sort((a, b) => a.band - b.band || a.when - b.when || a.view.name.localeCompare(b.view.name, "en"))
    .map(({ view }) => view);

  // ---- The email the last person asked got ----------------------------------
  // The board's card is the email of somebody still to answer: the latest ask
  // still waiting, or, with none waiting, the latest ask.
  const sent = [...asks]
    .filter((ask) => ask.delivery !== "sending")
    .sort((a, b) => (b.askedAt?.getTime() ?? 0) - (a.askedAt?.getTime() ?? 0));
  const last = sent.find((ask) => stateOf.get(ask.id)?.kind === "waiting") ?? sent[0];
  const email = last
    ? {
        firstName: last.firstName || personOf.get(last.uid)?.firstName || "",
        toName: last.toName || personOf.get(last.uid)?.name || "",
        sent: last.email,
      }
    : null;

  const standing = askTestStanding(test, programme.id);
  return {
    ok: true,
    model: {
      roundId: form.round.id,
      programmeId: programme.id,
      runId: run.id,
      viewer: context.viewer,
      shortName: programme.shortName,
      programmeName: programme.name,
      kind: programme.kind,
      headline: headlineWords(counted.size, viewGroups.length),
      groups: viewGroups,
      email,
      training: trainingWords(training),
      leadName: lead?.firstName ?? "",
      columns: facilitatorColumns(form, sets),
      people: viewPeople,
      asksFacilitating: form.asksFacilitating,
      decisionsSent,
      today: londonDateKey(now),
      test: { state: standing.state, replyBy: standing.state === "none" ? null : standing.replyBy },
      siteAddress: siteBase() !== null,
    },
  };
}

/** The site's own address, for the link in an ask's email. Null when it does not know it. */
export function askLinkFor(askId: string): string | null {
  const base = siteBase();
  return base ? `${base}/learn/facilitate/${encodeURIComponent(askId)}` : null;
}
