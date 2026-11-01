import type { ReactNode } from "react";
import { Link, Text } from "@react-email/components";
import type { Block } from "@/lib/firestore/newsletterBlocks";
import { UNSUBSCRIBE_WORDS } from "@/lib/messages/words";
import BlockRenderer from "./blocks/BlockRenderer";
import EmailChrome, { emailFooterTextStyle, emailLinkStyle } from "./EmailChrome";

/**
 * A message written in Messages (docs/messages.md): the subject as the
 * heading, the message as its writer typed it, and the line saying who sent
 * it, the staff email's own blocks (`staffMessageBlocks`), so every message
 * a person running something writes reads the same.
 *
 * ONE TEMPLATE, THREE WAYS IT GOES:
 *  - AS A NOTICE, with the marker `sendNotice` builds for the `messages`
 *    surface above the body (`notice`), and no unsubscribe link, because
 *    there is nothing to switch off.
 *  - BY THEIR SETTINGS, with the line at its foot saying which row of their
 *    settings it read and the link that unsubscribes them from that row
 *    (`unsubscribe`), paired with the RFC 8058 headers the route sets.
 *  - AS A TEST to its writer, with neither: nobody's settings were passed
 *    over, and a link to unsubscribe the writer from their own rehearsal
 *    would do something nobody asked for.
 *
 * The blocks are built from text by the caller and escaped there; nothing
 * the writer typed reaches this template as markup.
 */

type Props = {
  subject: string;
  blocks: Block[];
  preheader?: string;
  /** The notice lane's marker, from `sendNotice`. */
  notice?: ReactNode;
  /** A message by their settings: why it reached them, and the link that unsubscribes them from the row. */
  unsubscribe?: { because: string; url: string };
};

export default function MessageEmail({ subject, blocks, preheader, notice, unsubscribe }: Props) {
  return (
    <EmailChrome
      subject={subject}
      preheader={preheader}
      footerSlot={
        unsubscribe ? (
          <Text style={emailFooterTextStyle}>
            {unsubscribe.because} {UNSUBSCRIBE_WORDS.before}
            <Link href={unsubscribe.url} style={emailLinkStyle}>
              {UNSUBSCRIBE_WORDS.link}
            </Link>
            {UNSUBSCRIBE_WORDS.after}
          </Text>
        ) : undefined
      }
    >
      {notice}
      {blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </EmailChrome>
  );
}
