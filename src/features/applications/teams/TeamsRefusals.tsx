import { Refusal } from "@/features/applications/editor/Refusals";

/*
 * What the Teams tab says to somebody it is not for, in place of the page.
 * Drawn on the server, before the run is read. Every address here is a page
 * of this site, written out from its own path with the ids encoded into it.
 */

/**
 * A reviewer of the programme. The tab names everybody taking part, by team,
 * and on an agenda programme what each of them ranked on the form, which is
 * the lead's and admins' to read.
 */
export function TeamsAreTheLeads({ roundId, programmeId }: { roundId: string; programmeId: string }) {
  return (
    <Refusal
      title="Only the programme’s lead and admins can open Teams"
      href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications`}
      action="Go to applications"
    >
      Teams shows everybody taking part by name, in their teams, so only the programme’s lead or an admin can
      open it.
    </Refusal>
  );
}

/** A fellowship's page, reached by its address: a fellowship has groups and no teams. */
export function TeamsAreAnIncubators({
  roundId,
  programmeId,
  programmeName,
}: {
  roundId: string;
  programmeId: string;
  programmeName: string;
}) {
  return (
    <Refusal title="Teams are an incubator’s" href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications`} action="Go to applications">
      {programmeName} is a fellowship, so its people are in groups, and it has no teams.
    </Refusal>
  );
}
