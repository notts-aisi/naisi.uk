import { Refusal } from "@/features/applications/editor/Refusals";

/**
 * What somebody with a role on a programme who is neither an admin nor its
 * lead (a reviewer) is shown on its Groups or Attendance tab. Drawn before
 * the run is read, in place of the page, with the way back to the
 * applications they are here for.
 *
 * Both tabs show the people holding a place, by name: who is in which
 * group, when they are free, and their marks. A reviewer reads and scores
 * applications, and is not shown the people once they hold a place.
 */
export default function NotYours({
  roundId,
  programmeId,
  tab,
}: {
  roundId: string;
  programmeId: string;
  tab: "Groups" | "Attendance";
}) {
  return (
    <Refusal
      title={`Only the programme’s lead and admins can open ${tab}`}
      href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications`}
      action="Go to applications"
    >
      {tab === "Groups"
        ? "Groups shows who is in which group and when the people holding a place are free, by name, so only the programme’s lead or an admin can open it."
        : "Attendance shows every group’s register, by name, so only the programme’s lead or an admin can open it."}
    </Refusal>
  );
}
