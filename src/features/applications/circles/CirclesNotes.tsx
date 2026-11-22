import Link from "next/link";
import shared from "@/features/applications/editor/editor.module.css";
import { withShow } from "../groups/boardShow";
import { groupsViewPath } from "../groups/GroupsViews";
import { TIMES_LINK, TIMES_LINK_ACTION, TIMES_LINK_TITLE } from "./circlesWords";

/**
 * The short link that stands on the Times view where the rings used to be,
 * for an admin: to People in groups shown as Rings, where an admin arranges
 * groups (Suggest groups, with or without Claude, over the rings).
 */
export function CirclesLink({ roundId, programmeId }: { roundId: string; programmeId: string }) {
  return (
    <section className={shared.card}>
      <h2 className={shared.cardTitle}>{TIMES_LINK_TITLE}</h2>
      <p className={shared.cardNote}>{TIMES_LINK}</p>
      <div className={shared.emptyActions}>
        <Link href={withShow(groupsViewPath(roundId, programmeId, "people"), "rings")} className={shared.btn}>
          {TIMES_LINK_ACTION}
        </Link>
      </div>
    </section>
  );
}
