import OlderEditorLine from "@/features/courses/olderEditor/OlderEditorLine";
import { namingProgrammeOf } from "@/lib/courses/olderEditor/naming";
import { programmePath } from "@/lib/courses/weeksTab/paths";
import { requireCourseAuthorPage } from "@/lib/firebase/pageGates";

/**
 * Every page of one run in the older course editor (the run, its weeks, its
 * applications, its allocation board and its retrospective) opens with the
 * line that says the editor is being retired, and, on a run a programme
 * names, the way to that programme's Overview. It asks the courses tree's
 * own question (`requireCourseAuthorPage`, the gate `courses/layout.tsx`
 * calls) before it reads which programme names the run.
 */
export default async function OlderRunLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ courseId: string; runId: string }>;
}) {
  await requireCourseAuthorPage();
  const { runId } = await params;
  const naming = await namingProgrammeOf(runId);
  const programme = naming
    ? { name: naming.shortName, href: `${programmePath(naming.roundId, naming.programmeId)}/overview` }
    : null;
  return (
    <>
      <OlderEditorLine programme={programme} />
      {children}
    </>
  );
}
