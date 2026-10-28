import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { askClaudeForJson, claudeConfigured } from "@/lib/ai/claude";
import type { SessionUser } from "@/lib/firebase/session";
import { admissionAssessmentId, ASSESSMENTS_COLLECTION } from "@/lib/firestore/admissionAssessments";
import { compareGroupsByMeeting } from "@/lib/firestore/courseGroups";
import { nextGroupName } from "@/lib/courses/groupTimes/rules";
import { canRunTerm } from "../access";
import { storedReadFor } from "../assessment/stored";
import { own } from "../keys";
import { loadForm } from "../repo";
import { NOT_FOUND, refuse } from "../review/refusals";
import type { Refusal } from "../review/types";
import {
  applyChoice,
  choiceFrom,
  choiceInputFrom,
  siteOption,
  type AppliedChoice,
  type ReadNote,
} from "./advice";
import { loadArranging, loadPreviewArranging, type Arranging } from "./load";
import { candidatePlans, MAX_OPTIONS, type Strength } from "./options";
import { canMake } from "./plan";
import { loadFirstNames } from "../decisionDay/people";
import type { ArrangementOptionsView, RingGroup, RingOption, RingPerson } from "./view";

/**
 * SEVERAL ARRANGEMENTS OF A PROGRAMME'S PEOPLE INTO GROUPS, for an admin:
 * the options `./options.ts` works out, then, when Claude is set up and the
 * admin asks, Claude's ranking of them with pros and cons, a reason for each
 * group, a facilitator for each and any moves, kept only where the rules
 * allow (`./advice.ts`).
 *
 * After decision day it arranges the people holding a place
 * (`loadArranging`); before it, the people the decisions as they stand place
 * on the programme, as a preview with the viewer's own application left out
 * (`loadPreviewArranging`).
 *
 * NOTHING IS WRITTEN AND NOTHING IS STORED: the admin reads the options,
 * moves people on the screen, and Apply places them through the site's own
 * routes. Nobody is emailed until Publish.
 *
 * WHAT CLAUDE IS ASKED TO WEIGH IN A FACILITATOR (the committee's choice, 28
 * October 2026): somebody who might help run the society one day, judged on
 * their values and how they engage, not only on their fit for the programme.
 * Thin or brief answers count against them. Whether anything was written with
 * AI is not Claude's to judge, and it is not told what Pangram found: a
 * Pangram flag is shown beside each person for the admin to weigh, because
 * the privacy policy promises it is a reason for a person to look again and
 * never a finding on its own.
 */

const SYSTEM = `You help the committee of NAISI, the Nottingham AI Safety Initiative (a student society at the University of Nottingham), arrange the people on one of its programmes into weekly discussion groups, and choose who facilitates each group.

You are given the people, numbered ("Applicant 3"), with your own earlier read of each person's application, and several workable arrangements ("Option A", "Option B"), each with groups ("Group A1") at set weekly times. Under each option you are told which of that option's other groups each person can make. Every option already fits everybody's times. An admin compares your view with their own and decides; nothing you write is sent to anybody.

What to do:
- Rate each person who offered to facilitate, and anybody else who stands out, as a possible facilitator: high, medium or low, with one sentence why. We want facilitators who might help run the society one day: judge their values, their care about AI safety, how thoughtfully and generously they engage, and their initiative, not only how well they fit the programme. Thin or brief answers count against them. Do not judge whether anything was written with AI.
- Pick the options worth the admin's time, at most five, ranked best first. For each: a short title, pros and cons (times, sizes, how evenly the strongest facilitators are spread, the mix of each group, anybody only near their time or not placed), a sentence for every group on why its people suit each other, and a lead facilitator for every group.
- One facilitator per group. Spread the strongest across the groups: never two strong facilitators in one group while another group has a weak one or none.
- A lead should usually be somebody who offered. You may pick somebody who did not offer when they clearly stand out; for that group, also name a second facilitator who did offer, as their back-up.
- You may suggest moves within an option to improve a group's mix or put a facilitator where they are needed. Only move somebody to a group in the same option that they can make, and never somebody already told their group.
- Say which option you prefer and why.
- Do not use or guess at personal characteristics such as age, gender, nationality or health.
- Refer to people, groups and options only by their labels. Be brief, in British English, and never use an em dash or an en dash.`;

const person = (extra: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(extra),
  properties: extra,
});

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["potential", "options", "preferred", "preferredWhy", "notes"],
  properties: {
    potential: {
      type: "array",
      items: person({
        applicant: { type: "string" },
        level: { type: "string", enum: ["high", "medium", "low"] },
        why: { type: "string", description: "One sentence." },
      }),
    },
    options: {
      type: "array",
      items: person({
        option: { type: "string", description: 'The option\'s label: "Option B".' },
        rank: { type: "integer", description: "1 for the best." },
        title: { type: "string", description: "A few words." },
        pros: { type: "array", items: { type: "string" } },
        cons: { type: "array", items: { type: "string" } },
        groups: {
          type: "array",
          items: person({
            group: { type: "string", description: 'The group\'s label: "Group B2".' },
            why: { type: "string", description: "One or two sentences on why these people suit each other." },
            facilitator: { type: "string", description: 'The lead\'s label, or "" for nobody suitable.' },
            facilitatorWhy: { type: "string" },
            second: { type: "string", description: 'Only beside a lead who did not offer: a back-up who did, or "".' },
            secondWhy: { type: "string" },
          }),
        },
        moves: {
          type: "array",
          items: person({ applicant: { type: "string" }, to: { type: "string" }, why: { type: "string" } }),
        },
      }),
    },
    preferred: { type: "string", description: "The option you prefer, by label." },
    preferredWhy: { type: "string", description: "Two or three sentences." },
    notes: { type: "string", description: "Anything else the admin should know, in a sentence or two." },
  },
};

type Note = { read: ReadNote; flags: number | null };

/** Claude's earlier read for this programme, and how many answers Pangram thought worth a look, for each person. */
async function notesFor(db: Firestore, roundId: string, programmeId: string, uids: readonly string[]): Promise<Map<string, Note>> {
  const notes = new Map<string, Note>();
  for (let i = 0; i < uids.length; i += 100) {
    const refs = uids.slice(i, i + 100).map((uid) => db.collection(ASSESSMENTS_COLLECTION).doc(admissionAssessmentId(roundId, uid)));
    if (refs.length === 0) continue;
    for (const snap of await db.getAll(...refs)) {
      const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
      const uid = typeof data?.uid === "string" ? data.uid : "";
      if (!data || !uids.includes(uid)) continue;
      const read = storedReadFor(data, programmeId);
      // A check with an answer Pangram could not take is not a check.
      const pangram = data.pangram as { answers?: unknown; failed?: unknown } | null | undefined;
      const flags =
        pangram && Array.isArray(pangram.answers) && !(Array.isArray(pangram.failed) && pangram.failed.length > 0)
          ? (pangram.answers as { worthALook?: unknown }[]).filter((answer) => answer?.worthALook === true).length
          : null;
      notes.set(uid, {
        read:
          read && typeof read.summary === "string"
            ? {
                lean: read.lean ?? null,
                summary: read.summary,
                strengths: Array.isArray(read.strengths) ? read.strengths : [],
                concerns: Array.isArray(read.concerns) ? read.concerns : [],
                thin: Array.isArray(read.thinAnswers) ? read.thinAnswers.length : 0,
              }
            : null,
        flags,
      });
    }
  }
  return notes;
}

const LEAN_STRENGTH = { strong: 3, borderline: 2, weak: 1 } as const;

/**
 * The site's guess at who might lead a group, before Claude: 0 for somebody
 * who did not offer, else the lean of Claude's earlier read (2 unread), one
 * less for two or more thin answers. Never anything Pangram said.
 */
function strengthOf(arranging: Arranging, notes: ReadonlyMap<string, Note>): Strength {
  const strength = new Map<string, number>();
  for (const [uid, person] of arranging.people) {
    if (!person.facilitates) {
      strength.set(uid, 0);
      continue;
    }
    const read = notes.get(uid)?.read ?? null;
    const lean = read?.lean ? (own(LEAN_STRENGTH, read.lean) ?? 2) : 2;
    strength.set(uid, Math.max(1, lean - (read && read.thin >= 2 ? 1 : 0)));
  }
  return strength;
}

export type ArrangementOptionsResult = { ok: true; arrangement: ArrangementOptionsView } | Refusal;

const LETTERS = "ABCDEFGH";
const reviewerWords = (text: string) => text.replace(/\bReviewer [A-Z]\b/g, "a reviewer");

export async function arrangeOptions(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  wanted: { minutes?: unknown; size?: unknown; askClaude: boolean },
): Promise<ArrangementOptionsResult> {
  if (!canRunTerm(user)) return refuse(403, "Only an admin can ask for an arrangement.");
  const form = await loadForm(db, roundId);
  if (!form) return NOT_FOUND;
  const loaded =
    form.decisionsSentAt === null
      ? await loadPreviewArranging(db, user, roundId, programmeId, wanted)
      : await loadArranging(db, user, roundId, programmeId, wanted);
  if (!loaded.ok) return loaded;
  const { arranging } = loaded;
  const uids = [...arranging.people.keys()];
  // The run's groups that have facilitators already, and their names for the rings.
  const staffedCount = new Map([...arranging.groups.values()].map((group) => [group.id, group.facilitatorUids.length] as const));
  const staffed = new Set([...staffedCount].filter(([, count]) => count > 0).map(([id]) => id));
  const [notes, facilitatorNames] = await Promise.all([
    notesFor(db, roundId, programmeId, uids),
    loadFirstNames(db, [...new Set([...arranging.groups.values()].flatMap((group) => group.facilitatorUids))]),
  ]);
  const strength = strengthOf(arranging, notes);
  const candidates = candidatePlans({
    people: [...arranging.people.values()],
    groups: arranging.arrangeGroups,
    best: arranging.best,
    minutes: arranging.minutes,
    size: arranging.size,
    names: (taken) => nextGroupName([...taken]),
    strength,
  });

  let applied: AppliedChoice = {
    options: candidates.slice(0, MAX_OPTIONS).map((candidate, index) => siteOption(candidate, index, arranging.people, strength, staffed)),
    potential: new Map(),
    preferredWhy: "",
    notes: "",
    dropped: [],
  };
  let asked = false;
  // Labels back to names: people, and each option's groups by the name the plan gave them.
  let named = (text: string) => text;

  if (wanted.askClaude && claudeConfigured() && candidates.length > 0) {
    const input = choiceInputFrom({
      programmeName: arranging.programmeName,
      candidates,
      people: arranging.people,
      reads: new Map([...notes].map(([uid, note]) => [uid, note.read])),
      kept: new Set(candidates[0].plan.keptUids),
      staffed: staffedCount,
    });
    const answer = await askClaudeForJson({
      system: SYSTEM,
      message: input.message,
      schema: SCHEMA,
      effort: "medium",
      maxTokens: 20_000,
      timeoutMs: 240_000,
    });
    if (!answer.ok) return { ok: false, status: 500, error: answer.reason };
    const choice = choiceFrom(answer.value);
    if (!choice) return { ok: false, status: 500, error: "Claude’s answer couldn’t be read. Try again." };
    applied = applyChoice(candidates, arranging.people, strength, input, choice, staffed);
    asked = true;
    // Each option is shown under the letter of its place in Claude's order.
    const shownAs = new Map(applied.options.map((option, index) => [option.candidate, LETTERS[index]] as const));
    named = (text: string) =>
      text
        .replace(/\bApplicant (\d+)\b/g, (w) => arranging.people.get(own(input.applicants, w) ?? "")?.name ?? w)
        .replace(/\bGroup ([A-H]\d+)\b/g, (w) => {
          const at = own(input.groups, w);
          return at ? (candidates.at(at[0])?.plan.groups.at(at[1])?.name ?? w) : w;
        })
        .replace(/\bOption ([A-H])\b/g, (w) => {
          const index = own(input.optionAt, w);
          const letter = index === undefined ? undefined : shownAs.get(index);
          return letter ? `Option ${letter}` : w;
        });
  }

  const everybody = [...arranging.people.values()];
  const options: RingOption[] = applied.options.map((option, index) => {
    const key = LETTERS[index];
    const groups: RingGroup[] = option.plan.groups
      .map((group, g) => ({ group, g }))
      .sort((a, b) => compareGroupsByMeeting(a.group, b.group))
      .map(({ group, g }, shownAt) => {
        const live = group.id ? arranging.groups.get(group.id) : undefined;
        return {
          key: `${key}${shownAt + 1}`,
          id: group.id,
          name: group.name,
          session: group.session,
          timeIsNew: group.timeIsNew,
          room: group.room,
          memberUids: [...group.memberUids],
          facilitators: option.groups.at(g)!.facilitators.map((f) => ({ ...f, why: named(f.why) })),
          why: named(option.groups.at(g)!.why),
          canMake: everybody.filter((person) => canMake(person, group.session)).map((person) => person.uid).sort(),
          existing: live
            ? {
                facilitatorUids: [...live.facilitatorUids],
                facilitatorNames: live.facilitatorUids.map((uid) => facilitatorNames.get(uid) || "A facilitator"),
                slot: { weekday: live.session.weekday, start: live.session.startTimeLocal },
              }
            : null,
        };
      });
    return {
      key,
      title: named(option.title),
      pros: option.pros.map(named),
      cons: option.cons.map(named),
      preferred: option.preferred,
      size: candidates[option.candidate]?.size ?? arranging.size,
      groups,
      unplaced: option.plan.unplaced,
      nearUids: [...option.plan.nearUids],
      movedUids: option.movedUids,
    };
  });

  const people: Record<string, RingPerson> = {};
  for (const person of everybody) {
    const note = notes.get(person.uid);
    const read = note?.read ?? null;
    people[person.uid] = {
      uid: person.uid,
      name: person.name,
      href: `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications/${encodeURIComponent(person.uid)}`,
      offered: person.facilitates,
      told: person.told,
      littleMarked: person.week.kind === "given" && person.week.minimal === true,
      potential: (() => {
        const said = applied.potential.get(person.uid);
        return said ? { level: said.level, why: named(said.why) } : null;
      })(),
      flags: note?.flags ?? null,
      read: read
        ? {
            lean: read.lean,
            summary: reviewerWords(read.summary),
            strengths: read.strengths.map(reviewerWords),
            concerns: read.concerns.map(reviewerWords),
            thin: read.thin,
          }
        : null,
    };
  }

  return {
    ok: true,
    arrangement: {
      runId: arranging.runId,
      preview: arranging.preview,
      programmeName: arranging.programmeName,
      programmeShortName: arranging.programmeShortName,
      minutes: arranging.minutes,
      size: arranging.size,
      people,
      options,
      asked,
      preferredWhy: named(applied.preferredWhy),
      notes: named(applied.notes),
      dropped: applied.dropped.map((entry) => ({ suggestion: named(entry.suggestion), why: named(entry.why) })),
      claudeConfigured: claudeConfigured(),
    },
  };
}
