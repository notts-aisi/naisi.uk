import ErrorPanel from "@/components/ErrorPanel";
import { PUBLIC_WAYS_ON } from "@/components/ErrorPanel.ways";

/**
 * 404 for the public site. Reached by the notFound() calls in the news, events, courses, privacy and terms detail routes, and by unmatched URLs under those trees.
 *
 * A course page circulated before it is published, or a week URL guessed from
 * a neighbour, both 404 by design so a draft is indistinguishable from a typo.
 * The screen says the same thing for each, and offers four places to go.
 *
 * Renders inside the public layout, so it keeps the header and footer and the reader can navigate onward rather than being dumped somewhere chromeless.
 */
export default function NotFound() {
  return (
    <ErrorPanel
      field
      eyebrow="Error 404"
      title="We can’t find that page."
      description="It may have moved, or the link has a typo."
      ways={PUBLIC_WAYS_ON}
    />
  );
}
