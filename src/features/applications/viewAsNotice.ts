/**
 * WHAT A VIEW-AS SESSION IS SHOWN IN PLACE OF A MEMBER'S OWN APPLICATION.
 *
 * Admin "view as" borrows a member's session so the site draws what that
 * member sees. An application is the one thing on it that is its owner's to
 * read: the answers they are still writing have not been sent to anybody, and
 * some of what they answered is asked on the promise that nobody reviewing it
 * will be shown it. So while a view-as session is live, the form, the list of
 * a person's applications and the page for one of them are not drawn from the
 * person's application at all. Each draws these words where it would have
 * been, in its own card.
 *
 * The check comes before the read on every one of them
 * (`tests/applications-view-as-own-application.test.mjs` holds each to that),
 * so nothing of the application is in the page for a browser to find.
 *
 * Words only, with no server import, so any of the three can take them.
 */
export const VIEW_AS_NOTICE = {
  title: "Not shown while you’re viewing as somebody else",
  body:
    "An application is its owner’s to read. Their answers, anything they haven’t sent yet and where it " +
    "stands aren’t shown in a view-as session. Exit view-as to carry on as yourself.",
} as const;
