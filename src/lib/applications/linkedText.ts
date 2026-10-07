/**
 * THE TWO SHAPES OF AUTHORED TEXT THAT BECOME A LINK.
 *
 * A question's help line is plain text that an author types and an applicant
 * reads. Two shapes in it are drawn as a link, and nothing else in it is ever
 * markup:
 *
 *  - an address that begins `https://`, written out where it stands;
 *  - `[words](https://address)`, which shows the words.
 *
 * `linkedParts` splits a string into the parts that are text and the parts
 * that are links. `src/features/applications/kit/LinkedText.tsx` draws them,
 * and is the only thing that turns stored text into an address somebody can
 * press (`tests/applications-linked-text.test.mjs` walks the form's folders
 * for a second).
 *
 * ## What is a link, and what stays text
 *
 * ONLY `https:`. Every other way of writing an address stays text exactly as
 * it was typed: `http:`, `javascript:`, `data:`, `mailto:`, an address with
 * no scheme (`//host`), a path on this site. The scheme is read whatever its
 * letter case, because a browser reads it that way and a phone's keyboard
 * capitalises the first letter of a line.
 *
 * AN ADDRESS IS ON A NAMED SITE, IN PLAIN CHARACTERS. Its site is letters,
 * digits, hyphens and dots, ending in a name (`example.org`), with nothing
 * before it: no name and password, no number written as a site, no character
 * that only looks like a letter. Every other character in it is one a web
 * address is written in. An address that fails any of this is not shortened
 * to the part that passes: the whole of it stays text, so no link ever goes
 * somewhere other than the address a reader was shown.
 *
 * WHERE A BARE ADDRESS STARTS AND STOPS. It starts at the beginning of the
 * text, or after white space or an opening bracket or quote mark, so an
 * address inside another one (`javascript:https://...`) is not picked out. It
 * stops at white space, a control character, a square bracket, `<`, `>` or
 * `"`. A full stop, comma or other mark of punctuation at its end belongs to
 * the sentence, and so does a closing bracket the address did not open: "(see
 * https://example.org/a)." links the address and nothing after it.
 *
 * THE WORDS OF A LINK ARE WORDS. `[words](address)` is a link only when the
 * words say something, carry no control or hidden direction characters, and
 * name no site of their own other than the one the link goes to. So
 * `[example.org](https://elsewhere.example)` stays text, and each address in
 * it that can stand as a bare address is linked to itself.
 *
 * ## How it is read
 *
 * One pass over the text, by hand. Every scan is held to a fixed length or
 * made once and remembered, so a very long line costs time in proportion to
 * its length whatever it holds. The address handed to the browser is the one
 * the platform's own parser wrote out, and it is checked to be `https:` on the
 * site that was typed.
 *
 * Pure, with no import: the same function runs on the server, in the browser
 * and in a test.
 */

export type LinkedPart =
  /** Drawn as it is. */
  | { kind: "text"; text: string }
  /** `text` is what a reader sees. `href` always begins `https://`. */
  | { kind: "link"; text: string; href: string };

/**
 * What the form's editor says beside a box whose text is drawn this way. One
 * sentence for every such box, and a test runs its own example through
 * `linkedParts`, so the editor never promises a shape this does not draw.
 */
export const LINKS_HINT =
  "An address that starts https:// becomes a link. To link some words instead, write [the words](https://example.org).";

/** The longest address that is made into a link. A longer one stays text. */
export const MAX_LINK_ADDRESS = 2000;

/** The most characters the words of a `[words](address)` link may run to. */
export const MAX_LINK_WORDS = 300;

const SCHEME = "https://";

/** The characters a web address is written in, and no others. */
const ADDRESS_CHARS = /^[A-Za-z0-9\-._~:/?#@!$&'()*+,;=%]*$/;

/** Marks that end a sentence or a clause, and so are not the end of an address. */
const TRAILING_MARKS = ".,;:!?'*";

/** White space, a line break or a control character. None is part of an address. */
function isBreak(code: number): boolean {
  return (
    code <= 0x20 ||
    (code >= 0x7f && code <= 0xa0) ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

/**
 * A character an address cannot run through: a break, a square bracket, an
 * angle bracket or a double quote.
 */
function endsAddress(text: string, at: number): boolean {
  const code = text.charCodeAt(at);
  return isBreak(code) || code === 0x5b || code === 0x5d || code === 0x3c || code === 0x3e || code === 0x22;
}

/** What may come straight before a bare address: a break, or an opening bracket or quote mark. */
function opensAddress(code: number): boolean {
  return (
    isBreak(code) ||
    code === 0x28 || // (
    code === 0x5b || // [
    code === 0x7b || // {
    code === 0x3c || // <
    code === 0x22 || // "
    code === 0x27 || // '
    code === 0x201c || // an opening double curly quote
    code === 0x2018 || // an opening single curly quote
    code === 0xab // an opening angle quote
  );
}

/** Does the text read `https://` here, in any letter case? Plain letters only. */
function schemeAt(text: string, at: number): boolean {
  if (at + SCHEME.length > text.length) return false;
  for (let k = 0; k < SCHEME.length; k += 1) {
    const typed = text.charCodeAt(at + k);
    const wanted = SCHEME.charCodeAt(k);
    // A capital letter is its small letter with one bit clear. Nothing else is.
    const same = typed === wanted || (wanted >= 0x61 && wanted <= 0x7a && typed === wanted - 0x20);
    if (!same) return false;
  }
  return true;
}

/** A site's name: `example.org`, `docs.example.co.uk`. Never a number, never a single word. */
function isSiteName(host: string): boolean {
  if (host.length === 0 || host.length > 253) return false;
  const labels = host.split(".");
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) return false;
    if (!/^[a-z0-9-]+$/.test(label)) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
  }
  const ending = labels[labels.length - 1];
  return ending.length >= 2 && /^[a-z]/.test(ending);
}

/**
 * The address a browser would follow, when what was typed is a plain `https`
 * address on a named site, or null when it is anything else.
 *
 * The answer is what the platform's parser wrote out, never the typed text,
 * and it is returned only when the parser agrees about the two things that
 * were checked by hand: the scheme, and the site.
 */
export function httpsHref(address: string): string | null {
  if (address.length <= SCHEME.length || address.length > MAX_LINK_ADDRESS) return null;
  if (!ADDRESS_CHARS.test(address) || !schemeAt(address, 0)) return null;
  const rest = address.slice(SCHEME.length);
  const stop = rest.search(/[/?#]/);
  const authority = stop === -1 ? rest : rest.slice(0, stop);
  // The site, and at most a port. No name and password, and nothing encoded.
  const typed = /^([A-Za-z0-9.-]+)(?::[0-9]{1,5})?$/.exec(authority);
  if (!typed) return null;
  const host = typed[1].toLowerCase();
  if (!isSiteName(host)) return null;
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
  if (url.hostname !== host) return null;
  return url.href.startsWith(SCHEME) ? url.href : null;
}

/**
 * An address with the end of its sentence taken off: marks of punctuation,
 * characters no address is written in, and round brackets it did not open.
 */
function withoutSentenceEnd(candidate: string): string {
  // Opening round brackets, less closing ones. Below zero, one was not opened here.
  let open = 0;
  for (let at = 0; at < candidate.length; at += 1) {
    const code = candidate.charCodeAt(at);
    if (code === 0x28) open += 1;
    else if (code === 0x29) open -= 1;
  }
  let end = candidate.length;
  while (end > SCHEME.length) {
    const last = candidate[end - 1];
    const closing = last === ")";
    const strays = !ADDRESS_CHARS.test(last) || TRAILING_MARKS.includes(last) || (closing && open < 0);
    if (!strays) break;
    if (closing) open += 1;
    end -= 1;
  }
  return candidate.slice(0, end);
}

type Found = { part: LinkedPart; end: number };

/** `[words](https://address)` beginning at `at`, where the text has `[`, or null. */
function wordedLinkAt(text: string, at: number): Found | null {
  // The words: up to the first `]`, with no square bracket inside them.
  const wordsLimit = Math.min(text.length, at + MAX_LINK_WORDS + 2);
  let close = -1;
  for (let j = at + 1; j < wordsLimit; j += 1) {
    const code = text.charCodeAt(j);
    if (code === 0x5b) return null;
    if (code === 0x5d) {
      close = j;
      break;
    }
  }
  if (close === -1 || text.charCodeAt(close + 1) !== 0x28) return null;

  // The address: up to the `)` that closes the one after the words. An
  // address may hold round brackets of its own, as long as each is closed.
  const from = close + 2;
  const addressLimit = Math.min(text.length, from + MAX_LINK_ADDRESS + 1);
  let depth = 0;
  let end = -1;
  for (let j = from; j < addressLimit; j += 1) {
    if (endsAddress(text, j)) return null;
    const code = text.charCodeAt(j);
    if (code === 0x28) depth += 1;
    else if (code === 0x29) {
      if (depth === 0) {
        end = j;
        break;
      }
      depth -= 1;
    }
  }
  if (end === -1) return null;

  const href = httpsHref(text.slice(from, end));
  if (!href) return null;
  const words = text.slice(at + 1, close);
  if (!wordsSuit(words, href)) return null;
  return { part: { kind: "link", text: words, href }, end: end + 1 };
}

/** Control characters and the hidden ones that change which way text runs or take up no room. */
const HIDDEN_CHARS =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/;

/** Anything in a run of words that reads as a site's name, in any alphabet. */
const SITE_LIKE = /(?:[\p{L}\p{N}-]+[.\u3002])+\p{L}[\p{L}\p{N}-]*[\p{L}\p{N}]/gu;

/**
 * May these words be what somebody presses to go to this address?
 *
 * Not when there is nothing to read, not when they carry a character that
 * hides or reorders them, and not when they name a site of their own: words
 * that read `example.org` and go somewhere else say one thing and do another.
 * The one site they may name is the one the link goes to.
 */
function wordsSuit(words: string, href: string): boolean {
  if (words.trim() === "" || words.length > MAX_LINK_WORDS) return false;
  if (HIDDEN_CHARS.test(words)) return false;
  const host = new URL(href).hostname;
  // Compatibility forms are folded first, so a name written in full-width
  // letters is read as the name it looks like.
  const folded = words.normalize("NFKC").toLowerCase();
  for (const named of folded.match(SITE_LIKE) ?? []) {
    if (named.replace(/\u3002/g, ".") !== host) return false;
  }
  return true;
}

/**
 * A piece of authored text as the parts it is drawn from, in order: text, and
 * the links in it. Text parts are never empty and no two are adjacent.
 */
export function linkedParts(text: string): LinkedPart[] {
  const parts: LinkedPart[] = [];
  let textFrom = 0;
  let at = 0;

  // Where the next character that ends an address is, found once and kept
  // for every start before it, so no stretch of text is walked twice.
  let nextStop = -1;
  const stopFrom = (from: number): number => {
    if (nextStop < from) {
      nextStop = from;
      while (nextStop < text.length && !endsAddress(text, nextStop)) nextStop += 1;
    }
    return nextStop;
  };

  /** A bare address beginning at `from`, or null. */
  const bareAddressAt = (from: number): Found | null => {
    const stop = stopFrom(from);
    if (stop - from > MAX_LINK_ADDRESS) return null;
    const address = withoutSentenceEnd(text.slice(from, stop));
    const href = httpsHref(address);
    if (!href) return null;
    return { part: { kind: "link", text: address, href }, end: from + address.length };
  };

  while (at < text.length) {
    const code = text.charCodeAt(at);
    let found: Found | null = null;
    if (code === 0x5b) {
      found = wordedLinkAt(text, at);
    } else if (
      (code === 0x68 || code === 0x48) &&
      schemeAt(text, at) &&
      (at === 0 || opensAddress(text.charCodeAt(at - 1)))
    ) {
      found = bareAddressAt(at);
    }
    if (!found) {
      at += 1;
      continue;
    }
    if (at > textFrom) parts.push({ kind: "text", text: text.slice(textFrom, at) });
    parts.push(found.part);
    at = found.end;
    textFrom = at;
  }
  if (textFrom < text.length) parts.push({ kind: "text", text: text.slice(textFrom) });
  return parts;
}
