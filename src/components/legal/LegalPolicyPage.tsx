import Link from "next/link";
import { notFound } from "next/navigation";
import Chip from "@/components/ui/Chip";
import Notice from "@/components/ui/Notice";
import { POLICIES, type PolicyKey } from "@/lib/legal/policies";
import { LEGAL_CONTENT } from "@/content/legal/registry";
import { policyUpdateLine } from "@/lib/legal/updateLine";
import styles from "@/content/legal/legal.module.css";

/**
 * Renders a policy document: the current version, or a specific archived
 * version (`archived`) with a "view current" banner. The version's content
 * component is looked up from the registry; the meta line + banner are injected
 * into its slots so each version stays a frozen, self-contained module.
 *
 * The page around the words is drawn by `legal.module.css` alone: a version's
 * file is never edited to change how it looks, so the stylesheet lays out the
 * markup every version already has (the contents list beside the sections,
 * the numbers on both) and these two slots carry the only new elements.
 *
 * The banner slot is the archived notice on an archived version, and on the
 * current privacy policy, for 14 days from its date, the line saying it
 * changed (`policyUpdateLine`, the same line Home shows). The clock is read
 * here, at render: /privacy is regenerated often enough for the line to come
 * and go with the day (its page's `revalidate`).
 */
export default function LegalPolicyPage({
  policy,
  version,
  archived = false,
}: {
  policy: PolicyKey;
  version?: number;
  archived?: boolean;
}) {
  const meta = POLICIES[policy];
  const v = version ?? meta.versions[0].version;
  const entry = meta.versions.find((x) => x.version === v);
  const Content = LEGAL_CONTENT[policy]?.[v];
  if (!entry || !Content) notFound();

  const metaNode = (
    <p className={styles.meta}>
      <Chip>Version {v}</Chip>
      <span>Updated {entry.lastUpdated}</span>
      <span className={styles.metaDot} aria-hidden="true">
        ·
      </span>
      <Link className={styles.metaLink} href={`${meta.href}/versions`}>
        Earlier versions
      </Link>
    </p>
  );

  const updated = !archived && policy === "privacy" && v === meta.versions[0].version ? policyUpdateLine(new Date()) : null;

  const banner = archived ? (
    <Notice tone="info" role="note" className={styles.archivedBanner}>
      You’re viewing an archived version of this document (Version {v}).{" "}
      <Link href={meta.href}>View the current version</Link>.
    </Notice>
  ) : updated ? (
    <Notice tone="info" role="note" className={styles.updateBanner}>
      {updated.words} <Link href={updated.href}>{updated.link}</Link>
    </Notice>
  ) : undefined;

  return <Content meta={metaNode} banner={banner} />;
}
