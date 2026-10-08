import { Fragment } from "react";
import { linkedParts } from "@/lib/applications/linkedText";

/**
 * A line an author wrote, with the links in it.
 *
 * `linkedParts` (src/lib/applications/linkedText.ts) says which parts of the
 * text are links, and this draws them: a text part as a text node, a link
 * part as an anchor. That is all it does. Nothing here reads the text for
 * itself, so no anchor is ever drawn that the function did not pass, and
 * nothing is set as HTML.
 *
 * THE RULE: this is the one component under the application form's folders
 * that makes an address out of stored text. Another place that needs an
 * author's line with its links draws it through this, and
 * `tests/applications-linked-text.test.mjs` fails a file that builds an
 * `href` any other way until it is written down there.
 *
 * A link opens in a new tab, so somebody part way through the form keeps
 * their place, and is given no way back into the page that opened it.
 */
export default function LinkedText({
  text,
  linkClassName,
}: {
  /** The line as it was typed. */
  text: string;
  /** The look of a link where this is drawn. */
  linkClassName?: string;
}) {
  return (
    <>
      {linkedParts(text).map((part, at) =>
        part.kind === "link" ? (
          <a key={at} href={part.href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
            {part.text}
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        ) : (
          <Fragment key={at}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
