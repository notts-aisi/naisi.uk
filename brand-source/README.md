# NAISI brand assets (7 Oct 2026)

Built from the NAISI design system's Logos group. The emblem paths are the official files, unchanged.

## 1-emblem: the emblem alone
- `naisi-emblem.svg` / `.png`: colour (navy body, cyan offset), for light backgrounds.
- `naisi-emblem-night.svg` / `.png`: Night (white body, cyan offset), for dark backgrounds.
- PNGs are 1674 × 2048 with a transparent background.

## 2-lockup: emblem + "Nottingham AI Safety Initiative"
- The name is set in **Space Grotesk 600**, as chosen on 6 Oct. It's outlined, so no font is needed.
- The layout is the one on the canvas's lockup board.
- `naisi-lockup.svg` / `.png`: colour, for light backgrounds.
- `naisi-lockup-night.svg` / `.png`: Night, for dark backgrounds.
- PNGs are 2400 wide and transparent.
- `naisi-lockup-email-600w.png`: colour, for email. Show it at 300px wide so it stays sharp on retina screens. Gmail and Outlook don't show SVG, so emails need the PNG.
- `naisi-link-preview-1200x630.png`: the `og:image` / `twitter:image` card (Night lockup on the site's background).

## 3-app-icon: square, opaque, for the home screen
- The Night emblem on the site's dark background, with no transparency (iOS fills transparency with black and rounds the corners itself).
- `naisi-app-icon.svg` and `naisi-app-icon-1024.png`: the masters.
- `apple-touch-icon.png` (180): iOS home screen.
- `icon-192.png` and `icon-512.png`: the web app manifest (Android, installed web app). The emblem sits inside the maskable safe zone, so both can be `"purpose": "any maskable"`.

## 4-favicon: the browser tab (deliberately different from the app icon)
- The pixel tower from the brand canvas ("E3 · Responsive family", XS tier): a white tower with its cyan offset on a navy square, drawn on a 16px grid.
- `favicon.svg`, `favicon-16.png`, `favicon-32.png` (pixel-doubled) and `favicon.ico` (16/32/48).
- The navy square shows up on both light and dark tabs, so there's no dark-mode version.

## Wiring it up

In the `<head>` (Next.js can do the same through `metadata.icons` and `metadata.openGraph`):

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#0a0e16">
<meta property="og:image" content="https://naisi.uk/naisi-link-preview-1200x630.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

`manifest.webmanifest`:

```json
{
  "name": "Nottingham AI Safety Initiative",
  "short_name": "NAISI",
  "background_color": "#0a0e16",
  "theme_color": "#0a0e16",
  "display": "standalone",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

## Notes
- The design system's own logo files (`naisi-logo-horizontal*.svg`) still set the name in Lato. These Space Grotesk lockups are the new ones; the design system should get them too.
- The tab icon and the home-screen icon are separate files, so changing one never affects the other.
