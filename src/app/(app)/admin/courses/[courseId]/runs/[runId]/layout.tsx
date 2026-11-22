import OlderEditorLine from "@/features/courses/olderEditor/OlderEditorLine";
import { namingProgrammeOf } from "@/lib/courses/olderEditor/naming";
import { programmePath } from "@/lib/courses/weeksTab/paths";

/**
 * Every page of one run in the older course editor (the run, its weeks, its
 * applications, its allocation board and its retrospective) opens with the
 * line that says the editor is being retired, and, on a run a programme
 * names, the way to that programme's Overview. The gate is the courses
 * tree's (`courses/layout.tsx`); this layout adds nothing to it.
 */
export default async function OlderRunLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ courseId: string; runId: string }>;
}) {
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
