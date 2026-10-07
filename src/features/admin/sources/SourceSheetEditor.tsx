"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ImageUpload from "@/components/blocks/ImageUpload";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import { Input, Textarea } from "@/components/ui/Input";
import Notice from "@/components/ui/Notice";
import PageHead from "@/components/ui/PageHead";
import { AdminLoadingBar } from "@/features/admin/adminList";
import { AdminActionRow, AdminPanel, AdminProblem } from "@/features/admin/adminPanels";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import {
  appendSourceItem,
  advanceNextNumber,
  moveSourceItem,
  removeSourceItem,
  updateSourceItem,
  validateSourceItems,
  SOURCE_SHEET_LIMITS,
  type SourceItem,
  type SourceSheetDoc,
} from "@/lib/firestore/sourceSheets";
import SourceFileUpload from "./SourceFileUpload";
import SourceRow from "./SourceRow";
import { loadSourceSheet } from "./sourceSheetData";
import {
  deleteSourceSheet,
  publishSourceSheet,
  saveSourceSheet,
  setSourceSheetFile,
  setSourceSheetImage,
  undeletedFilesWarning,
  unpublishSourceSheet,
  SOURCE_STORAGE_PREFIX,
} from "./sourceSheetMutations";
import styles from "./editor.module.css";

/**
 * The editor for one source sheet.
 *
 * Two things in here are irreversible once the material is printed, and the
 * copy says so rather than relying on the person remembering:
 *
 *  - THE NUMBERS. Each row carries its own stored number, minted from a
 *    counter that only grows. Deleting a row leaves its number unused for
 *    good, which is the correct outcome: the superscript on the poster still
 *    points where it pointed. Editing a number on an entry that has ever been
 *    published gets a warning in the page, because the poster in somebody's
 *    hand will disagree with it.
 *  - THE ADDRESS. The slug is the document id and the printed URL. It is set
 *    when the entry is created and shown read-only here.
 *
 * The uploads write to Firestore as soon as they finish rather than waiting
 * for Save: the bytes are in Storage by then, so a tab closed in between would
 * otherwise leave an object nothing references.
 *
 * That makes two kinds of state in one form, and they must not be refreshed
 * the same way. `adopt` replaces the editable copy (title, list, numbers) with
 * what is stored, which is right after Save and wrong after an upload: a
 * person who typed ten sources and then added the poster image would lose all
 * ten. So an upload, an alt-text edit and an unpublish go through
 * `refreshStored`, which updates only what the page reads from the stored
 * document and leaves the typing alone.
 */
export default function SourceSheetEditor({ slug }: { slug: string }) {
  const router = useRouter();

  const [sheet, setSheet] = useState<SourceSheetDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  // The editable copy. Held here so Save is one write rather than one per
  // keystroke, matching every other admin form in the app.
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [summary, setSummary] = useState("");
  const [items, setItems] = useState<SourceItem[]>([]);
  const [nextNumber, setNextNumber] = useState(1);
  const [numbersTouched, setNumbersTouched] = useState(false);

  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Files that outlived a delete. Kept apart from `error` so the next action
  // does not clear it: it stays true until somebody removes the files.
  const [warning, setWarning] = useState<string | null>(null);

  // Alt text is typed a character at a time and the uploader reports every
  // one. The screen follows at once; the write waits until the typing stops.
  const altTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAlt = useRef<(() => Promise<void>) | null>(null);

  const adopt = useCallback((next: SourceSheetDoc) => {
    setSheet(next);
    setTitle(next.title);
    setContext(next.context);
    setSummary(next.summary);
    setItems(next.items);
    setNextNumber(next.nextNumber);
    setNumbersTouched(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSourceSheet(slug)
      .then((found) => {
        if (cancelled) return;
        if (!found) {
          setMissing(true);
          return;
        }
        adopt(found);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, adopt]);

  const errors = useMemo(() => validateSourceItems(items), [items]);
  const published = Boolean(sheet?.publishedAt);
  const everPublished = Boolean(sheet?.publishedAt || sheet?.firstPublishedAt);

  /** After Save or Publish: the stored copy IS the typed copy, so adopt it. */
  async function reload() {
    const found = await loadSourceSheet(slug);
    if (found) adopt(found);
  }

  /** After an upload or an unpublish: refresh what is stored, keep the typing. */
  async function refreshStored() {
    const found = await loadSourceSheet(slug);
    if (found) setSheet(found);
  }

  function noteSurvivors(paths: string[]) {
    const text = undeletedFilesWarning(paths);
    if (text) setWarning(text);
  }

  function queueAltWrite(alt: string) {
    setSheet((current) =>
      current?.image ? { ...current, image: { ...current.image, alt } } : current,
    );
    const write = async () => {
      pendingAlt.current = null;
      const image = sheetRef.current?.image;
      if (!image) return;
      try {
        await setSourceSheetImage(slug, { ...image, alt }, null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the image description.");
      }
    };
    if (altTimer.current) clearTimeout(altTimer.current);
    pendingAlt.current = write;
    altTimer.current = setTimeout(write, 700);
  }

  // The write above runs later, so it reads the image from a ref rather than
  // from the render it was queued in.
  const sheetRef = useRef<SourceSheetDoc | null>(null);
  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

  // Leaving the page inside the pause must not drop the last edit.
  useEffect(() => {
    return () => {
      if (altTimer.current) clearTimeout(altTimer.current);
      void pendingAlt.current?.();
    };
  }, []);

  function onAddRow() {
    const next = appendSourceItem(items, nextNumber);
    setItems(next.items);
    setNextNumber(next.nextNumber);
  }

  function onRowChange(id: string, patch: Partial<Omit<SourceItem, "id">>) {
    if (patch.n !== undefined) setNumbersTouched(true);
    const next = updateSourceItem(items, id, patch);
    setItems(next);
    // The counter follows a hand-typed number upwards so the next minted row
    // cannot land on one already in use. It never follows it back down.
    setNextNumber((current) => advanceNextNumber(current, next));
  }

  function onRemoveRow(id: string) {
    const row = items.find((item) => item.id === id);
    if (
      row &&
      !window.confirm(
        `Remove source ${row.n}? Number ${row.n} is never given to another source, so anything already printed still points where it pointed.`,
      )
    ) {
      return;
    }
    setItems(removeSourceItem(items, id));
  }

  async function onSave() {
    if (errors.length > 0) {
      setError("Fix the problems listed beside the sources first.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveSourceSheet(slug, { title, context, summary, items, nextNumber });
      await reload();
      setMessage("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function onPublish() {
    if (!sheet) return;
    if (errors.length > 0) {
      setError("Fix the problems listed beside the sources first.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // Saved first, so publishing can never put a stale copy of the list on
      // the public page.
      await saveSourceSheet(slug, { title, context, summary, items, nextNumber });
      await publishSourceSheet(sheet);
      await reload();
      setMessage("Published. The page is live at /sources/" + slug + ".");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish.");
    } finally {
      setBusy(false);
    }
  }

  async function onUnpublish() {
    if (!sheet) return;
    const hasUploads = Boolean(sheet.image || sheet.file);
    const warning = hasUploads
      ? "Unpublish this source sheet?\n\nThe page comes down, and the image and the PDF are DELETED from storage. The list of sources is kept, so you can publish it again later, but the files would have to be uploaded again.\n\nAnyone already holding a direct file link, or the printed material itself, still has what they have."
      : "Unpublish this source sheet?\n\nThe page comes down and the list of sources is kept, so you can publish it again later.";
    if (!window.confirm(warning)) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      noteSurvivors(await unpublishSourceSheet(sheet));
      await refreshStored();
      setMessage("Unpublished. The page now says the sources are not published yet.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unpublish.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!sheet) return;
    if (
      !window.confirm(
        `Delete "${sheet.title}" for good?\n\nThe source sheet, the image and the PDF are all deleted. Any QR code printed with /sources/${slug} on it will land on a page saying the sources are not published yet.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const left = undeletedFilesWarning(await deleteSourceSheet(sheet));
      // Said before leaving, because the entry this page belongs to is gone
      // and there is nowhere left to show it.
      if (left) window.alert(left);
      router.push("/admin/sources");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.editor}>
        <PageHead crumb={<SheetCrumb />} title="Source sheet" />
        <Card padding="md">
          <AdminLoadingBar label="Loading the source sheet…" />
        </Card>
      </div>
    );
  }

  if (missing || !sheet) {
    return (
      <div className={styles.editor}>
        <PageHead
          crumb={<SheetCrumb />}
          title={missing ? "No source sheet here" : "Source sheet"}
          description={
            missing ? (
              <>
                There is no source sheet at <strong>/sources/{slug}</strong>.
              </>
            ) : undefined
          }
          meta={<Link href="/admin/sources">Back to Source sheets</Link>}
        />
        {error && <AdminProblem>Couldn&apos;t load: {error}</AdminProblem>}
      </div>
    );
  }

  return (
    <div className={styles.editor}>
      <PageHead
        crumb={<SheetCrumb />}
        title={sheet.title}
        badges={
          published ? (
            <Chip tone="success">Published</Chip>
          ) : everPublished ? (
            <Chip
              tone="warning"
              title="It was published once, so copies of the material may be in circulation"
            >
              Unpublished
            </Chip>
          ) : (
            <Chip tone="neutral">Draft</Chip>
          )
        }
        meta={
          <>
            <span className={styles.slug}>/sources/{slug}</span>
            {sheet.publishedAt && (
              <span>
                Published since{" "}
                {formatSiteDate(sheet.publishedAt, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            )}
            {published && (
              <a href={`/sources/${slug}`} target="_blank" rel="noreferrer noopener">
                View the public page
              </a>
            )}
          </>
        }
      />

      <AdminPanel title="Details">
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>Title</span>
            <Input
              value={title}
              maxLength={SOURCE_SHEET_LIMITS.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Freshers fair poster, September 2026"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Context (optional)</span>
            <Input
              value={context}
              maxLength={SOURCE_SHEET_LIMITS.context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Handed out at the societies fair, 20 September 2026"
            />
            <span className={styles.hint}>
              One line saying where this material appeared, for somebody reading
              the page a year later.
            </span>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Summary (optional)</span>
            <Textarea
              value={summary}
              maxLength={SOURCE_SHEET_LIMITS.summary}
              rows={3}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What the poster says, in a sentence or two."
            />
          </label>
        </div>
        <p className={styles.hint}>
          The address <strong>/sources/{slug}</strong> is fixed. It is what goes
          under the QR code, so changing it would orphan anything already
          printed. A different address means a new source sheet.
        </p>
      </AdminPanel>

      <AdminPanel
        title="The material"
        description="Both are optional: a source sheet can be published with its sources alone, and either file can be added, swapped or removed afterwards without taking the page down."
      >
        <div className={styles.fields}>
          <div className={styles.field}>
            <span className={styles.label}>Image of the material</span>
            <ImageUpload
              draftId={slug}
              storagePrefix={SOURCE_STORAGE_PREFIX}
              currentUrl={sheet.image?.url}
              currentAlt={sheet.image?.alt ?? ""}
              hideTextFields={false}
              disabled={busy}
              onChange={async (next) => {
                try {
                  if (!next.url) {
                    noteSurvivors(
                      await setSourceSheetImage(slug, null, sheet.image?.storagePath),
                    );
                  } else if (!next.storagePath) {
                    // An alt-text edit: the uploader re-sends the same url with
                    // no storagePath. Nothing is superseded, so nothing is
                    // deleted, and the write waits for the typing to stop.
                    queueAltWrite(next.alt);
                    return;
                  } else {
                    // A NEW upload, which supersedes the old object.
                    noteSurvivors(
                      await setSourceSheetImage(
                        slug,
                        { url: next.url, storagePath: next.storagePath, alt: next.alt },
                        sheet.image?.storagePath,
                      ),
                    );
                  }
                  await refreshStored();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not save the image.");
                }
              }}
            />
            <span className={styles.hint}>
              A photo or export of the poster itself. Shown on the public page
              above the list.
            </span>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Downloadable PDF</span>
            <SourceFileUpload
              slug={slug}
              current={sheet.file}
              disabled={busy}
              onChange={async (next) => {
                try {
                  noteSurvivors(await setSourceSheetFile(slug, next, sheet.file?.storagePath));
                  await refreshStored();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not save the PDF.");
                }
              }}
            />
          </div>
        </div>
      </AdminPanel>

      <AdminPanel
        title="Sources"
        description="The number is what appears in superscript on the material. It is stored against the source, so removing one leaves a gap rather than renumbering everything below it."
      >
        {everPublished && numbersTouched && (
          <Notice tone="warning">
            This source sheet has been published, so copies of the material may
            already be in circulation. Changing a number here will not change
            the numbers printed on them.
          </Notice>
        )}

        {items.length === 0 ? (
          <p className={styles.hint}>No sources yet.</p>
        ) : (
          <ol className={styles.rows}>
            {items.map((item, index) => (
              <SourceRow
                key={item.id}
                item={item}
                index={index}
                count={items.length}
                errors={errors.filter((e) => e.id === item.id)}
                disabled={busy}
                onChange={(patch) => onRowChange(item.id, patch)}
                onMove={(direction) => setItems(moveSourceItem(items, index, direction))}
                onRemove={() => onRemoveRow(item.id)}
              />
            ))}
          </ol>
        )}

        <div className={styles.actions}>
          <Button
            size="sm"
            variant="secondary"
            onClick={onAddRow}
            disabled={busy || items.length >= SOURCE_SHEET_LIMITS.maxItems}
          >
            Add a source
          </Button>
        </div>
      </AdminPanel>

      {warning && <AdminProblem>{warning}</AdminProblem>}
      {error && <AdminProblem>{error}</AdminProblem>}

      <div className={styles.footer}>
        <Button onClick={onSave} disabled={saving || busy}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {!published && (
          <Button variant="secondary" onClick={onPublish} disabled={saving || busy}>
            Save and publish
          </Button>
        )}
        {message && (
          <span className={styles.message} role="status">
            {message}
          </span>
        )}
      </div>

      <AdminPanel title="Careful" tone="careful">
        {published && (
          <AdminActionRow
            name="Unpublish"
            note="The page comes down, and the image and the PDF are deleted from storage. The list of sources is kept, so it can be published again."
          >
            <Button variant="danger" onClick={onUnpublish} disabled={saving || busy}>
              Unpublish…
            </Button>
          </AdminActionRow>
        )}
        <AdminActionRow
          name="Delete this source sheet"
          note={
            <>
              The sheet, the image and the PDF are all deleted. A QR code printed with /sources/
              {slug} on it will land on a page saying the sources are not published yet.
            </>
          }
        >
          <Button variant="danger" onClick={onDelete} disabled={saving || busy}>
            Delete source sheet…
          </Button>
        </AdminActionRow>
      </AdminPanel>
    </div>
  );
}

/** The way back, above the sheet's name. */
function SheetCrumb() {
  return (
    <>
      <span>Publicity</span>
      <span aria-hidden="true">/</span>
      <Link href="/admin/sources">Source sheets</Link>
    </>
  );
}
