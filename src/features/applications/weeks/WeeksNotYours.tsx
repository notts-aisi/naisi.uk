import { Refusal } from "@/features/applications/editor/Refusals";
import { programmePath } from "@/lib/courses/weeksTab/paths";
import { WEEKS_NOT_YOURS, WEEKS_NOT_YOURS_TITLE } from "@/lib/courses/weeksTab/words";

/**
 * What somebody with a role on a programme who is neither an admin nor its
 * lead (a reviewer) is shown on its Weeks tab, before the run is read, with
 * the way back to the applications they are here for.
 */
export default function WeeksNotYours({ roundId, programmeId }: { roundId: string; programmeId: string }) {
  return (
    <Refusal title={WEEKS_NOT_YOURS_TITLE} href={`${programmePath(roundId, programmeId)}/applications`} action="Go to applications">
      {WEEKS_NOT_YOURS}
    </Refusal>
  );
}
