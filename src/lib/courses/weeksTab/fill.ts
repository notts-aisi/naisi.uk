import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { normalizeCourseWeek, sanitizeWeekPlan, weekDocId } from "@/lib/firestore/courses";
import { templateWeekFields } from "@/lib/firestore/courseTemplates";

/**
 * COPYING A SAVED TEMPLATE INTO THE WEEKS OF A RUN THAT ARE EMPTY, and
 * nowhere else: the copy "Copy weeks from the course" always asks for
 * (`POST /api/courses/runs/[runId]/apply-template` with `fill: true`).
 *
 * The page's first sentence is the promise: "Copying fills weeks that are
 * empty. A week with anything in it is left as it is." So a week is written
 * only when it is EMPTY (`weekIsEmpty`), no week is ever deleted, and the
 * run's week plan is never touched. It copies weeks and nothing else: never
 * the run's Start here or Glossary (an admin loads those from the Weeks tab's
 * Course documents card), because members read those two as soon as they
 * exist, with no publish step between.
 *
 * ## What "empty" means
 *
 * Week N of the run is its document `weekDocId(N)` (the addressing doctrine
 * every member page reads by). It is empty when BOTH hold:
 *
 *  - the run has no document there, or the document there holds nothing but
 *    its number and when and by whom it was last written (`weekNumber`,
 *    `updatedAt`, `updatedByUid`, `createdAt`, `createdByUid`): every other
 *    field it carries is an empty string, an empty list, an empty map, null,
 *    false or 0. So a week with a title and nothing else is NOT empty, nor
 *    one with a summary, a question, minutes, blocks, readings, exercises, a
 *    checklist or guide prose, nor one that is published, marked ready,
 *    ticked as pitching week, given an owner or a way it meets; and
 *  - no group of the run, archived or not, has its own copy of that week
 *    (`courseGroups/{groupId}/weeks/wNN`), whatever the copy holds.
 *
 * ## Where each of the template's weeks goes
 *
 * The template's week N is its document `wNN`, kept at the id it was saved
 * from (`courseTemplates.ts`: ids are preserved, always), so it goes to the
 * run's `wNN`, which is week N on the run as on every page. A template week
 * that holds nothing (`templateWeekIsEmpty`) is never written and never
 * counted. One that holds something goes only where week N is a taught week
 * of the run's plan: one past the run's last week, or with an id that names
 * no week, is not copied (the answer counts it as `extra`), because a
 * document outside the plan is a week nobody is shown and an address the
 * week plan would then find taken.
 *
 * Each week is written with the template's content through the one copy
 * shape (`templateWeekFields`), with the number of its address, NOT
 * PUBLISHED (a week copied into a running term is never shown to anybody
 * before the lead marks it ready, which publishes it), and with who wrote it
 * and when. Its Ready, pitching week, owner and way it meets are the run's
 * own, so they are not written at all.
 *
 * The run is stamped with the template it came from (`templateId`,
 * `templateLabel`) only when it carries no such stamp yet and a week was
 * written.
 *
 * ## One transaction
 *
 * The run, every week it reads and every group's copies are read in the same
 * transaction as the writes, so a lead saving a week while the copy runs
 * either lands first (and the copy leaves that week) or lands on the week
 * the copy wrote. Nobody is emailed.
 */

/** The fields a week document may carry while holding nothing. */
export const BOOKKEEPING_FIELDS: readonly string[] = ["weekNumber", "updatedAt", "updatedByUid", "createdAt", "createdByUid"];

/** "w01" to "w60". */
const WEEK_ID = /^w(\d{2})$/;

/** A stored value with nothing in it: an empty string, list or map, null, false or 0. */
export function holdsNothing(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === 0) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

/** The run's week document holds nothing: absent, or only its number and stamps beside empty fields. */
export function weekDocIsEmpty(data: Record<string, unknown> | undefined | null): boolean {
  if (!data) return true;
  return Object.entries(data).every(([field, value]) => BOOKKEEPING_FIELDS.includes(field) || holdsNothing(value));
}

/**
 * A template's week holds nothing: what `weekDocIsEmpty` says of a run's
 * page, with `published` set aside, since a saved week carries its source's
 * flag and the copy never writes it.
 */
export function templateWeekIsEmpty(data: Record<string, unknown> | undefined | null): boolean {
  if (!data) return true;
  const { published, ...rest } = data;
  void published;
  return weekDocIsEmpty(rest);
}

/** The week number a template's week document is saved under, or null for an id that names no week. */
export function weekNumberOfTemplateId(id: string): number | null {
  const match = WEEK_ID.exec(id);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 60 ? n : null;
}

/** One of the template's weeks, as read. */
export type TemplateWeek = { id: string; data: Record<string, unknown> };

/** What a fill did, in week numbers. */
export type FillOutcome = {
  /** Weeks written, lowest first. */
  copied: number[];
  /** Weeks of the template the run had something in, left as they were. */
  left: number[];
  /** How many of the template's weeks that hold something have no taught week on the run to go into. */
  extra: number;
  /** How many taught weeks the run's plan has. */
  planWeeks: number;
};

/** Thrown out of the transaction to refuse with a status. */
export class FillRefusal extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FillRefusal";
  }
}

/**
 * Copy `weeks` (the template's, read already: a template is never written
 * after it is saved) into the empty weeks of run `runId`, in one transaction.
 */
export async function fillEmptyWeeks(
  db: Firestore,
  input: {
    runId: string;
    template: { id: string; label: string };
    weeks: readonly TemplateWeek[];
    actorUid: string;
  },
): Promise<FillOutcome> {
  const { runId, template, weeks, actorUid } = input;
  const runRef = db.collection("courseRuns").doc(runId);
  const targetWeeks = runRef.collection("weeks");
  const byNumber = new Map<number, TemplateWeek>();
  let unaddressed = 0;
  for (const week of weeks) {
    if (templateWeekIsEmpty(week.data)) continue;
    const n = weekNumberOfTemplateId(week.id);
    if (n === null) unaddressed += 1;
    else if (!byNumber.has(n)) byNumber.set(n, week);
  }

  return db.runTransaction(async (tx) => {
    // ---- READS, every one before the first write.
    const runSnap = await tx.get(runRef);
    if (!runSnap.exists) throw new FillRefusal("Run not found", 404);
    const raw = (runSnap.data() ?? {}) as Record<string, unknown>;
    if (raw.destroying === true) throw new FillRefusal("This run is being destroyed and can’t be edited.", 409);

    const taught = new Set<number>();
    for (const entry of sanitizeWeekPlan(raw.weekPlan)) if (entry.kind === "week") taught.add(entry.weekNumber);

    const numbers = [...byNumber.keys()].sort((a, b) => a - b);
    const candidates = numbers.filter((n) => taught.has(n));
    const extra = numbers.filter((n) => !taught.has(n));

    const refs = candidates.map((n) => targetWeeks.doc(weekDocId(n)));
    const stored = refs.length > 0 ? await tx.getAll(...refs) : [];
    // Every group's own copies of a week, by id: one equality on one field
    // for the groups, then each group's copies, ids only.
    const groups = await tx.get(db.collection("courseGroups").where("runId", "==", runId));
    const copied = new Set<string>();
    for (const group of groups.docs) {
      const copies = await tx.get(group.ref.collection("weeks").select());
      for (const copy of copies.docs) copied.add(copy.id);
    }

    const writes: { ref: DocumentReference; data: Record<string, unknown> }[] = [];
    const written: number[] = [];
    const left: number[] = [];
    candidates.forEach((n, i) => {
      const snap = stored[i];
      const data = snap && snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : undefined;
      const id = weekDocId(n);
      if (!weekDocIsEmpty(data) || copied.has(id)) {
        left.push(n);
        return;
      }
      const source = byNumber.get(n) as TemplateWeek;
      const week = normalizeCourseWeek(source.id, source.data);
      writes.push({
        ref: refs[i],
        data: {
          ...templateWeekFields(week),
          weekNumber: n,
          published: false,
          updatedAt: FieldValue.serverTimestamp(),
          updatedByUid: actorUid,
        },
      });
      written.push(n);
    });

    // ---- WRITES. Nothing above may follow one.
    for (const write of writes) tx.set(write.ref, write.data);

    // The run's own document: only the template it came from, the first time
    // a week of one is written. Never its Start here or Glossary.
    const stamped = typeof raw.templateId === "string" && raw.templateId !== "";
    if (!stamped && written.length > 0) {
      tx.update(runRef, { templateId: template.id, templateLabel: template.label, updatedAt: FieldValue.serverTimestamp() });
    }

    return { copied: written, left, extra: extra.length + unaddressed, planWeeks: taught.size };
  });
}
