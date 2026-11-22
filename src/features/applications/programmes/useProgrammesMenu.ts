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
 * Asked once when the shell mounts, and only for somebody who could have
 * entries (`couldHave`: an admin, or an account the records name on a form),
 * as the shell asks for its Messages and search answers. Until the answer
 * comes, and if it never does, no terms: the menu is the one it always was,
 * with nothing held open for them and nothing said about it.
 *
 * Nothing of the answer is kept in the browser. It decides which links are
 * drawn, never what may be opened: each programme's pages ask again.
 */
export function useProgrammesMenu(couldHave: boolean): MenuTerm[] {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const asks = uid !== null && couldHave;
  const [answer, setAnswer] = useState<{ uid: string; terms: MenuTerm[] } | null>(null);

  useEffect(() => {
    if (!asks || uid === null) return;
    let cancelled = false;
    void askProgrammesMenu(fetch).then((terms) => {
      if (!cancelled) setAnswer({ uid, terms });
    });
    return () => {
      cancelled = true;
    };
  }, [asks, uid]);

  // An answer given for somebody else (signed out, then in as another) is no answer.
  return asks && answer?.uid === uid ? answer.terms : NO_TERMS;
}
