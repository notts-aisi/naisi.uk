/**
 * What the rich-text editor's link box saves for what was typed into it.
 *
 *  - Nothing: nothing (the caller takes the link off).
 *  - EXACTLY ONE `{token}`, alone or after the `https://` or `http://` the
 *    box starts with: the token alone, `{groupUrl}`, as the seed copy of an
 *    email writes a link to one. The email fills it with a whole address when
 *    it is sent, so a scheme in front of it would be written twice.
 *  - Anything with a scheme of its own (`https://…`, `mailto:…`): as typed.
 *  - Anything else, a bare domain: with `https://` in front.
 *
 * Pure, so a test reads exactly what the box does.
 */
export function linkHrefFrom(typed: string): string {
  const url = typed.trim();
  if (!url) return "";
  const token = /^(?:https?:\/\/)?(\{[a-zA-Z][a-zA-Z0-9_]*\})$/i.exec(url);
  if (token) return token[1];
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
}
