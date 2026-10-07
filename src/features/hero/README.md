# The hero scene

The animated scene behind the homepage's first words: a network that runs
into the emblem and lights the head inside its shield. This folder is the
whole of it. A page uses it by writing its words inside `<HeroScene>`; it
never needs to read the engine.

| File | What it is |
| --- | --- |
| `HeroScene.tsx` | The client component. A canvas behind its children, one screen high. |
| `parts.tsx` | The pieces a page puts inside it. No script of their own. |
| `keepOut.ts` | The zones the scene dims itself behind, and their numbers. |
| `markArt.ts` | The emblem's shapes, as the hero draws them. |
| `HeroScene.module.css` | The layout of all of the above, in three forms. |
| `mount.ts` | Runs the scene on a page: the form, the typed headline, a finger on a link. |
| `scene.ts` | Starts and stops the engine. The only file that imports it. |
| `engine.js`, `engine.d.ts` | The design's script, kept exactly as shipped, and its types. |

## Using it

Write this in a Server Component. Everything inside `<HeroScene>` is rendered
on the server and is complete without any script.

```tsx
import HeroScene from "@/features/hero/HeroScene";
import {
  HeroActions,
  HeroAward,
  HeroColumn,
  HeroHeadline,
  HeroLede,
  HeroMark,
  HeroTagline,
} from "@/features/hero/parts";

<HeroScene>
  <HeroColumn>
    <HeroMark />
    <HeroTagline>Nottingham AI Safety Initiative</HeroTagline>
    <HeroHeadline lead="Make AI go well." accent="From Nottingham." />
    <HeroLede>
      The AI safety community at the University of Nottingham. Fellowships, a
      research incubator and socials, open to every subject.
    </HeroLede>
    <HeroActions status={["Applications open now", "close Sun 18 Oct, 23:59"]}>
      <a href={applyPath}>Apply by Sun 18 Oct</a>
      <a href="#this-term">Compare the programmes</a>
    </HeroActions>
    <HeroAward>
      <a href={awardHref}>Newcomer of the Year · UoNSU Activities Awards 2026</a>
    </HeroAward>
  </HeroColumn>
</HeroScene>
```

That one piece of markup serves a phone, a tablet and a desktop. The
stylesheet moves and resizes the pieces by the width and shape of the screen
and sets aside the ones a form does not show. Nothing has to be rendered
three times.

What the page still has to bring:

- **The two links and the award's pill, and how they look.** They are the
  page's own. The boards draw the links 52px high with 24px of side padding,
  an 8px radius and a 16px semibold label: the first on the accent fill with
  the dark label, the second on `--color-bg` at 55% with a
  `--color-border-strong` edge and `--color-text`. On a phone each link is
  given the full width by this folder's stylesheet. The pill is 44px high.
- **The words for the term's stage.** The boards have three sets:

  | Stage | First link | Second link | Status |
  | --- | --- | --- | --- |
  | Before applications open | Get told when applications open | See what’s on this term | `["Applications open [date]", "close Sun 18 Oct"]` |
  | Applications open | Apply by Sun 18 Oct (with an arrow) | Compare the programmes | `["Applications open now", "close Sun 18 Oct, 23:59"]` |
  | Programmes running | See what’s on | Hear when spring opens | `["Running now", "spring intake [date]"]` |

- **The award's two lengths.** The desktop board says "UoNSU Activities
  Awards 2026" and the tablet board says "UoNSU 2026". The phone board has no
  award, and `HeroAward` hides it there.

### The pieces

| Piece | Props | Notes |
| --- | --- | --- |
| `HeroScene` | `children`, `className?` | Default export of `HeroScene.tsx`. Renders a `<section>`. |
| `HeroColumn` | `children` | Wrap everything else in it, once. |
| `HeroMark` | none | The emblem. Required: the scene is built around it. |
| `HeroTagline` | `children` | Shown on the phone and tablet forms. Required: see "Required" below. |
| `HeroHeadline` | `lead`, `accent` | The page's only `h1`. Two plain strings. |
| `HeroLede` | `children` | The paragraph. |
| `HeroActions` | `children`, `status?` | The links, and the line under them as an array of its parts. |
| `HeroAward` | `children` | Room for the award. Leave it out if there is none. |

`status` is an array so that the line breaks only between its parts, at the
dot, as the boards do (they use no-break spaces inside each part). Write it in
sentence case: the capitals and the mono face are the stylesheet's.

## The three forms

| | Desktop | Tablet | Phone |
| --- | --- | --- | --- |
| Board | 1440 by 810 | 834 by 1194 | 390 by 844 |
| Applies when | wider than 60rem and the screen is wider than tall | at or below 60rem, or any screen held upright | at or below 48rem |
| Words | a 620px column on the right, centred in the height | stacked at the foot, full width | stacked at the foot, full width |
| Emblem | 216px, at the column's left edge, above the headline | 200px, at the right edge, 116px above the tagline | 170px, at the right edge, 20px above the tagline |
| Tagline | not shown | shown | shown |
| Headline | 64px, two lines | 41.7px, one line where it fits | 40px, two lines |
| Lede | 19px | 18px | 16px |
| Links | a row | a row | a column, full width |
| Award | shown | shown | not shown |
| Network | six layers from the left edge to the emblem, the full height | six layers above the tagline | four layers above the tagline |
| A drag on the hero | scrolls the page | moves the network | moves the network |

The hero is one screen high (`100svh`), pulled up under the site's sticky
header, and grows when its words need more than a screen. The sizes above are
the boards'. On a screen shorter than the board the emblem gives way first
(and on the desktop form the headline with it), so the links stay on the
first screen for as long as they can.

The form is decided by two media conditions, and they are written in two
places that must agree: `PHONE_QUERY` and `STACKED_QUERY` in `mount.ts`, and
the two blocks at the foot of `HeroScene.module.css`. A screen held upright
takes the tablet form however wide it is, because the engine decides how to
draw its network from the hero's own shape: the wide network only when the
hero is wider than it is tall and at least 900px wide.

## The contract, by attribute

This is what the engine reads from the page. The pieces above write all of it
for you. Read this section if you are changing a piece or writing markup of
your own inside `<HeroScene>`.

### `data-keepout="<name>"`, with `data-pad`, `data-feather`, `data-strength`

A zone the scene dims itself behind. `data-pad` is how far the zone reaches
past the element's box, `data-feather` how far beyond that the dimming fades
out, both in px; `data-strength` is how much is taken away inside, from 0 to
1. Left out, they default to 16, 60 and 0.72. `keepOut(name)` in `keepOut.ts`
returns the four attributes for a named zone with the boards' numbers:

| Name | On | pad | feather | strength |
| --- | --- | --- | --- | --- |
| `header` | the strip under the site's header (drawn by `HeroScene` itself) | 0 | 28 | 0.55 |
| `mark` | the emblem | 14 | 56 | 0.6 |
| `tagline` | the society's name | 10 | 40 | 0.75 |
| `headline` | the `h1` | 18 | 64 | 0.8 |
| `lede` | the paragraph | 12 | 48 | 0.8 |
| `cta` | the links and the line under them, together | 12 | 44 | 0.85 |
| `award` | the award | 12 | 40 | 0.75 |

Any name works as a dimmed box. Two names mean more:

- `header`: the network starts 36 to 52px below this zone's lower edge.
  `HeroScene` draws it, 64px high plus the safe area, so the network never
  runs behind the header's words. Do not add another.
- `tagline`: on the phone and tablet forms the network stops 58px above this
  zone's upper edge.

### `data-mark`

On the element that is the emblem's box. The scene reads its position and
height, works out the emblem's scale from the height, aims the network at the
head inside the shield and lights it from behind. The box must be exactly the
emblem's own box (view box `6 6 221.07 270.4`, so 221.07 wide for every 270.4
high) with nothing around it. The scene also writes two custom properties on
the hero's root, `--nh-kick` and `--nh-flash` (each between 0 and 1), which
`HeroMark` uses to nudge and flash the emblem's cyan offset when a pulse
lands.

### `data-accent-text`

On the element whose text is the typed part of the headline. The whole text
is in the markup. Once the scene runs it types into this element: it empties
it, types it a letter at a time, underlines it, holds, deletes and types
again, for as long as the page is open. The element must have that text as
its only child, and the room it sits in must not change size as the text
does (`HeroHeadline` keeps 9.5em for it), or the lines under it would move.

### `data-word`

On each word of the headline's first part. This build's scene does not read
it; the engine offers it to scenes that light the words. `HeroHeadline`
writes it so that a later scene finds what it expects.

### Required, and what happens without

| Missing | What the scene does |
| --- | --- |
| `data-mark` | Aims at a point 60% across and 42% down. Never leave it out. |
| a `tagline` zone, on the phone or tablet form | Stops the network 198px above the foot of the hero, wherever the words are. |
| `data-accent-text` | Types nothing. The headline is still. |
| a zone on some words | Draws the network at full strength behind them. |

### A piece that a form does not show

Never hide a zone with `display: none`. The engine measures a hidden element
as a zone at the hero's own corner. Set it aside instead, as the stylesheet
does for the tagline on the desktop form and the award on the phone form:
`position: absolute; left: -200vw; visibility: hidden`. That takes it out of
the layout, hides it from every reader, and puts its zone far outside the
scene.

## The boards' own markup, form by form

The pieces produce one set of markup and the stylesheet makes each form out
of it. For reference, this is what each board draws, with its own words in
the "applications open" stage. Styles are left out and the emblem's paths are
cut short; the attributes are complete.

### Desktop, 1440 by 810

A 620px column whose right edge is 168px from the screen's (24px beyond the
page's content box), centred in the height under the header, 24px between
pieces.

```html
<div data-mark data-keepout="mark" data-pad="14" data-feather="56" data-strength="0.6">
  <!-- 216px high, at the left edge of the column -->
  <svg viewBox="6 6 221.07 270.4" role="img" aria-label="Nottingham AI Safety Initiative">…</svg>
</div>
<h1 data-keepout="headline" data-pad="18" data-feather="64" data-strength="0.8">
  <!-- 64px, line height 1.05, at least 2.1em high -->
  <span class="visually-hidden">Make AI go well. From Nottingham.</span>
  <span aria-hidden="true">
    <span data-word>Make</span> <span data-word>AI</span> <span data-word>go</span> <span data-word>well.</span>
  </span>
  <span aria-hidden="true"><!-- 9.5em of room -->
    <span data-accent-text>From Nottingham.</span><span>|</span>
  </span>
</h1>
<p data-keepout="lede" data-pad="12" data-feather="48" data-strength="0.8">
  <!-- 19px, at most 33em wide -->
  The AI safety community at the University of Nottingham. Fellowships, a
  research incubator and socials, open to every subject.
</p>
<div data-keepout="cta" data-pad="12" data-feather="44" data-strength="0.85">
  <div><!-- a row, 12px apart -->
    <a href="…">Apply by Sun 18 Oct →</a>
    <a href="#this-term">Compare the programmes</a>
  </div>
  <div>APPLICATIONS OPEN NOW · CLOSE SUN 18 OCT, 23:59</div><!-- 13px mono, 12px below -->
</div>
<a href="…" data-keepout="award" data-pad="12" data-feather="40" data-strength="0.75">
  <!-- a 44px pill, 8px further down than the other gaps -->
  Newcomer of the Year · UoNSU Activities Awards 2026
</a>
```

### Tablet, 834 by 1194

A column 24px in from each side, ending 56px above the foot of the hero, the
pieces stacked up from there, 20px between them.

```html
<div data-mark data-keepout="mark" data-pad="14" data-feather="56" data-strength="0.6">
  <!-- 200px high, at the right edge, with 96px of room under it -->
  <svg viewBox="6 6 221.07 270.4" role="img" aria-label="Nottingham AI Safety Initiative">…</svg>
</div>
<p data-keepout="tagline" data-pad="10" data-feather="40" data-strength="0.75">
  <!-- 16px bold display face, in the live cyan -->
  Nottingham AI Safety Initiative
</p>
<h1 data-keepout="headline" data-pad="18" data-feather="64" data-strength="0.8">
  <!-- 41.7px, pulled 8px up toward the tagline; otherwise as on the desktop board -->
  …
</h1>
<p data-keepout="lede" data-pad="12" data-feather="48" data-strength="0.8"><!-- 18px -->…</p>
<div data-keepout="cta" data-pad="12" data-feather="44" data-strength="0.85">
  <div><!-- a row -->
    <a href="…">Apply by Sun 18 Oct →</a>
    <a href="#this-term">Compare the programmes</a>
  </div>
  <div>APPLICATIONS OPEN NOW · CLOSE SUN 18 OCT, 23:59</div>
</div>
<a href="…"><!-- a 46px pill; the board gives it no zone -->
  Newcomer of the Year · UoNSU 2026
</a>
```

### Phone, 390 by 844

A column 16px in from each side, ending 20px above the foot of the hero, the
pieces stacked up from there, 20px between them.

```html
<div data-mark data-keepout="mark" data-pad="14" data-feather="56" data-strength="0.6">
  <!-- 170px high, at the right edge -->
  <svg viewBox="6 6 221.07 270.4" role="img" aria-label="Nottingham AI Safety Initiative">…</svg>
</div>
<p data-keepout="tagline" data-pad="10" data-feather="40" data-strength="0.75">
  Nottingham AI Safety Initiative
</p>
<h1 data-keepout="headline" data-pad="18" data-feather="64" data-strength="0.8">
  <!-- 40px, pulled 8px up toward the tagline -->
  …
</h1>
<p data-keepout="lede" data-pad="12" data-feather="48" data-strength="0.8"><!-- 16px -->…</p>
<div data-keepout="cta" data-pad="12" data-feather="44" data-strength="0.85">
  <div><!-- a column, each link the full width -->
    <a href="…">Apply by Sun 18 Oct →</a>
    <a href="#this-term">Compare the programmes</a>
  </div>
  <div>APPLICATIONS OPEN NOW · CLOSE SUN 18 OCT, 23:59</div><!-- breaks at the dot -->
</div>
<!-- no award -->
```

Two places where the pieces differ from the boards on purpose: the award
keeps its zone on the tablet form (it sits below the network there, so the
zone changes nothing that is drawn), and the tablet board's pill is 46px
only because its two borders are added to its 44px.

## What the scene writes on the root

`mount.ts` writes these on the `<section>` that `HeroScene` renders, and the
stylesheet reads them. None is there until the script has run, and the page
must look right without them.

| Attribute | Values | Meaning |
| --- | --- | --- |
| `data-form` | `desktop`, `tablet`, `phone` | The form the scene is running in. For checks. Lay out with the media conditions, never with this. |
| `data-scene` | `running`, `still` | `still` under reduced motion. |
| `data-typing` | present or absent | The scene has taken over the accent's words. |
| `data-ul` | `none`, `grow`, `full`, `shrink` | The accent's underline. |
| `data-caret` | `on`, `off` | The caret after the accent. |
| `data-replay` | absent or `b` | Flips each time the entrance replays, to start the words' own entrance again. |

## How it behaves

- **Without the script.** The words, the emblem and the links are in the
  markup and arrive by the stylesheet's own entrance: the emblem from 0.25s,
  the headline's words from 0.5s, the paragraph from 0.9s, the links from
  1.05s, the accent at 1.76s and the award at 2.9s. The accent is underlined
  and has no caret. The ground is the navy gradient with no network.
- **Loading.** The component asks for the scene's script (`mount.ts`,
  `scene.ts` and the engine, one chunk) only after a frame has been painted.
  The canvas and the strip under the header are sized by the stylesheet, so
  the script's arrival moves nothing.
- **The headline.** If the script starts before the accent has appeared, the
  scene types it in, as the boards do. If it starts later, the scene leaves
  the words where they are and joins the loop the first time the loop holds
  the whole accent. Words a visitor has read are never taken away to be typed
  again.
- **Reduced motion.** One still frame of the finished network. No animation
  frame is asked for, nothing follows the pointer and the words do not
  animate.
- **Off screen.** The engine stops drawing while no part of the hero is on
  screen and picks up when it returns.
- **A hidden tab.** The engine asks for one frame at a time, and a browser
  gives none to a tab that is not showing, so nothing is drawn. When the tab
  returns the engine resets its clock, so the scene does not jump.
- **The pointer.** Nodes lean toward a mouse and brighten near it; a node
  under it fires toward the emblem.
- **A double click on the open scene** replays the entrance, the words' with
  it. That is the engine's own behaviour. A double click on the words does
  not: it is how a visitor selects one.
- **A finger scrolls the page, on every form.** The hero is one screen high,
  so on a phone every swipe starts on it. Nothing in the hero sets
  `touch-action` or keeps a touch for itself: a swipe moves the page, and two
  fingers zoom it. The design holds a drag on the phone and tablet forms so
  that it moves the network; that was built, tried on a phone and taken out,
  because a first screen that does not scroll reads as a broken page. The
  engine still hears a finger until the browser takes the gesture for a
  scroll, so a tap on the open scene and a sideways drag still reach it.
- **A link, by touch.** The engine captures a finger on the hero. When the
  finger went down on a link or button the capture is handed straight back,
  so the link is followed as any other link is.

## Rules for whoever changes this folder

1. **The engine is kept as shipped.** Do not edit `engine.js` between its two
   marker comments. `tests/hero-scene.test.mjs` holds the block's checksum. A
   new version of the scene replaces the whole block and the checksum, and
   the rest of that test says what the new script still has to do.
2. **Only `scene.ts` imports the engine, only `mount.ts` imports `scene.ts`,
   and `HeroScene.tsx` reaches `mount.ts` by a dynamic import alone.** That
   is what keeps the scene out of the page's first script. The same test
   holds it.
3. **The form's two conditions live in two places.** Change `mount.ts` and
   the stylesheet together.
4. **The emblem is the brand's mark.** `markArt.ts` is a copy of the hero's
   own artwork. Never redraw, recolour or re-cut it. The scene carries the
   same shapes, and the test compares the two.
5. **Nothing here may need the script to be readable.** A piece that only
   makes sense once the scene runs belongs in the scene, not in the markup.
