import { own } from "@/lib/applications/keys";
import type { CourseRunStatus } from "@/lib/firestore/courses";
import { namedByNoneWords, namedOnWords, runStageLabel, type RunProgrammes } from "./words";

/**
 * WHAT ONE RUN'S ROW ON A COURSE'S PAGE SAYS, AND WHERE IT LEADS.
 *
 *  - A run a programme names, for a reader its Overview opens for (an admin,
 *    the programme's lead): "Running · named on …" and Open the programme.
 *  - The same run for anybody else on the page (a course drafter or approver
 *    who does not lead it): the same line, and Open the run, to the run's
 *    older page, so nobody loses the way in before the older pages forward.
 *  - A run no programme names: "… · no programme names it" and Open the run.
 *  - When the server could not say which programme names each run
 *    (`programmes` is null): the stage alone, and Open the run.
 */
export type RunRowView = {
  line: string;
  opens: { kind: "programme"; href: string } | { kind: "older-run" };
};

export function runRowView(run: { id: string; status: CourseRunStatus }, programmes: RunProgrammes | null): RunRowView {
  if (programmes === null) return { line: runStageLabel(run.status), opens: { kind: "older-run" } };
  const programme = own(programmes, run.id) ?? null;
  if (!programme) return { line: namedByNoneWords(run.status), opens: { kind: "older-run" } };
  return {
    line: namedOnWords(run.status, programme.name),
    opens: programme.href ? { kind: "programme", href: programme.href } : { kind: "older-run" },
  };
}
