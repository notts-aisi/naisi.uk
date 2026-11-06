"use client";

import { useState } from "react";
import type { CantMakeItView } from "@/lib/courses/cantMakeIt/model";
import type { JoiningOnlineView } from "@/lib/courses/joiningOnline/model";
import CantMakeIt from "./CantMakeIt";
import JoiningOnline from "./JoiningOnline";

/**
 * WHAT SOMEBODY TAKING PART CAN TELL US ABOUT THEIR NEXT SESSION, on its
 * ticket on their programme page: "Can't make it" and "Joining online", ONE
 * AT A TIME.
 *
 * Somebody who has told us they can't make the session is not offered
 * "Joining online" until they say they can make it after all, and somebody
 * who has said they are joining online is not offered "Can't make it" until
 * they say they will be in the room after all. Each press saves through its
 * own route, which refuses the second while the first stands; this keeps the
 * ticket from offering it. What each one said is held here, so whichever
 * comes back is drawn as the register now stands, not as the page loaded.
 *
 * Either view may be null (the server page draws only what is still open to
 * say), and then that half is not drawn.
 */
export default function TicketAnswers({
  cantMakeIt,
  joiningOnline,
  hasLink,
  locked = false,
}: {
  cantMakeIt: CantMakeItView | null;
  joiningOnline: JoiningOnlineView | null;
  /** The ticket carries the session's link already. */
  hasLink: boolean;
  locked?: boolean;
}) {
  const [told, setTold] = useState(cantMakeIt?.told === true || joiningOnline?.told === true);
  const [said, setSaid] = useState(joiningOnline?.said === true);

  return (
    <>
      {cantMakeIt && !said && (
        <CantMakeIt key={`cant-${cantMakeIt.sessionKey}`} view={{ ...cantMakeIt, told }} locked={locked} onToldChange={setTold} />
      )}
      {joiningOnline && !told && (
        <JoiningOnline
          key={`online-${joiningOnline.sessionKey}`}
          view={{ ...joiningOnline, said }}
          hasLink={hasLink}
          locked={locked}
          onSaidChange={setSaid}
        />
      )}
    </>
  );
}
