# Mobile baseline: the events sign-up flow

The public events sign-up flow is the site's most mobile-mature surface, and the one part of the site that was tuned by hand on real phones. It is the hard "do not regress" surface for mobile work. This document is the contract: what the flow is, how to walk it, and what has and has not been checked.

It was rewritten on 7 October 2026, when the events pages were rebuilt to the redesign. That change altered the flow on purpose, which this document allows (see "When the baseline itself should change"). What it replaced is at the end, under "What changed on 7 October 2026".

## The flow as it is now

**The event page**, `/events/[id]`, from the top:

1. A way back to the list ("All events").
2. A hero card: the date in a box (weekday, day and month, then the time and the room), chips for the event's state (places left, "No sign-up needed", "Account needed", "Ended", "Cancelled"), and the title. Where the event has a cover image, the cover sits at the top of the card at its own shape with the emblem treatment over it, and the words sit under it. Where it has none, the words sit over the network motif.
3. The facts: When, Where, Who can come.
4. The places bar, for an event that takes sign-ups and has a limit.
5. Two columns. On the left, what the event is: the calendar buttons, the description, the food line. On the right, what a visitor can do: the sign-up panel, or a card in its place (cancelled, ended, or "No sign-up needed").

**On a narrow screen there is one column, and the sign-up panel comes first**, straight under the facts and above the calendar buttons and the description. "Narrow" is the page's own box being 48rem wide or less, so the preview inside the signed-in shell follows the same rule as a phone.

**The sign-up panel is never sticky and never fixed, at any width.** It is an ordinary block. A sign-up form can be taller than a phone, and a pinned panel is how a submit button ends up underneath something. The submit button is the last control in the form, as wide as the panel, 52px tall.

**The small pages around it** are one narrow card each: the confirmation ("Your RSVP is in"), the change form, the cancel page, and the cards those pages show when a link no longer works.

## Mobile-frozen modules

These stylesheets back the flow. Any pull request that touches one, or touches anything shared that they consume, walks the baseline below before merging.

- [src/features/events/EventDetailView.module.css](../src/features/events/EventDetailView.module.css)
- [src/features/events/RsvpForm.module.css](../src/features/events/RsvpForm.module.css)
- [src/features/events/BlockView.module.css](../src/features/events/BlockView.module.css)
- [src/features/events/FormRenderer.module.css](../src/features/events/FormRenderer.module.css)
- [src/features/events/CoverImage.module.css](../src/features/events/CoverImage.module.css)
- [src/features/events/RsvpPages.module.css](../src/features/events/RsvpPages.module.css): the confirmation, change and cancel pages
- [src/features/events/eventLinks.module.css](../src/features/events/eventLinks.module.css): the links that look like buttons
- [src/app/(public)/events/events.module.css](<../src/app/(public)/events/events.module.css>): the list, and the room round an event page

The components that use them live in `src/features/events/` and are drawn by `src/app/(public)/events/[id]/` and its sub-routes (`rsvp/[rsvpId]/change`, `rsvp/[rsvpId]/cancel`, `rsvp/submitted`).

Two of these are shared with other parts of the site, so a change to either is also a change there. `FormRenderer.module.css` styles the questions in the older application flow and the course application form, and the worksheets respond page imports its classes directly. `BlockView.module.css` draws a course page's pitch, a week's guide and a worksheet question's body. `BlockView` reads its text size, line height and colour from three custom properties so that the event page can set its own without changing theirs.

### What counts as "shared" here

Every page in the flow wraps its content in `className="container"`, so a change to that one rule in `globals.css` reaches all of them and is the single highest-blast-radius edit available.

- [src/theme/tokens.css](../src/theme/tokens.css), [src/theme/typography.css](../src/theme/typography.css), [src/theme/breakpoints.ts](../src/theme/breakpoints.ts)
- [src/app/globals.css](../src/app/globals.css), in particular `.container` and the `body` rules
- [src/app/(public)/layout.tsx](<../src/app/(public)/layout.tsx>) and the public header and footer: the frame every one of these pages is drawn inside. The header is pinned to the top of the screen.
- The components the flow is built from in `src/components/ui/`: `Button`, `Input` and `Field`, `OptionRow`, `Notice`, `Chip` and `Badge`, `NetField`, `ResponsiveSelect`, `CountedTextarea`
- The root `viewport` export in [src/app/layout.tsx](../src/app/layout.tsx)

## Viewports to verify at

- **375 by 667**: iPhone SE and iPhone 12 mini, portrait. The narrow-phone reference.
- **414 by 896**: iPhone Plus and Pro Max, portrait. The most common large phone.
- **768 by 1024**: iPad, portrait. The exact `--bp-md` boundary. One column, panel first.
- **1024 by 1366**: iPad landscape or a small laptop. Two columns, as on a desktop.
- **844 by 390**: iPhone 14 or 15 in **landscape**, on a notched device. A notch only intrudes on the left and right edges in landscape, and `viewport-fit: cover` is on at the root, so a missing safe-area inset is invisible at every other viewport in this list. Verify on real hardware or a simulator: DevTools does not model the inset. At this width the page's box is just wide enough for two columns.

## Flows to re-run

For each viewport above:

1. **A signed-out sign-up.** Open `/events/[id]` for an event with sign-up questions. Fill in the name, the email and every question. Press "Request a place". The confirmation page says "Your RSVP is in".
2. **A signed-in sign-up.** The same, signed in as a member. The name and email are filled in from the account and locked. Press "Request a place". The confirmation page follows.
3. **A change request.** The confirmation EMAIL carries a link to change your answers (the confirmation page itself has no such link). Open it, change an answer, press "Send change request". The card says "Request sent."
4. **A self-cancel.** The same email carries a link to cancel. Open it, press "Yes, cancel my RSVP". The card says "Your RSVP is cancelled."

## What "still works" means

- **No sideways page scroll** at any viewport, and none inside the form. Nothing in this flow scrolls sideways within itself either.
- **No clipped controls.** Every field, button and link is fully visible and tappable. Every field and button, and every link that stands on its own, is at least 44px tall. A link inside a sentence of the description is the height of its line.
- **Nothing is painted over the submit button.** Scroll the button through the screen from the top edge to the bottom edge. The only thing that may cross it is the site's header, pinned to the top, when the button is scrolled right up underneath it. Nothing in the page itself is pinned.
- **The sign-up panel comes before the description** on a narrow screen, and is beside it on a wide one.
- **All inputs accept text**, and the on-screen keyboard does not hide the field being edited (a real iOS device, not DevTools). Every text box is set at 16px so that iOS does not zoom the page when one takes focus.
- **The food line, the dietary tags, and the places chips and bar stay legible.**
- **The cover image and its emblem treatment keep the cover's own shape**, undistorted, at the top of the hero card.
- **The calendar buttons work from a phone** (a tap, not just a click). "Apple" is a calendar file served as an attachment, deliberately without a `download` attribute, which on iOS sends the file to the Files app in place of Calendar.

## The automatic half

`tests/e2e/events-rsvp.spec.mjs` runs with the browser suite on pull requests, in Chromium. It walks flow 1 once at a desktop width, then opens the event page at 375 by 667 and at 414 by 896 and checks that the document is no wider than its window and that the submit button, once scrolled to, is fully on screen with nothing painted over its centre. It finds the form by `#rsvp-name`, `#rsvp-email` and the test ids `rsvp-form`, `rsvp-submit`, `rsvp-error` and `rsvp-submitted`, so those stay as they are.

That is a regression net on two of the five viewports and one of the four flows, in one browser. Flows 2, 3 and 4, the tablet and landscape viewports, Safari, the notch and the keyboard remain a hand walk.

## Verification checkbox

A pull request that touches a mobile-frozen module or anything listed as shared says so in its description:

```
- [ ] Walked the events sign-up baseline: four flows at 375 / 414 / 768 / 1024 / 844 by 390
- [ ] Browsers and devices it was walked on, named
- [ ] Pictures kept for each flow
```

## What was checked on 7 October 2026

All of this was **Chromium only** (version 153, driven by Playwright, with touch emulated), against a local server with sample events. No real phone and no Safari.

- **Before the rebuild**, with the redesign's tokens and shared components already in place: the four flows at all five viewports, 20 walks of 20, with no sideways scroll and nothing over the submit button.
- **After the rebuild**: the same 20 walks, 20 of 20. At every step the document was exactly as wide as its window. No control stuck out of the layout. The submit button, once scrolled to, was fully on screen with its centre and its four corners clear of anything in the page. (At 414 by 896 one corner sat under the development server's own indicator, which a deployed site does not have.)
- **The submit button, measured.** At 375 by 667 it spans 37px to 338px (301 wide, 52 tall) inside a form 301px wide. At 414 by 896 it spans 37px to 377px (340 wide, 52 tall) inside a form 340px wide. Scrolled through nine positions from the top edge of the screen to the bottom, it was crossed only by the pinned header at the very top.
- **With the page gutter the new public frame brings** (20px at a phone's edge, where it is 16px today), set by hand for the walk: the same 20 walks, 20 of 20. The button spans 41px to 334px at 375 wide and 41px to 373px at 414 wide.
- **Every state of the list, the event page, the add-to-calendar page and the small RSVP pages** (75 pictures: 25 states at 1440, 390 and 360 wide): no sideways scroll on any. Before the rebuild, one long unbroken word in a description pushed the event page and the add-to-calendar page 351px sideways at 390 wide. It wraps now.

## Owed re-verifications

Not yet walked on real hardware. Clear a line when it is done, and do not let one reach the live site unchecked.

- **The rebuilt flow on a real iPhone, and in Safari.** Everything above was measured in Chromium. Owed: the four flows at 375 and 414 on an iPhone in Safari, and at 844 by 390 in landscape on a notched one. In particular: that the on-screen keyboard does not hide the field being edited now that the panel sits higher on the page; that the option rows (a native tick box in a 44px row that takes the accent edge when ticked) and the Yes and No rows look and tap as drawn, since Safari styles native boxes and buttons its own way; that the bottom sheet a "pick one" question opens still works; that the "Apple" calendar button hands the file to Calendar; and that the date box and the chips in the hero read clearly over the motif and under a cover image.
- **The long-answer box.** It draws through the shared `CountedTextarea` and takes the look of the other text boxes, with a counter row under it. It starts 5rem tall on purpose. Whether a taller answer still clears the iOS keyboard cannot be answered by CSS: a real-device walk at 375, 414 and 844 by 390 is owed.
- **The spam-check badge.** `RsvpForm` mounts Google's invisible check, whose badge floats in the bottom-right corner on a deployed site (about 70 by 60 CSS pixels showing, 14px from the bottom). The submit button is now as wide as the panel, so its right-hand end can pass behind the badge. Measured with a box of the badge's size standing in for it (the real badge does not render on a local server): when the button rests in the bottom 74px of the screen the box covers a strip 33px wide at the button's right-hand end, about a tenth of it, and never its centre; at the button's resting place after being scrolled to, it covers none. Owed: a look at the real badge at 375 and 414, and at 844 by 390, where it also competes with the notch inset.

## When the baseline itself should change

The baseline is not fixed for ever. If a deliberate improvement to the events flow is the point of a pull request, the new behaviour replaces the relevant entry above, in the same pull request, with the date, the viewports and the browsers it was walked on.

## What changed on 7 October 2026

- The page was two columns with the sign-up panel sticky on the right above 880px, and one column with the panel LAST below that. It is now two columns with nothing sticky when the page's box is wider than 48rem, and one column with the panel FIRST when it is not.
- The details card (title, when, where, capacity) became the hero card, the facts and the places bar.
- The submit button was 140px wide and 44px tall and said "Request RSVP". It is as wide as the panel, 52px tall, and says "Request a place".
- An event that has ended shows a card saying so in place of the form. An event is over once its end time has passed, or, with no end time, once its day has.
- The question fields took the site's form look: a 44px box a shade darker than its card, and options as rows of at least 44px. The option rows had no 44px floor before.
- The confirmation, change and cancel pages, and the links on them, moved from inline styles onto one stylesheet. Their actions wrap, where the cancel page's two buttons used to sit in a row that could not.
