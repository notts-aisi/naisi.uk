import Link from "next/link";
import shared from "@/features/applications/editor/editor.module.css";
import { groupsViewPath } from "../groups/GroupsViews";
import {
  ADMINS_ONLY,
  ADMINS_ONLY_TITLE,
  GO_TO_PEOPLE_IN_GROUPS,
  GO_TO_SETTINGS,
  TIMES_LINK,
  TIMES_LINK_ACTION,
  TIMES_LINK_TITLE,
} from "./circlesWords";

/**
 * Circles' two calm notes, drawn on the server: what the programme's lead is
 * told in place of Circles (it is an admin's, because it shows marked weeks
 * and Claude's reads), and the short link that stands on the Times view
 * where the rings used to be.
 */

export function CirclesAreAdmins({ roundId, programmeId }: { roundId: string; programmeId: string }) {
  return (
    <section className={`${shared.card} ${shared.empty}`}>
      <h2 className={shared.cardTitle}>{ADMINS_ONLY_TITLE}</h2>
      <p className={shared.cardNote}>{ADMINS_ONLY}</p>
      <div className={shared.emptyActions}>
        <Link href={groupsViewPath(roundId, programmeId, "people")} className={shared.btn}>
          {GO_TO_PEOPLE_IN_GROUPS}
        </Link>
      </div>
    </section>
  );
}

/** In place of the rings on the Times view, for an admin. */
export function CirclesLink({ roundId, programmeId }: { roundId: string; programmeId: string }) {
  return (
    <section className={shared.card}>
      <h2 className={shared.cardTitle}>{TIMES_LINK_TITLE}</h2>
      <p className={shared.cardNote}>{TIMES_LINK}</p>
      <div className={shared.emptyActions}>
        <Link href={groupsViewPath(roundId, programmeId, "circles")} className={shared.btn}>
          {TIMES_LINK_ACTION}
        </Link>
      </div>
    </section>
  );
}

/** No run to draw: the programme names none, or the one it names is gone. */
export function CirclesNoRun({ roundId, programmeId, sentence }: { roundId: string; programmeId: string; sentence: string }) {
  return (
    <section className={`${shared.card} ${shared.empty}`}>
      <p className={shared.cardNote}>{sentence}</p>
      <div className={shared.emptyActions}>
        <Link
          href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/setup`}
          className={shared.btn}
        >
          {GO_TO_SETTINGS}
        </Link>
      </div>
    </section>
  );
}
