/**
 * THE NAME A CERTIFICATE PRINTS, decided apart from every other name.
 *
 * A certificate prints the account's display name (Google's name, for an
 * account made with Google), then the name they go by, then "NAISI member":
 * what it printed before the site asked anybody for a full name. It is its
 * own rule because it is not the rule screens follow (`nameForViewer` in
 * `./staffName.ts`), and because a certificate whose link is on can be read
 * by anybody holding the link: printing the full name the committee asks
 * for would show it outside the committee, which the privacy policy does not
 * say. Changing what a certificate prints is a decision of its own, with the
 * policy's words beside it. `tests/names-rule.test.mjs` holds its output.
 *
 * Never an address. Pure.
 */
export function certificateNameOf(data: Record<string, unknown>): string {
  const profile = (data.profile as Record<string, unknown> | undefined) ?? {};
  const display = typeof data.displayName === "string" ? data.displayName.trim() : "";
  const preferred = typeof profile.preferredName === "string" ? profile.preferredName.trim() : "";
  return display || preferred || "NAISI member";
}
