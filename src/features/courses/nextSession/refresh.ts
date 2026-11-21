"use client";

import { createContext, useContext } from "react";

/**
 * HOW A PRESS ON THE NEXT SESSION'S CARD HAS THE CARD READ AGAIN. The
 * programme page's answers come from its server page, so `router.refresh()`
 * reads them again; Home's come from a route it fetches in the browser
 * (`useNextSessionAnswers`), so Home provides its `reload` here. A press that
 * changes what the card says (a request to be excused sent or withdrawn)
 * calls both. With no provider, nothing more happens.
 */
export const CardRefresh = createContext<(() => void) | null>(null);

const nothing = () => {};

export function useCardRefresh(): () => void {
  return useContext(CardRefresh) ?? nothing;
}
