"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";

/**
 * Whether the menu draws the search box for the person signed in.
 *
 * Who leads a programme and who facilitates a group is in the records, not on
 * the session the shell holds, so for an approved account the shell asks
 * `GET /api/search` once when it opens and draws the box when the answer is
 * yes. An admin is asked too, so the box is drawn exactly when the route would
 * answer. Until the answer comes, and if it never does (offline, a failed
 * request), the box is not drawn: a missing box is the recoverable failure.
 *
 * It decides whether a box is drawn, never what is found: the route asks
 * again, of the records, on every query.
 */
export function useSearches(): boolean {
  const { user, role } = useAuth();
  const uid = user?.uid ?? null;
  const asks = uid !== null && (role === "member" || role === "committee" || role === "admin");
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

  // An answer given for somebody else (signed out, then in as another) is no answer.
  return asks && answer?.uid === uid && answer.searches;
}
