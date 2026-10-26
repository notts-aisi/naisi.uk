import Link from "next/link";
import Prose from "@/features/courses/weekBlocks/Prose";
import type { GlossaryDoc } from "@/lib/courses/guide/model";
import { GLOSSARY, GLOSSARY_EMPTY, SOMETHING_MISSING, backToWords } from "@/lib/courses/guide/words";
import GlossaryFind from "./GlossaryFind";
import GuideHead, { GuidePhoneBar } from "./GuideHead";
import styles from "./guide.module.css";

/**
 * A PROGRAMME'S GLOSSARY, AS SOMEBODY ON IT READS IT (boards wk-glossary and
 * wk-glossary-phone): the programme's label and "Glossary", the guide's
 * opening, the find box with the count of terms from the record, every term
 * and its definition in the guide's order (two columns on a wide page), any
 * text after the guide's table, and the foot. A run with no Glossary yet
 * draws a calm line and the way back.
 */

type Props = {
  backHref: string;
  programmeName: string;
  eyebrow: string;
  doc: GlossaryDoc | null;
};

export default function Glossary({ backHref, programmeName, eyebrow, doc }: Props) {
  return (
    <div className={styles.page}>
      <GuidePhoneBar backHref={backHref} programmeName={programmeName} title={GLOSSARY} />
      <article className={styles.wide}>
        <GuideHead backHref={backHref} programmeName={programmeName} eyebrow={eyebrow} title={GLOSSARY} />
        {doc ? (
          <>
            <Prose prose={doc.lead} className={styles.lede} listClassName={styles.list} linkClassName={styles.inlineLink} codeClassName={styles.code} />
            <GlossaryFind terms={doc.terms} />
            {doc.after.length > 0 && (
              <Prose prose={doc.after} className={styles.body} listClassName={styles.list} linkClassName={styles.inlineLink} codeClassName={styles.code} />
            )}
            <div className={styles.foot}>
              <p>{SOMETHING_MISSING}</p>
            </div>
          </>
        ) : (
          <div className={styles.empty}>
            <p>{GLOSSARY_EMPTY}</p>
            <Link className={styles.emptyLink} href={backHref}>
              {backToWords(programmeName)}
            </Link>
          </div>
        )}
      </article>
    </div>
  );
}
