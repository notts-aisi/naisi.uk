"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";

/**
 * Whether the menu draws Messages for the person signed in.
 *
 * Who leads a programme and who facilitates a group is in the records, not on
 * the session the shell holds, so for an approved account that is not an
 * admin the shell asks `GET /api/messages` once when it opens, and draws the
 * entry when the answer is yes. An admin writes to anybody and is not asked.
 * Until the answer comes, and if it never does (offline, a failed request),
 * the entry is not drawn: a missing link is the recoverable failure, and the
 * page itself says who it is for to anybody who reaches it by its address.
 *
 * It decides whether a link is drawn, never what may be written: the page and
 * the routes ask again, of the records, every time.
 */
export function useWritesMessages(): boolean {
  const { user, role } = useAuth();
  const uid = user?.uid ?? null;
  const asks = uid !== null && (role === "member" || role === "committee");
  const [answer, setAnswer] = useState<{ uid: string; writes: boolean } | null>(null);

  useEffect(() => {
    if (!asks || uid === null) return;
    let cancelled = false;
    fetch("/api/messages", { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { writes?: unknown } | null;
        if (!cancelled) setAnswer({ uid, writes: res.ok && json?.writes === true });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ uid, writes: false });
      });
    return () => {
      cancelled = true;
    };
  }, [asks, uid]);

  if (role === "admin") return true;
  // An answer given for somebody else (signed out, then in as another) is no answer.
  return asks && answer?.uid === uid && answer.writes;
}
