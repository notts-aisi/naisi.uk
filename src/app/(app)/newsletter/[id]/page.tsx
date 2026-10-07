import Link from "next/link";
import DraftEditor from "@/features/newsletter/DraftEditor";
import EditorRail from "@/features/newsletter/EditorRail";
import { ChevronLeftIcon } from "@/features/newsletter/icons";
import styles from "../newsletter.module.css";

export default async function NewsletterDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className={styles.splitWrap}>
      {/* Shown only where there is no room for the rail. */}
      <Link href="/newsletter" className={styles.back}>
        <ChevronLeftIcon size={16} />
        All newsletters
      </Link>
      <div className={styles.split}>
        <div className={styles.splitRail}>
          <EditorRail currentId={id} />
        </div>
        <div className={styles.splitMain}>
          <DraftEditor draftId={id} />
        </div>
      </div>
    </div>
  );
}
