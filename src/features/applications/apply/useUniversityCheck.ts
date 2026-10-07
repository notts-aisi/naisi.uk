"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readOwnAccount, sendUniversityCheck } from "./joinClient";

/**
 * A university address that still has to be checked, on the signed-in form.
 *
 * An account that is waiting to be approved cannot send an application until
 * its owner has followed the link emailed to their university address (the
 * send route is what refuses: see `sendHoldFor`). This hook is the form's
 * side of that: it knows whether the address is checked yet, sends the link
 * again when asked, and finds out by itself when the link has been followed.
 *
 * HOW IT FINDS OUT. The link is opened in another tab, or on a phone in
 * another app. The page that confirms it tells the person to come back, so
 * the moment this tab is looked at again it asks its own GET route. Nothing
 * is polled while the tab is in the background, and the server decides in
 * any case: a press of Send asks again first, and the route checks whatever
 * this page believes.
 */

export type UniversityCheck = {
  /** True while a send is held for want of the check. */
  held: boolean;
  verified: boolean;
  address: string;
  sending: boolean;
  /** What became of the last press of "Send the link again". */
  note: string | null;
  /** Seconds until another link can be asked for. */
  wait: number;
  resend: () => void;
  /** Ask the server again. Resolves whether the address is checked now. */
  refresh: () => Promise<boolean>;
};

/** The least time between two questions to the server from coming back to the tab. */
const ASK_AGAIN_MS = 3000;

export function useUniversityCheck({
  roundId,
  address,
  preferredName,
  verified: verifiedAtLoad,
  required,
}: {
  roundId: string;
  /** The address on the account. */
  address: string;
  preferredName: string;
  /** What the page was told when it was drawn. */
  verified: boolean;
  /** Whether this account has to be checked before it can send. */
  required: boolean;
}): UniversityCheck {
  const [verified, setVerified] = useState(verifiedAtLoad);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const known = useRef(verifiedAtLoad);
  const asked = useRef(0);
  const until = useRef(0);
  const name = useRef(preferredName);
  useEffect(() => {
    name.current = preferredName;
  });

  const held = required && Boolean(address) && !verified;

  const refresh = useCallback(async (): Promise<boolean> => {
    if (known.current) return true;
    asked.current = Date.now();
    const account = await readOwnAccount(roundId);
    if (account.ok && account.verified) {
      known.current = true;
      setVerified(true);
      setNote(null);
    }
    return known.current;
  }, [roundId]);

  useEffect(() => {
    if (!held) return;
    const look = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - asked.current < ASK_AGAIN_MS) return;
      void refresh();
    };
    document.addEventListener("visibilitychange", look);
    window.addEventListener("focus", look);
    return () => {
      document.removeEventListener("visibilitychange", look);
      window.removeEventListener("focus", look);
    };
  }, [held, refresh]);

  // Counts the wait down, so the button says when it can be pressed again.
  useEffect(() => {
    if (wait <= 0) return;
    const tick = setInterval(() => {
      setWait(Math.max(0, Math.ceil((until.current - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(tick);
  }, [wait]);

  const resend = useCallback(() => {
    if (sending || !address) return;
    setSending(true);
    setNote(null);
    void sendUniversityCheck(address, name.current).then((result) => {
      setSending(false);
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      until.current = Date.now() + result.wait * 1000;
      setWait(result.wait);
      setNote(
        result.sent
          ? "We’ve sent it again. It can take a minute to arrive."
          : "We sent one a moment ago. Give it a minute to arrive before you ask for another.",
      );
    });
  }, [sending, address]);

  return { held, verified, address, sending, note, wait, resend, refresh };
}
