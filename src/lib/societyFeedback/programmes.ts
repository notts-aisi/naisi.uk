import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { listForms } from "@/lib/applications/handover/run";
import { own } from "@/lib/applications/keys";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { lastTaughtWeek } from "@/lib/courses/weekPlan";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { chooseTerm } from "@/lib/surveys/term/choose";
import { dayOf, isRecordId, type NamedProgramme } from "./model";

/**
 * THE PROGRAMMES THE FORM OFFERS: this term's (`chooseTerm`, the form whose
 * decisions went out most recently), each that names a course run, with how
 * many weeks its run has, so "Which session?" offers its weeks.
 *
 * READS: every application form (one query), then one run record per
 * programme that names a run. Nothing about the reader is read here.
 */

/** A programme's name as members know it: its short name, or its name. */
function nameOf(settings: { shortName: string; name: string }): string {
  return settings.shortName.trim() || settings.name.trim();
}

async function weeksOf(db: Firestore, runId: string): Promise<number | null> {
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists) return null;
  return lastTaughtWeek(normalizeCourseRun(snap.id, snap.data() ?? {}).weekPlan);
}

/** One programme of a loaded form, when it names a run; null otherwise. */
async function namedProgramme(db: Firestore, form: ApplicationForm, programmeId: string): Promise<NamedProgramme | null> {
  const settings = own(form.programmes, programmeId);
  if (!settings || !settings.runId || !isRecordId(settings.runId)) return null;
  const name = nameOf(settings);
  if (!name) return null;
  return { roundId: form.round.id, programmeId, name, weeks: await weeksOf(db, settings.runId) };
}

/** This term's programmes, in the form's own order; none before any form has opened. */
export async function termProgrammes(db: Firestore, now: Date): Promise<NamedProgramme[]> {
  const form = chooseTerm(await listForms(db), now);
  if (!form) return [];
  const found = await Promise.all(form.programmeIds.map((programmeId) => namedProgramme(db, form, programmeId)));
  return found.filter((programme): programme is NamedProgramme => programme !== null);
}

/**
 * The programme a sender named, found again on the server so the name kept
 * is the form's and not the sender's: one form read and one run read. Null
 * when the form or the programme is not there, or names no run.
 */
export async function findProgramme(db: Firestore, roundId: string, programmeId: string): Promise<NamedProgramme | null> {
  if (!isRecordId(roundId) || !isRecordId(programmeId)) return null;
  const form = await loadForm(db, roundId);
  if (!form || !form.programmeIds.includes(programmeId)) return null;
  return namedProgramme(db, form, programmeId);
}

/** When this term began, as a London day, for the admins' page; null before any form has opened. */
export async function termStart(db: Firestore, now: Date): Promise<{ day: string } | null> {
  const form = chooseTerm(await listForms(db), now);
  const opensAt = form?.round.opensAt ?? null;
  if (!opensAt) return null;
  return { day: dayOf(opensAt) };
}
