"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { askProgrammesMenu, type MenuTerm } from "@/lib/applications/programmes/menu";

const NO_TERMS: MenuTerm[] = [];

/**
 * The programmes the menu lists under Programmes for the person signed in,
 * by term: what only the server can say, because who leads what is on the
 * forms, which the browser cannot read.
 *
 * Asked once when the shell mounts (and again if the account signed in, or
 * its role, changes without a reload), and only for somebody who could have
 * entries (`couldHave`: an admin, or an account the records name on a form),
 * as the shell asks for its Messages and search answers. Until the answer
 * comes, and if it never does, no terms: the menu is the one it always was,
 * with nothing held open for them and nothing said about it.
 *
 * Nothing of the answer is kept in the browser. It decides which links are
 * drawn, never what may be opened: each programme's pages ask again.
 */
export function useProgrammesMenu(couldHave: boolean): MenuTerm[] {
  const { user, role } = useAuth();
  const uid = user?.uid ?? null;
  const asks = uid !== null && couldHave;
  const [answer, setAnswer] = useState<{ uid: string; role: string | null; terms: MenuTerm[] } | null>(null);

  useEffect(() => {
    if (!asks || uid === null) return;
    let cancelled = false;
    const controller = new AbortController();
    void askProgrammesMenu(undefined, controller.signal).then((terms) => {
      if (!cancelled) setAnswer({ uid, role, terms });
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [asks, uid, role]);

  // An answer given for another account, or for this one before its role
  // changed (signed out and in as another, or made admin or not without a
  // reload), is no answer: it is dropped, and the shell asks again.
  return asks && answer?.uid === uid && answer.role === role ? answer.terms : NO_TERMS;
}
