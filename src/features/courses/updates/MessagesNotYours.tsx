import { Refusal } from "@/features/applications/editor/Refusals";

/**
 * What a programme's reviewer is shown on its Messages tab. Drawn before the
 * run is read, in place of the page, with the way back to the applications
 * they are here for. A reviewer reads and scores applications; the updates
 * are written to the people holding a place, which is the lead's and an
 * admin's work.
 */
export default function MessagesNotYours({ roundId, programmeId }: { roundId: string; programmeId: string }) {
  return (
    <Refusal
      title="Only the programme’s lead and admins can open Messages"
      href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications`}
      action="Go to applications"
    >
      Messages is where the programme’s lead and admins write updates to the people taking part, so only they can
      open it.
    </Refusal>
  );
}
