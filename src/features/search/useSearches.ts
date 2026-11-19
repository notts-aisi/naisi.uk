"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";

/**
 * Whether the menu draws the search box for the person signed in.
 *
 * An admin is always answered by `POST /api/search`, so the box is drawn for
 * one without asking. Who leads a programme and who facilitates a group is
 * in the records, not on the session, so for anybody else the shell asks
 * `GET /api/search` once when it opens, and draws the box when the answer is
 * yes. It asks only when the account could run something on what the shell
 * already knows (`couldRunThings`: Messages is drawn for them, or the
 * admissions pages admit them), so a member who runs nothing costs the
 * database nothing here.
 *
 * Until the answer comes, and if it never does (offline, a failed request),
 * the box is not drawn: a missing box is the recoverable failure. It decides
 * whether a box is drawn, never what is found: the route asks again, of the
 * records, on every query.
 */
export function useSearches(couldRunThings: boolean): boolean {
  const { user, role } = useAuth();
  const uid = user?.uid ?? null;
  const asks = uid !== null && couldRunThings && (role === "member" || role === "committee");
  const [answer, setAnswer] = useState<{ uid: string; searches: boolean } | null>(null);

  useEffect(() => {
    if (!asks || uid === null) return;
    let cancelled = false;
    fetch("/api/search", { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { searches?: unknown } | null;
        if (!cancelled) setAnswer({ uid, searches: res.ok && json?.searches === true });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ uid, searches: false });
      });
    return () => {
      cancelled = true;
    };
  }, [asks, uid]);

  if (role === "admin" && uid !== null) return true;
  // An answer given for somebody else (signed out, then in as another) is no answer.
  return asks && answer?.uid === uid && answer.searches;
}
