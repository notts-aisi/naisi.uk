import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { opensProgrammeGroups, roleOnProgramme } from "@/lib/applications/access";
import { listForms } from "@/lib/applications/handover/run";
import { own } from "@/lib/applications/keys";
import { programmePath } from "@/lib/courses/weeksTab/paths";
import { namingProgrammeIn } from "@/lib/courses/programmeLead";
import { isAddressableId } from "@/lib/addressableId";
import { holdsStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { canAuthorAdmissionRound } from "@/lib/firestore/users";
import { programmeNameWords, type RunProgrammes } from "./words";

/**
 * THE PROGRAMME THAT NAMES EACH RUN OF ONE COURSE, FOR THE RUNS CARD ON THE
 * COURSE'S OWN PAGE, and whether this reader may open it.
 *
 * Read on the server, by the page, after the courses tree's gate
 * (`requireCourseAuthorPage`) has let the reader in. The forms are read once
 * (`listForms`, the hand-over's own read) and each run of the course is put
 * to `namingProgrammeIn`, the answer `readNamingProgramme` gives: one
 * programme, or nobody when none names it or more than one does.
 *
 * WHAT IS HANDED TO THE PAGE, per run a programme names: the programme's
 * name and its term ("AGI Strategy, Autumn 2026"), and the programme's
 * Overview only for a reader the Overview opens for. That is the Overview's
 * own two questions: the admissions tree's page gate (the predicate
 * `requireAdmissionsPage` applies, as Search and Home ask it before they
 * offer a link into that tree) and the programme's role (`roleOnProgramme`,
 * then `opensProgrammeGroups`: an admin or the programme's lead). Nothing
 * else of the form leaves the server: no lead, no reviewer, no uid.
 *
 * A run no programme names is absent from the answer. Null when the read
 * fails, so the card says only each run's stage rather than something wrong.
 */
export async function readRunProgrammes(
  db: Firestore,
  reader: SessionUser,
  courseId: string,
): Promise<RunProgrammes | null> {
  if (!isAddressableId(courseId)) return {};
  try {
    const [runs, forms] = await Promise.all([
      db.collection("courseRuns").where("courseId", "==", courseId).get(),
      listForms(db),
    ]);
    const opensAdmissions =
      canAuthorAdmissionRound(reader) ||
      (reader.admissionsReviewer === true && holdsStanding(reader, "admissionRounds.reviewerUids"));
    const out: RunProgrammes = {};
    for (const run of runs.docs) {
      const naming = namingProgrammeIn(forms, run.id);
      if (!naming) continue;
      const form = forms.find((each) => each.round.id === naming.roundId);
      const programme = form ? own(form.programmes, naming.programmeId) : null;
      if (!form || !programme) continue;
      const opens = opensAdmissions && opensProgrammeGroups(roleOnProgramme(reader, form, naming.programmeId));
      out[run.id] = {
        name: programmeNameWords(programme.shortName.trim() || programme.name, form.round.label),
        href: opens ? `${programmePath(naming.roundId, naming.programmeId)}/overview` : null,
      };
    }
    return out;
  } catch {
    return null;
  }
}
