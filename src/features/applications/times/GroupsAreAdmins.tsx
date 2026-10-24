import { Refusal } from "@/features/applications/editor/Refusals";

/**
 * What a programme's lead or reviewer is shown on its Groups tab, which is
 * an admin's: it counts the people holding a place by when they said they
 * are free, and names the ones no group suits. Drawn before anything is
 * read, in place of the page, with the way back to the applications they
 * are here for.
 */
export default function GroupsAreAdmins({ roundId, programmeId }: { roundId: string; programmeId: string }) {
  return (
    <Refusal
      title="Only an admin can open Groups"
      href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications`}
      action="Go to applications"
    >
      Groups shows when the people holding a place are free, and names them, so only an admin can
      open it. Ask an admin about your programme’s groups.
    </Refusal>
  );
}
