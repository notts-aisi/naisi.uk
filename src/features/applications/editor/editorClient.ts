"use client";

import type { EmailWording, ProgrammeEmailKind, ProgrammeKind, QuestionSetScope, QuestionType } from "@/lib/applications/model";
import type {
  FormStaffView,
  ProgrammeSetupView,
  QuestionSetView,
} from "@/lib/applications/editor/views";

/**
 * The editor's one door to its routes.
 *
 * The form, its question sets and each programme's settings are closed to the
 * browser, so everything the editor reads or saves is a route call, and every
 * call goes through here. A refusal is thrown as an `Error` carrying the
 * server's own sentence: the routes answer with words a person can act on, and
 * writing them again in the browser would be two sets of words for one
 * refusal.
 */

export class EditorApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EditorApiError";
    this.status = status;
  }
}

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload: Record<string, unknown> = {};
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    /* an empty body, or a proxy's error page */
  }
  if (!res.ok) {
    const message =
      typeof payload.error === "string" && payload.error
        ? payload.error
        : `That did not save (${res.status}).`;
    throw new EditorApiError(message, res.status);
  }
  return payload as T;
}

const base = (roundId: string) => `/api/admissions/forms/${encodeURIComponent(roundId)}`;

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export function fetchForms(): Promise<{ forms: FormStaffView[]; canCreate: boolean }> {
  return call("/api/admissions/forms");
}

/** The ids of the application forms this caller can open. Empty when the list cannot be read. */
export async function fetchApplicationFormIds(): Promise<Set<string>> {
  try {
    const { forms } = await fetchForms();
    return new Set(forms.map((form) => form.id));
  } catch {
    return new Set();
  }
}

export function createForm(label: string): Promise<{ id: string }> {
  return call("/api/admissions/forms", "POST", { label });
}

/** A London date and wall clock, as two form controls hold them. */
export type MomentInput = { date: string; time: string } | null;

export type FormPatch = {
  label?: string;
  opens?: MomentInput;
  closes?: MomentInput;
  decisions?: string | null;
  replyBy?: string | null;
  asksFacilitating?: boolean;
  programmeIds?: string[];
  addProgramme?: { name: string; shortName: string; kind: ProgrammeKind };
};

export function patchForm(
  roundId: string,
  patch: FormPatch,
): Promise<{ form: FormStaffView; addedProgrammeId: string | null }> {
  return call(base(roundId), "PATCH", patch);
}

// ---------------------------------------------------------------------------
// Question sets
// ---------------------------------------------------------------------------

export type EditorPayload = { form: FormStaffView; sets: QuestionSetView[] };

export function createSet(
  roundId: string,
  input: { label: string; scope: QuestionSetScope },
): Promise<EditorPayload & { id: string }> {
  return call(`${base(roundId)}/sets`, "POST", input);
}

/** One question as the editor sends it. `id` is null for a question the server has not stored yet. */
export type QuestionPatch = {
  id: string | null;
  text: string;
  help: string;
  type: QuestionType;
  options: string[];
  optionsFromRanking: boolean;
  wordLimit: number | null;
  required: boolean;
  scored: boolean;
};

export function patchSet(
  roundId: string,
  setId: string,
  patch: { label?: string; intro?: string; questions?: QuestionPatch[] },
): Promise<{ set: QuestionSetView }> {
  return call(`${base(roundId)}/sets/${encodeURIComponent(setId)}`, "PATCH", patch);
}

export function deleteSet(roundId: string, setId: string): Promise<EditorPayload> {
  return call(`${base(roundId)}/sets/${encodeURIComponent(setId)}`, "DELETE");
}

// ---------------------------------------------------------------------------
// One programme
// ---------------------------------------------------------------------------

export type ProgrammePatch = {
  name?: string;
  shortName?: string;
  pitch?: string;
  facts?: string;
  starts?: string;
  places?: number | null;
  groupCount?: number | null;
  groupSize?: string;
  useScores?: boolean;
  closed?: boolean;
  /** A course's id, or null for no course page. */
  courseId?: string | null;
  emailWording?: Partial<Record<ProgrammeEmailKind, EmailWording | null>>;
};

const programmeUrl = (roundId: string, programmeId: string) =>
  `${base(roundId)}/programmes/${encodeURIComponent(programmeId)}`;

export function patchProgramme(
  roundId: string,
  programmeId: string,
  patch: ProgrammePatch,
): Promise<{ programme: ProgrammeSetupView }> {
  return call(programmeUrl(roundId, programmeId), "PATCH", patch);
}

export function putProgrammeRoles(
  roundId: string,
  programmeId: string,
  change: { leadUid?: string | null; reviewerUids?: string[] },
): Promise<{ programme: ProgrammeSetupView }> {
  return call(`${programmeUrl(roundId, programmeId)}/roles`, "PUT", change);
}
