/*
 * The picture a shared link shows for a page that has no picture of its own.
 *
 * The root layout does not name the card. Next reads
 * src/app/opengraph-image.png by its file name and writes the tags for every
 * page that sets no `openGraph`. A page that DOES set `openGraph` replaces
 * the layout's whole key, card included, because metadata is merged a key at
 * a time. So such a page names a picture itself, under both `openGraph` and
 * `twitter`, with `linkPreviewImages`: its own picture when it has one, the
 * card when it has none.
 *
 * `npm run brand` makes the picture from brand-source/2-lockup/.
 * tests/brand-assets.test.mjs holds what is written below to that file, and
 * every `openGraph` and `twitter` in src to this module.
 */

/**
 * The card, as a page's metadata names it. The address is where Next serves
 * src/app/opengraph-image.png, and it is resolved against the root layout's
 * `metadataBase`. The size, the type and the words are the file's own, so a
 * preview can lay the picture out before it has fetched it.
 */
export const LINK_PREVIEW_CARD = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Nottingham AI Safety Initiative",
};

/**
 * The `images` of a page's `openGraph` and of its `twitter`: the page's own
 * picture when it has one, the card when it has none.
 */
export function linkPreviewImages(own?: string | null) {
  return [own ? { url: own } : { ...LINK_PREVIEW_CARD }];
}
