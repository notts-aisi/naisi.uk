import ErrorPanel from "@/components/ErrorPanel";
import { PUBLIC_WAYS_ON } from "@/components/ErrorPanel.ways";

/**
 * Root 404. Covers any URL that matches no route at all, including the three trees that sit outside a route group: /verify-email/[tokenId], /re-consent and /collaborator.
 *
 * Before this file, an unmatched URL shipped Next's stock white 404 page, which is jarring on a site that is black everywhere else. Note this one renders inside the root layout but outside every group layout, so it has no header and no nav: the list of ways on is the only navigation it has, and the group-level files cover the common cases with proper chrome.
 */
export default function NotFound() {
  return (
    <main>
      <ErrorPanel
        field
        fill
        eyebrow="Error 404"
        title="We can’t find that page."
        description="It may have moved, or the link has a typo."
        ways={PUBLIC_WAYS_ON}
      />
    </main>
  );
}
