"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { parseFacilitating, type FacilitatingGroup } from "@/lib/courses/facilitatingMenu";

/** What the menu draws from the records, rather than from the session. */
export type MenuAnswer = {
  /** Whether the menu draws Messages. */
  writes: boolean;
  /** The groups the menu's Facilitating part lists, in the order they meet. Empty: no Facilitating part. */
  facilitating: FacilitatingGroup[];
};

const NONE: FacilitatingGroup[] = [];

/**
 * What the menu draws for the person signed in that the session cannot say:
 * whether it draws Messages, and the groups its Facilitating part lists.
 *
 * Who leads a programme and who facilitates a group is in the records, not on
 * the session the shell holds, so for an approved account the shell asks
 * `GET /api/messages` once when it opens. An admin writes to anybody, so
 * Messages is drawn for one without waiting; an admin is asked only for the
 * groups they facilitate. Until the answer comes, and if it never does
 * (offline, a failed request, a slow one), neither Messages (for anybody but
 * an admin) nor a Facilitating part is drawn: the menu is the one somebody
 * who facilitates nothing has, a missing link is the recoverable failure,
 * and each page says who it is for to anybody who reaches it by its address.
 *
 * Nothing of the answer is kept in the browser: the privacy policy names
 * every key the site keeps there, and this is not one. So a facilitator's
 * phone bar settles into its own shape once per page load, when the answer
 * lands, and never again while the shell stays mounted.
 *
 * It decides whether links are drawn, never what may be written or read:
 * the pages and the routes ask again, of the records, every time.
 */
export function useMenuAnswer(): MenuAnswer {
  const { user, role } = useAuth();
  const uid = user?.uid ?? null;
  const asks = uid !== null && (role === "member" || role === "committee" || role === "admin");
  const [answer, setAnswer] = useState<{ uid: string; writes: boolean; facilitating: FacilitatingGroup[] } | null>(null);

  useEffect(() => {
    if (!asks || uid === null) return;
    let cancelled = false;
    fetch("/api/messages", { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { writes?: unknown; facilitating?: unknown } | null;
        if (cancelled) return;
        const facilitating = res.ok ? parseFacilitating(json?.facilitating) : NONE;
        setAnswer({ uid, writes: res.ok && json?.writes === true, facilitating: facilitating.length > 0 ? facilitating : NONE });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ uid, writes: false, facilitating: NONE });
      });
    return () => {
      cancelled = true;
    };
  }, [asks, uid]);

  // An answer given for somebody else (signed out, then in as another) is no answer.
  const ours = asks && answer?.uid === uid ? answer : null;
  const facilitating = ours ? ours.facilitating : NONE;
  if (role === "admin") return { writes: true, facilitating };
  return { writes: ours !== null && ours.writes, facilitating };
}
