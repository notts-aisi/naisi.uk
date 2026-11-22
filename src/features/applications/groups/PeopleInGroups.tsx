"use client";

import Link from "next/link";
import { groupPagePath } from "@/lib/courses/groupPage/words";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, useSortable, type SortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ActionToast, { useActionToast } from "@/components/ui/ActionToast";
import Dropdown, { type DropdownOption } from "@/components/ui/Dropdown";
import InitialsChip from "@/components/ui/InitialsChip";
import { ChevronDownIcon, GripIcon, InfoIcon, MoreIcon } from "@/features/applications/editor/Icons";
import shared from "@/features/applications/editor/editor.module.css";
import { facilitatedGroupOf } from "@/features/courses/allocationFit";
import { placingCounts, poolRowIsToPlace, rowHasLeft } from "@/features/courses/allocationTally";
import { askMidTermMoves } from "@/features/courses/askMidTermMoves";
import TakeOffSheet from "@/features/courses/takeOff/TakeOffSheet";
import { useAllocation, type AllocGroup, type AllocRow, type Placement } from "@/features/courses/useAllocation";
import type { PeopleInGroupsView } from "@/lib/applications/handover/peopleInGroups";
import { own } from "@/lib/applications/keys";
import { divergenceNote, type GroupDivergenceInput } from "@/lib/courses/groupResolve";
import { movedSentence } from "@/lib/courses/moveWords";
import Circles from "@/features/applications/circles/Circles";
import { CONNECTION, LEGEND, LEGEND_LEAD, STOP_CONFIRM, SUGGEST, SUGGESTING, facilitatorSavedWords } from "@/features/applications/circles/circlesWords";
import type { ArrangementOptionsView, CirclesView } from "@/lib/applications/arrange/view";
import BoardPersonPanel, { type PanelSubject } from "./BoardPersonPanel";
import { withShow, type BoardShow } from "./boardShow";
import { GroupsFrame, groupsPath } from "./GroupsViews";
import { focusAfterPanel } from "./panelFocus";
import RingsBoard, { type TrayPerson } from "./RingsBoard";
import { moveHereWords, ringsOf, type BoardRing } from "./ringsModel";
import styles from "./PeopleInGroups.module.css";
import { POOL, TAKE_OFF, marksOf, menuOptions, notToldYet, type Mark } from "./peopleInGroupsBoard";
import SomeWeeks from "@/features/courses/timeAnswer/SomeWeeks";
import { CANT_DETAILS, WHY, WOULD_WORK } from "@/lib/courses/timeAnswer/words";
import * as words from "./peopleInGroupsWords";
import { useBoardPanel } from "./useBoardPanel";

/**
 * A PROGRAMME'S PEOPLE IN GROUPS: the course run's
 * allocation board, drawn the way the lead's hub draws it.
 *
 * THE SAME BOARD UNDERNEATH. Its columns, cards and moves are the run's own:
 * the allocation route and the allocate and remove routes (`useAllocation`),
 * which ask again who the caller is on the run. A person's placement is one
 * scalar on one seat, so nobody can be in two groups. What a card says about
 * when somebody is free is `cardFit`'s answer (the board's own reading), and
 * who is still to place is `placingCounts`' (one count with the line over
 * the board and the number beside "Publish groups…").
 *
 * THE FORM'S FACTS COME FROM THE SERVER (`loadPeopleInGroups`): the People
 * tab's own model of the same people, handed in field by field. Who holds a
 * place, each degree line, "Coming", who is invited (a freed place's card
 * sits in the column of the group its offer named) and who gave their place
 * back with the reason they gave. No address, no painted week, no answer.
 *
 * EVERY DRAG HAS A WAY WITHOUT ONE. Each card's "..." is #67's move menu
 * (a listbox that is a bottom sheet on a phone), with "Take off the run…"
 * last for a seat still on the run. The drag handle is the board's six dots,
 * for a pointer: the menu is the keyboard's and the touch screen's route.
 *
 * ONCE THE GROUPS ARE PUBLISHED, a card placed in a group and not told yet
 * says "Not told yet", and a line over the board names everybody placed
 * since ("3 placed since you published: Ana, Raj and Tom. Publish to tell
 * them."), linking to Publish (`notToldYet`, one question for both).
 *
 * SOMEBODY TOLD THEIR GROUP AND MOVED SINCE sees the group they are in now at
 * once: a move sends nothing and hides nobody. Their card says they were
 * moved and that the next Publish emails them, a line over the board names
 * them ("2 moved since they were told: Ana and Raj."), and the move itself
 * leaves a sentence saying what it did (`movedSentence`). Moved back to the
 * group they were told about, they owe nothing and the card says nothing.
 *
 * ANY NAME OPENS THE PERSON'S PANEL (`BoardPersonPanel`) beside the board:
 * a card's, an invited person's, a facilitator's in a column's head and a
 * name under the board. Its week, fits and reads come from one more read,
 * made only once a panel is opened (`useBoardPanel`), which the server
 * answers for this reader; every move it makes is the card's own. With no
 * panel open the board is drawn and behaves as it always has.
 *
 * SHOWN AS COLUMNS OR RINGS (`show`, from the address alone: `?show=rings`,
 * `./boardShow.ts`). Rings is the same board drawn as Circles drew it, each
 * group a ring round its time (`RingsBoard`), with the same toolbar, counts,
 * panel, moves and Publish: a name opens the same panel, and the middle of a
 * ring is the card's own move. What Rings marks about anybody's time (the
 * red tag, "didn’t mark this time as free", "(can’t make it)") comes from the
 * panel's one read alone (`ringsOf`), which the server answers for this
 * reader: nothing for a person whose application the reader may not read,
 * and Claude and Pangram for an admin alone, so the lead's legend leaves
 * them out. Shown as Rings, that read is made at once, since the rings need
 * it; Columns still makes it only once a panel is opened.
 *
 * AN ADMIN'S ARRANGING, on Rings: "Suggest groups" in the toolbar reads the
 * run's groups through Circles' own route and asks for a suggestion, then
 * draws Circles' arranging in place of the rings (`Circles`, with its
 * preview, Apply, Ask Claude and every change it saves through the site's
 * own routes) until "Back to the rings". The lead is offered none of it, as
 * before: Circles' route answers an admin alone.
 *
 * WHAT THE DESIGN DRAWS AND THIS LEAVES OUT, because the feature does not
 * exist yet: "Remind" (when-you're-free open until groups go out, a
 * later slice) and a facilitator's "(no reply yet)" (asking facilitators on
 * this board, a later slice). Publish itself is its own page, behind
 * "Publish groups…".
 */

type Props = {
  /** The page's own read; the board is drawn only for a run that is there. */
  view: PeopleInGroupsView & { run: { id: string; courseId: string } };
  /** The Groups tab's row of views, drawn by the page. */
  views: ReactNode;
  /** How the board is shown, as the address asks: Columns unless it says Rings. */
  show?: BoardShow;
};

/** Cards never reorder within a column: the board keeps no order to save. */
const NO_REORDER: SortingStrategy = () => null;

const reducedMotionQuery = () => window.matchMedia("(prefers-reduced-motion: reduce)");
const subscribeReducedMotion = (cb: () => void) => {
  const mq = reducedMotionQuery();
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => reducedMotionQuery().matches,
    () => false,
  );
}

/** A column, as the divergence note reads it: the pool is the run's own calendar. */
const autonomyOf = (group: AllocGroup | null): GroupDivergenceInput | null =>
  group
    ? {
        paceStartDate: group.paceStartDate,
        paceWeekPlan: group.paceWeekPlan,
        forkedWeekIds: group.forkedWeekIds,
      }
    : null;

function MarkChip({ mark }: { mark: Mark }) {
  const tone = mark.tone === "warn" ? styles.chipWarn : mark.tone === "ok" ? styles.chipOk : styles.chipPlain;
  return <span className={`${styles.chip} ${tone}`}>{mark.words}</span>;
}

/** The degree line, kept on its two halves as the board breaks it. */
function DetailLine({ detail }: { detail: string }) {
  if (!detail) return null;
  const at = detail.lastIndexOf(" · ");
  if (at === -1) return <span className={styles.nowrap}>{detail}</span>;
  return (
    <>
      <span className={styles.nowrap}>{detail.slice(0, at)} ·</span>{" "}
      <span className={styles.nowrap}>{detail.slice(at + 3)}</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// A card
// ---------------------------------------------------------------------------

type CardProps = {
  row: AllocRow;
  name: string;
  detail: string;
  marks: Mark[];
  warns: boolean;
  columnId: string;
  options: DropdownOption[];
  onMenu: (row: AllocRow, value: string) => void;
  busy: boolean;
  reducedMotion: boolean;
  /** The run, for "They meant some weeks" under a can't. */
  runId: string;
  /** "They meant some weeks" saved: the board is read again. */
  onAnswerChanged: (message: string) => void;
  /** The name opens their panel. */
  onOpen: (uid: string, from: HTMLElement) => void;
  /** Their panel is the one open. */
  open: boolean;
};

function PersonCard({
  row,
  name,
  detail,
  marks,
  warns,
  columnId,
  options,
  onMenu,
  busy,
  reducedMotion,
  runId,
  onAnswerChanged,
  onOpen,
  open,
}: CardProps) {
  // The six dots are a pointer's handle and nothing else: the card's menu is
  // the way to move somebody from a keyboard or a touch screen.
  const { listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.uid,
    data: { type: "person", columnId },
    transition: reducedMotion ? null : undefined,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} className={styles.cardShell}>
      <div className={`${styles.card} ${warns ? styles.cardWarn : ""} ${isDragging ? styles.cardDragging : ""}`}>
        <span ref={setActivatorNodeRef} className={styles.handle} aria-hidden="true" title="Drag" {...listeners}>
          <GripIcon size={14} />
        </span>
        <span className={styles.avatar}>
          <InitialsChip name={name} uid={row.uid} size="md" />
        </span>
        <button
          type="button"
          className={`${styles.name} ${styles.nameButton}`}
          aria-expanded={open}
          data-panel-name={row.uid}
          onClick={(event) => onOpen(row.uid, event.currentTarget)}
        >
          {name}
        </button>
        <span className={styles.menu}>
          <Dropdown
            value={columnId}
            onChange={(value) => onMenu(row, value)}
            options={options}
            disabled={busy}
            size="sm"
            sheetBreakpoint="md"
            ariaLabel={words.moveLabel(name)}
            title={words.MOVE_TITLE}
            className={styles.menuTrigger}
            triggerIcon={<MoreIcon size={18} />}
          />
        </span>
        <span className={styles.detail}>
          <DetailLine detail={detail} />
        </span>
        {marks.length > 0 && (
          <span className={styles.marks}>
            {marks.map((mark) => (
              <MarkChip key={mark.words} mark={mark} />
            ))}
          </span>
        )}
        {/* What they wrote, under a can't, and under a most weeks that staff
            read from a can't, which keeps their words. Only a can't offers
            "They meant some weeks". */}
        {row.timeAnswer && row.timeAnswer.kind !== "yes" && row.timeAnswer.reason ? (
          <details className={styles.why}>
            <summary>{CANT_DETAILS}</summary>
            <p>
              <strong>{WHY}</strong> {row.timeAnswer.reason}
            </p>
            <p>
              <strong>{WOULD_WORK}</strong> {row.timeAnswer.alternatives}
            </p>
            {row.timeAnswer.kind === "cant" ? (
              <SomeWeeks runId={runId} uid={row.uid} disabled={busy} onSaved={onAnswerChanged} />
            ) : null}
          </details>
        ) : null}
      </div>
    </div>
  );
}

/** Somebody invited and not answered yet: a card that holds nothing and moves nowhere. */
function InvitedCard({
  uid,
  name,
  line,
  onOpen,
  open,
}: {
  uid: string;
  name: string;
  line: string;
  onOpen: (uid: string, from: HTMLElement) => void;
  open: boolean;
}) {
  return (
    <div className={styles.invited}>
      <span className={styles.invitedAvatar}>
        <InitialsChip name={name} uid={uid} size="md" />
      </span>
      <span className={styles.invitedText}>
        <button
          type="button"
          className={`${styles.invitedName} ${styles.nameButton}`}
          aria-expanded={open}
          data-panel-name={uid}
          onClick={(event) => onOpen(uid, event.currentTarget)}
        >
          {name}
        </button>
        <span className={styles.invitedLine}>{line}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A column
// ---------------------------------------------------------------------------

function Column({
  columnId,
  label,
  className,
  head,
  hover,
  uids,
  children,
}: {
  columnId: string;
  label: string;
  className: string;
  head: ReactNode;
  hover: boolean;
  uids: string[];
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({
    id: `column-${columnId}`,
    data: { type: "column", columnId },
  });
  return (
    <section ref={setNodeRef} aria-label={label} className={`${className} ${hover ? styles.columnHover : ""}`}>
      {head}
      <SortableContext items={uids} strategy={NO_REORDER}>
        {children}
      </SortableContext>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

export default function PeopleInGroups({ view, views, show = "columns" }: Props) {
  const runId = view.run.id;
  const rings = show === "rings";
  const { data, loading, error, reload, place, previewPlace } = useAllocation(runId);
  const { toast, run: runAction, dismiss } = useActionToast();
  // "They meant some weeks" saved on a card: the board is read again, and says so.
  const onAnswerChanged = useCallback(
    (message: string) => void runAction(async () => reload(), { successMessage: message || undefined }),
    [runAction, reload],
  );
  const reducedMotion = useReducedMotion();
  const [pending, setPending] = useState<Record<string, string | null>>({});
  const [draggingUid, setDraggingUid] = useState<string | null>(null);
  const [hoverColumn, setHoverColumn] = useState<string | null>(null);
  const [moveNote, setMoveNote] = useState<string | null>(null);
  const [showGaveBack, setShowGaveBack] = useState(true);
  // The person the take-off question is open for, or null.
  const [takingOff, setTakingOff] = useState<string | null>(null);
  // The person whose panel is open, or null.
  const [openUid, setOpenUid] = useState<string | null>(null);
  // The name that opened the panel, and the board, for where the focus goes back to when it closes.
  const opener = useRef<HTMLElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const openPanel = useCallback((uid: string, from: HTMLElement) => {
    opener.current = from;
    setOpenUid(uid);
  }, []);
  const closePanel = useCallback(() => {
    const uid = openUid;
    setOpenUid(null);
    // After the panel has gone: the name that opened it, or the person's name where it is now, or the board.
    requestAnimationFrame(() => {
      const target = focusAfterPanel(
        opener.current,
        () => (uid ? (boardRef.current?.ownerDocument.querySelector<HTMLElement>(`[data-panel-name="${globalThis.CSS.escape(uid)}"]`) ?? null) : null),
        boardRef.current,
      );
      target?.focus();
      opener.current = null;
    });
  }, [openUid]);
  // A change to who facilitates a group, sent from the panel and not answered yet.
  const [staffing, setStaffing] = useState(false);
  // An admin's arranging on Rings: Circles' own read of the groups, and the suggestion the press asked for.
  const [arranging, setArranging] = useState<{
    circles: CirclesView;
    opening: { arrangement: ArrangementOptionsView | null; error: string | null };
  } | null>(null);
  const [openingArranging, setOpeningArranging] = useState(false);
  // The cards wait while the question is open.
  const busy = takingOff !== null || staffing;

  const rows = useMemo(() => data?.people ?? [], [data]);
  const groups = useMemo(() => data?.groups ?? [], [data]);
  const rowsByUid = useMemo(() => new Map(rows.map((row) => [row.uid, row] as const)), [rows]);
  const groupsById = useMemo(() => new Map(groups.map((group) => [group.id, group] as const)), [groups]);

  // A move the board has made and the server has not answered yet.
  const livePending = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const [uid, groupId] of Object.entries(pending)) {
      const row = rowsByUid.get(uid);
      if (row && row.groupId !== groupId) out[uid] = groupId;
    }
    return out;
  }, [pending, rowsByUid]);

  /** The column a card is in now: a group that still meets, or To place. */
  const columnOf = useCallback(
    (row: AllocRow): string => {
      const groupId = row.uid in livePending ? livePending[row.uid] : row.groupId;
      return groupId && groupsById.has(groupId) ? groupId : POOL;
    },
    [livePending, groupsById],
  );
  const inPool = useCallback((row: AllocRow) => columnOf(row) === POOL, [columnOf]);

  const counts = useMemo(
    () =>
      placingCounts(rows, inPool, {
        holders: view.holders,
        invited: view.invited.length,
      }),
    [rows, inPool, view.holders, view.invited.length],
  );

  const nameOf = useCallback(
    (uid: string) => own(view.people, uid)?.name || rowsByUid.get(uid)?.displayName || "NAISI member",
    [view.people, rowsByUid],
  );
  const columnName = useCallback(
    (columnId: string) => (columnId === POOL ? words.TO_PLACE : (groupsById.get(columnId)?.name ?? "that group")),
    [groupsById],
  );

  /** The people sitting in each column now, still on the run, by name. */
  const byColumn = useMemo(() => {
    const map = new Map<string, AllocRow[]>([[POOL, []]]);
    for (const group of groups) map.set(group.id, []);
    for (const row of rows) {
      if (rowHasLeft(row)) continue;
      const column = columnOf(row);
      // To place shows who is still to place: a card that says its person gave
      // the place back is in the list under the board instead.
      if (column === POOL && !poolRowIsToPlace(row)) continue;
      map.get(column)?.push(row);
    }
    for (const list of map.values()) list.sort((a, b) => nameOf(a.uid).localeCompare(nameOf(b.uid), "en-GB"));
    return map;
  }, [groups, rows, columnOf, nameOf]);

  const seated = useCallback((columnId: string) => (byColumn.get(columnId) ?? []).length, [byColumn]);

  // The card's own group is left out of its menu: moving somebody to where they are does nothing.
  const moveOptions = useCallback(
    (row: AllocRow, columnId: string): DropdownOption[] => menuOptions(row, groups, seated, columnId === POOL ? null : columnId),
    [groups, seated],
  );

  // -------------------------------------------------------------------------
  // The person's panel
  // -------------------------------------------------------------------------

  // The weeks are drawn against the groups' times: read again when a group or its time changes.
  const groupsKey = useMemo(() => groups.map((group) => `${group.id}@${group.sessionLabel}`).join("|"), [groups]);
  // Rings marks everybody's time from this read, so it is wanted as soon as Rings is shown.
  const panelRead = useBoardPanel(view.roundId, view.programmeId, openUid !== null || rings, groupsKey);
  /** A facilitator by uid: the full name and the first name the column's head carries. */
  const facilitatorOf = useCallback(
    (uid: string) => {
      for (const group of groups) {
        const at = group.facilitatorUids.indexOf(uid);
        if (at >= 0) return { name: group.facilitatorNames[at] ?? "NAISI member", firstName: group.facilitatorFirstNames[at] ?? "" };
      }
      return null;
    },
    [groups],
  );
  /** Who the open panel is about, as the board knows them now. */
  const subject = useMemo((): PanelSubject | null => {
    if (openUid === null) return null;
    const row = rowsByUid.get(openUid);
    const facilitates = groups.filter((group) => group.facilitatorUids.includes(openUid));
    if (row && !rowHasLeft(row)) {
      return { kind: "row", row, columnId: columnOf(row), facilitates: facilitatedGroupOf(row.uid, groups) ? facilitates : [] };
    }
    const invited = view.invited.find((person) => person.uid === openUid);
    if (invited) return { kind: "invited", uid: openUid, line: words.invitedWords(invited.on, invited.fits) };
    const gaveBack = view.gaveBack.find((person) => person.uid === openUid);
    if (gaveBack) return { kind: "gave-back", uid: openUid, line: gaveBack.line };
    if (facilitates.length > 0) return { kind: "facilitator", uid: openUid, facilitates };
    return null;
  }, [openUid, rowsByUid, groups, columnOf, view.invited, view.gaveBack]);

  // -------------------------------------------------------------------------
  // Moves
  // -------------------------------------------------------------------------

  const revert = useCallback((uids: string[]) => {
    setPending((was) => {
      const next = { ...was };
      for (const uid of uids) delete next[uid];
      return next;
    });
  }, []);

  const raise = useCallback(
    (message: string) =>
      runAction(async () => {
        throw new Error(message);
      }),
    [runAction],
  );

  const moveOne = useCallback(
    async (uid: string, columnId: string) => {
      const row = rowsByUid.get(uid);
      if (!row) return;
      const from = columnOf(row);
      if (from === columnId) return;
      // SOMEBODY TOLD THEIR GROUP, moved: the server says whether the move is
      // made mid-term, and if it is, the week it is from, that the earlier
      // weeks stay and what is left behind, asked before anything is written
      // (`askMidTermMoves`, the one question every board asks); or why it
      // cannot be made, said at once.
      const asked = await askMidTermMoves([{ uid, groupId: columnId === POOL ? null : columnId }], {
        told: () => Boolean(row.told),
        preview: previewPlace,
        confirm: (question) => window.confirm(question),
      });
      if (!asked.go) {
        if (asked.error) await raise(asked.error);
        return;
      }
      const refusal = asked.refused[0];
      if (refusal) {
        await raise(words.notMovedWords(nameOf(uid), columnName(columnId), refusal.reason, refusal.words));
        return;
      }
      // What the move did, for somebody who already knew their group: they
      // see the group they are in now at once, and the next Publish emails
      // them. Beside any note about the group's weeks.
      const told = row.told
        ? movedSentence({
            name: nameOf(uid),
            toldGroupId: row.told.groupId,
            toldGroupName: row.told.groupName,
            to: columnId === POOL ? null : { id: columnId, name: columnName(columnId) },
          })
        : null;
      const note = divergenceNote(autonomyOf(groupsById.get(from) ?? null), autonomyOf(groupsById.get(columnId) ?? null), {
        source: columnName(from),
        target: columnId === POOL ? null : columnName(columnId),
        who: nameOf(uid),
      });
      setMoveNote([told, note].filter(Boolean).join(" ") || null);
      const placement: Placement = asked.placements[0];
      setPending((was) => ({ ...was, [uid]: placement.groupId }));
      const result = await place([placement]);
      if (!result.ok) {
        revert([uid]);
        await raise(result.error);
        return;
      }
      if (result.rejected.length > 0) {
        revert([uid]);
        await raise(words.notMovedWords(nameOf(uid), columnName(columnId), result.rejected[0].reason, result.rejected[0].words));
      }
    },
    [rowsByUid, columnOf, groupsById, columnName, nameOf, place, previewPlace, revert, raise],
  );

  // Taking somebody off the run asks first, in the sheet (`TakeOffSheet`),
  // which says everything the route will do and who it emails; the board is
  // read again once the press has gone, and says what it came to.
  const takenOff = useCallback(
    (said: string) => {
      setTakingOff(null);
      void runAction(async () => reload(), { successMessage: said || undefined });
    },
    [runAction, reload],
  );

  const onMenu = useCallback(
    (row: AllocRow, value: string) => {
      if (value === TAKE_OFF) setTakingOff(row.uid);
      else void moveOne(row.uid, value);
    },
    [moveOne],
  );

  // "Stop facilitating Group C", from the panel of somebody who holds a place
  // and facilitates the group they sit in: asked first, then the
  // facilitators route with the group's list without them. They stay in the
  // group as one of its people, and nobody is emailed.
  const stopFacilitating = useCallback(
    async (uid: string, group: AllocGroup) => {
      // The group's facilitators as they are now, read before the question, so
      // nobody added since the board was read is taken off with them.
      setStaffing(true);
      let current: string[] | null = null;
      try {
        const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/allocation`, { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as { groups?: AllocGroup[] } | null;
        current = res.ok ? (body?.groups?.find((each) => each.id === group.id)?.facilitatorUids ?? null) : null;
      } catch {
        current = null;
      }
      setStaffing(false);
      if (current === null) {
        await raise(words.LOAD_FAILED);
        return;
      }
      if (!current.includes(uid)) {
        // Somebody changed the group's facilitators since: the board is read again, and says so.
        reload();
        await raise(facilitatorSavedWords(nameOf(uid), group.name, false));
        return;
      }
      if (!window.confirm(STOP_CONFIRM(nameOf(uid), group.name))) return;
      const next = current.filter((each) => each !== uid);
      setStaffing(true);
      void runAction(
        async () => {
          try {
            const res = await fetch(`/api/courses/groups/${encodeURIComponent(group.id)}/facilitators`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ uids: next }),
            });
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!res.ok) throw new Error(body?.error || `That change didn’t go through (${res.status}).`);
            reload();
          } finally {
            setStaffing(false);
          }
        },
        { successMessage: facilitatorSavedWords(nameOf(uid), group.name, false) },
      );
    },
    [nameOf, runAction, reload, raise, runId],
  );

  // -------------------------------------------------------------------------
  // An admin's arranging, on Rings
  // -------------------------------------------------------------------------

  // "Suggest groups": Circles' own read of the run's groups (its route answers
  // an admin alone), then a suggestion over them without Claude, as Circles'
  // own "Suggest groups" asks. Nothing is written. A suggestion that could
  // not be worked out opens the arranging with its reason, where it can be
  // asked again.
  const openArranging = useCallback(async () => {
    const base = `/api/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}`;
    setOpeningArranging(true);
    try {
      const res = await fetch(`${base}/circles`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { circles?: CirclesView; error?: string } | null;
      if (!res.ok || !body?.circles) {
        await raise(body?.error || CONNECTION);
        return;
      }
      const circles = body.circles;
      let opening: { arrangement: ArrangementOptionsView | null; error: string | null };
      try {
        const asked = await fetch(`${base}/arrangement`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ askClaude: false, minutes: String(circles.minutes), startAgain: false }),
        });
        const said = (await asked.json().catch(() => ({}))) as { arrangement?: ArrangementOptionsView; error?: string };
        opening = asked.ok && said.arrangement
          ? { arrangement: said.arrangement, error: null }
          : { arrangement: null, error: said.error || `It answered ${asked.status}.` };
      } catch {
        opening = { arrangement: null, error: CONNECTION };
      }
      setOpenUid(null);
      setArranging({ circles, opening });
    } catch {
      await raise(CONNECTION);
    } finally {
      setOpeningArranging(false);
    }
  }, [view.roundId, view.programmeId, raise]);

  // "Back to the rings": whatever the arranging saved is read again, the board and everybody's week.
  const leaveArranging = useCallback(() => {
    setArranging(null);
    reload();
    panelRead.retry();
  }, [reload, panelRead]);

  // Shown as Columns while an admin's arranging is open (the toolbar's
  // Columns, or the browser's Back): the page stays mounted across the
  // address's change, so the arranging is closed here, and whatever it
  // saved (an Apply included) is read again, the board and everybody's week,
  // exactly as "Back to the rings" reads them.
  const [owedReads, setOwedReads] = useState(0);
  if (arranging !== null && !rings) {
    setArranging(null);
    setOwedReads((n) => n + 1);
  }
  const retryPanel = panelRead.retry;
  useEffect(() => {
    if (owedReads > 0) {
      reload();
      retryPanel();
    }
  }, [owedReads, reload, retryPanel]);

  // -------------------------------------------------------------------------
  // Dragging, for a pointer
  // -------------------------------------------------------------------------

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  // The pointer decides where a card lands; a card under it counts as its column.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const hits = pointerWithin(args);
    if (hits.length > 0) {
      const person = hits.find((hit) => hit.data?.droppableContainer?.data?.current?.type === "person");
      return person ? [person] : hits;
    }
    return closestCenter(args);
  }, []);
  const columnFromOver = (over: DragOverEvent["over"]): string | null => {
    const found = over?.data.current;
    return found?.type === "column" || found?.type === "person" ? String(found.columnId) : null;
  };
  const announcements = useMemo<Announcements>(() => {
    const where = (id: UniqueIdentifier | undefined) => {
      if (id === undefined) return "no group";
      const raw = String(id);
      if (raw.startsWith("column-")) return columnName(raw.slice("column-".length));
      const row = rowsByUid.get(raw);
      return row ? columnName(columnOf(row)) : "no group";
    };
    return {
      onDragStart: ({ active }) => `Picked up ${nameOf(String(active.id))} from ${where(active.id)}.`,
      onDragOver: ({ active, over }) =>
        over
          ? `${nameOf(String(active.id))} is over ${where(over.id)}.`
          : `${nameOf(String(active.id))} is not over a group.`,
      onDragEnd: ({ active, over }) =>
        over
          ? `${nameOf(String(active.id))} moved to ${where(over.id)}.`
          : `${nameOf(String(active.id))} stayed where they were.`,
      onDragCancel: ({ active }) => `Move cancelled. ${nameOf(String(active.id))} stayed in ${where(active.id)}.`,
    };
  }, [columnName, columnOf, nameOf, rowsByUid]);

  function onDragStart(event: DragStartEvent) {
    setDraggingUid(String(event.active.id));
  }
  function onDragOver(event: DragOverEvent) {
    setHoverColumn(columnFromOver(event.over));
  }
  function onDragEnd(event: DragEndEvent) {
    setDraggingUid(null);
    setHoverColumn(null);
    const target = columnFromOver(event.over);
    if (target) void moveOne(String(event.active.id), target);
  }
  function onDragCancel() {
    setDraggingUid(null);
    setHoverColumn(null);
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  const admin = view.viewer === "admin";
  const boardHref = groupsPath(view.roundId, view.programmeId);
  // Publish's page, carrying on how the board was shown, so its way back keeps it.
  const publishHref = withShow(`${boardHref}/publish`, show);
  const arrangingNow = rings && admin ? arranging : null;
  const beside = (
    <div className={styles.publish}>
      {view.sent && counts.toPlace > 0 && (
        <span className={styles.stillToPlace}>{words.stillToPlace(counts.toPlace)}</span>
      )}
      <span className={styles.showAs}>
        <span className={styles.showAsLabel} id="people-in-groups-show-as">
          {words.SHOW_AS}
        </span>
        <span className={styles.showAsChoices} role="group" aria-labelledby="people-in-groups-show-as">
          <Link
            href={boardHref}
            scroll={false}
            className={`${styles.showAsChoice} ${rings ? "" : styles.showAsChosen}`}
            aria-current={rings ? undefined : "true"}
          >
            {words.COLUMNS}
          </Link>
          <Link
            href={withShow(boardHref, "rings")}
            scroll={false}
            className={`${styles.showAsChoice} ${rings ? styles.showAsChosen : ""}`}
            aria-current={rings ? "true" : undefined}
          >
            {words.RINGS}
          </Link>
        </span>
      </span>
      {/* Suggesting groups is an admin's, as it was on Circles. */}
      {rings && admin ? (
        <button
          type="button"
          className={`${shared.btn} ${styles.publishLink}`}
          disabled={!data || openingArranging || arrangingNow !== null}
          onClick={() => void openArranging()}
        >
          {openingArranging ? SUGGESTING : SUGGEST}
        </button>
      ) : null}
      <Link href={publishHref} className={`${shared.btn} ${styles.publishLink}`}>
        {words.publishLinkWords(view.viewer)}
      </Link>
    </div>
  );

  if (!data) {
    return (
      <GroupsFrame views={views} beside={beside}>
        <section className={shared.card}>
          {error ? (
            <>
              <p className={shared.cardNote}>{words.loadFailedWords(error.status)}</p>
              <button type="button" className={shared.btn} onClick={reload} disabled={loading}>
                {words.RETRY}
              </button>
            </>
          ) : (
            <p className={shared.cardNote}>{words.LOADING}</p>
          )}
        </section>
      </GroupsFrame>
    );
  }

  const published = Boolean(data.run.allocationPublishedAt);
  const cardFor = (row: AllocRow, columnId: string) => {
    const group = columnId === POOL ? null : (groupsById.get(columnId) ?? null);
    const facts = own(view.people, row.uid);
    const { marks, warns } = marksOf(row, group, groups, facts?.coming === true, published);
    return (
      <PersonCard
        key={row.uid}
        row={row}
        name={nameOf(row.uid)}
        detail={facts?.detail ?? ""}
        marks={marks}
        warns={warns}
        columnId={columnId}
        options={moveOptions(row, columnId)}
        onMenu={onMenu}
        busy={busy}
        reducedMotion={reducedMotion}
        runId={runId}
        onAnswerChanged={onAnswerChanged}
        onOpen={openPanel}
        open={openUid === row.uid}
      />
    );
  };

  const poolRows = byColumn.get(POOL) ?? [];
  const invitedHere = (groupId: string | null) =>
    view.invited
      .filter((person) =>
        groupId === null ? person.groupId === null || !groupsById.has(person.groupId) : person.groupId === groupId,
      )
      .map((person) => (
        <InvitedCard
          key={person.uid}
          uid={person.uid}
          name={person.name}
          line={words.invitedWords(person.on, person.fits)}
          onOpen={openPanel}
          open={openUid === person.uid}
        />
      ));
  const dragged = draggingUid ? rowsByUid.get(draggingUid) : undefined;
  // Once published: everybody sitting in a group whom Publish has not told,
  // in the board's order, by the name a menu item calls them.
  const placedSince = published
    ? groups.flatMap((group) =>
        (byColumn.get(group.id) ?? [])
          .filter((row) => !(row.uid in livePending) && notToldYet(row, group, true))
          .map((row) => nameOf(row.uid).split(" ")[0]),
      )
    : [];
  // Everybody told their group and moved since, in the board's order: the
  // next Publish emails them "You’ve moved".
  const movedSince = groups.flatMap((group) =>
    (byColumn.get(group.id) ?? [])
      .filter((row) => !(row.uid in livePending) && row.moved)
      .map((row) => nameOf(row.uid).split(" ")[0]),
  );

  // Under To place, on Columns and on Rings alike.
  const poolNotes = (
    <>
      {counts.notOnTheRun > 0 && (
        <p className={styles.columnNote}>
          {admin ? (
            <Link
              href={`/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/setup`}
              className={styles.noteLink}
            >
              {words.notOnTheRunWords(counts.notOnTheRun, true)}
            </Link>
          ) : (
            words.notOnTheRunWords(counts.notOnTheRun, false)
          )}
        </p>
      )}
      {view.sent && counts.toPlace === 0 && counts.holding > 0 && poolRows.length === 0 && (
        <p className={styles.columnNote}>{words.EVERYONE_PLACED}</p>
      )}
    </>
  );
  const noGroupsCard = (
    <section className={`${shared.card} ${styles.noGroups}`}>
      <p className={shared.cardNote}>{words.NO_GROUPS}</p>
      <Link href={withShow(`${boardHref}/times`, show)} className={shared.btn}>
        {words.GO_TO_TIMES}
      </Link>
    </section>
  );

  const panelGroup = subject?.kind === "row" && subject.columnId !== POOL ? (groupsById.get(subject.columnId) ?? null) : null;
  const panel = subject ? (
    <BoardPersonPanel
      subject={subject}
      name={subject.kind === "facilitator" ? (facilitatorOf(subject.uid)?.name ?? nameOf(subject.uid)) : nameOf(subject.kind === "row" ? subject.row.uid : subject.uid)}
      firstName={
        subject.kind === "facilitator"
          ? facilitatorOf(subject.uid)?.firstName || nameOf(subject.uid).split(" ")[0]
          : nameOf(subject.kind === "row" ? subject.row.uid : subject.uid).split(" ")[0]
      }
      detail={subject.kind === "row" ? (own(view.people, subject.row.uid)?.detail ?? "") : ""}
      coming={subject.kind === "row" && own(view.people, subject.row.uid)?.coming === true}
      columnName={columnName}
      read={panelRead}
      // The card's own menu, without "Take off the run…", which is the panel's own button.
      options={subject.kind === "row" ? moveOptions(subject.row, subject.columnId).filter((option) => option.value !== TAKE_OFF) : []}
      busy={busy || (subject.kind === "row" && subject.row.uid in livePending)}
      onMove={(columnId) => {
        if (subject.kind === "row" && columnId !== (panelGroup?.id ?? POOL)) void moveOne(subject.row.uid, columnId);
      }}
      onTakeOff={() => {
        if (subject.kind === "row") setTakingOff(subject.row.uid);
      }}
      onStopFacilitating={(group) => {
        if (subject.kind === "row") void stopFacilitating(subject.row.uid, group);
      }}
      onClose={closePanel}
      rings={rings}
      runId={runId}
      onAnswerChanged={onAnswerChanged}
    />
  ) : null;

  // -------------------------------------------------------------------------
  // Rings
  // -------------------------------------------------------------------------

  const panelPersonOf = (uid: string) => (panelRead.panel ? (own(panelRead.panel.people, uid) ?? null) : null);
  const drawnRings: BoardRing[] = rings
    ? ringsOf({
        groups,
        membersOf: (groupId) => byColumn.get(groupId) ?? [],
        nameOf,
        panel: panelRead.panel,
        admin,
        published,
      })
    : [];
  const tray: TrayPerson[] = [
    ...poolRows.map((row) => ({ uid: row.uid, name: nameOf(row.uid), invited: false })),
    ...view.invited.map((person) => ({ uid: person.uid, name: person.name, invited: true })),
  ];
  // The middle of a ring moves the person whose panel is open there, as their card's menu would.
  const moveHere = (ring: BoardRing): string | null => {
    if (subject?.kind !== "row" || subject.facilitates.length > 0) return null;
    if (subject.columnId === ring.id || subject.row.uid in livePending) return null;
    return moveHereWords(panelPersonOf(subject.row.uid), ring.id);
  };
  const ringsDrawing = (
    <>
      {panelRead.failed ? (
        <p className={styles.moveNote} role="status">
          {words.PANEL_FAILED}{" "}
          <button type="button" className={styles.textButton} onClick={panelRead.retry}>
            {words.RETRY}
          </button>
        </p>
      ) : null}
      {/* The board's own element, where the focus goes back to when a panel closes and its name is gone. */}
      <div ref={boardRef} tabIndex={-1}>
      <RingsBoard
        roundId={view.roundId}
        programmeId={view.programmeId}
        rings={drawnRings}
        tray={tray}
        beforeRings={
          <>
            {poolNotes}
            {groups.length === 0 ? noGroupsCard : null}
          </>
        }
        selected={openUid}
        selectedName={openUid ? nameOf(openUid) : ""}
        moveHere={moveHere}
        busy={busy}
        onOpen={openPanel}
        onMoveHere={(groupId) => {
          if (subject?.kind === "row") void moveOne(subject.row.uid, groupId);
        }}
        legend={admin ? LEGEND : LEGEND_LEAD}
      />
      </div>
    </>
  );

  // An admin's arranging, on Rings, in place of the rings and the panel until "Back to the rings".
  if (arrangingNow) {
    return (
      <GroupsFrame views={views} beside={beside}>
        <Circles initial={arrangingNow.circles} opening={arrangingNow.opening} onLeave={leaveArranging} />
        <ActionToast toast={toast} onDismiss={dismiss} />
      </GroupsFrame>
    );
  }

  return (
    <GroupsFrame views={views} beside={beside}>
      <div className={styles.split} data-panel={panel ? "open" : undefined}>
        <div className={styles.body}>
          <p className={styles.line}>{view.sent ? words.boardLine(counts) : words.NOBODY_YET}</p>
          {placedSince.length > 0 && (
            <p className={styles.placedSince} role="status">
              {words.placedSinceWords(placedSince, admin).lead}{" "}
              <Link href={publishHref} className={styles.noteLink}>
                {words.placedSinceWords(placedSince, admin).link}
              </Link>
              .
            </p>
          )}
          {movedSince.length > 0 && (
            <p className={styles.placedSince} role="status">
              {words.movedSinceWords(movedSince, admin).lead}{" "}
              <Link href={publishHref} className={styles.noteLink}>
                {words.movedSinceWords(movedSince, admin).link}
              </Link>
              .
            </p>
          )}
          {moveNote && (
            <p className={styles.moveNote} role="status">
              {moveNote}{" "}
              <button type="button" className={styles.textButton} onClick={() => setMoveNote(null)}>
                Dismiss
              </button>
            </p>
          )}
          {rings ? ringsDrawing : (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            accessibility={{ announcements }}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <div ref={boardRef} className={styles.board} role="region" aria-label="Groups board" tabIndex={0}>
              <div className={styles.boardInner}>
                <Column
                  columnId={POOL}
                  label={words.TO_PLACE}
                  className={styles.toPlace}
                  hover={hoverColumn === POOL}
                  uids={poolRows.map((row) => row.uid)}
                  head={
                    <div className={styles.toPlaceHead}>
                      <h3 className={styles.columnTitle}>{words.TO_PLACE}</h3>
                      <span className={styles.toPlaceCount}>{view.sent ? counts.toPlace : poolRows.length}</span>
                    </div>
                  }
                >
                  <div className={styles.toPlaceCards}>
                    {poolRows.map((row) => (
                      <div key={row.uid} className={styles.toPlaceCell}>
                        {cardFor(row, POOL)}
                      </div>
                    ))}
                    {invitedHere(null).map((card) => (
                      <div key={card.key} className={styles.toPlaceCell}>
                        {card}
                      </div>
                    ))}
                  </div>
                  {poolNotes}
                </Column>

                {groups.length === 0 ? (
                  noGroupsCard
                ) : (
                  <div className={styles.columns}>
                    {groups.map((group) => {
                      const list = byColumn.get(group.id) ?? [];
                      const full = group.capacity !== null && list.length >= group.capacity;
                      const fill = group.capacity
                        ? Math.min(100, Math.round((list.length / group.capacity) * 100))
                        : null;
                      return (
                        <Column
                          key={group.id}
                          columnId={group.id}
                          label={group.name}
                          className={styles.column}
                          hover={hoverColumn === group.id}
                          uids={list.map((row) => row.uid)}
                          head={
                            <div className={styles.columnHead}>
                              <div className={styles.columnTop}>
                                <span className={styles.columnTitleRow}>
                                  <h3 className={styles.columnTitle}>
                                    <Link
                                      href={groupPagePath(view.roundId, view.programmeId, group.id)}
                                      className={styles.columnTitleLink}
                                    >
                                      {group.name}
                                    </Link>
                                  </h3>
                                  {full && <span className={`${styles.chip} ${styles.chipOk}`}>{words.FULL}</span>}
                                </span>
                                <span className={styles.seats}>{words.seatsWords(list.length, group.capacity)}</span>
                              </div>
                              <div className={styles.columnMeta}>
                                <span>{group.when || words.NO_TIME_YET}</span>
                                <span aria-hidden="true">·</span>
                                {group.room ? (
                                  <span className={styles.room}>{group.room}</span>
                                ) : (
                                  <span className={`${styles.chip} ${styles.chipWarn}`}>{words.NO_ROOM_YET}</span>
                                )}
                              </div>
                              <div className={styles.facilitators}>
                                {group.facilitatorUids.length === 0
                                  ? words.facilitatorsWords([])
                                  : group.facilitatorUids.map((uid, at) => (
                                      <span key={uid}>
                                        {at === 0 ? "" : at === group.facilitatorUids.length - 1 ? " and " : ", "}
                                        <button
                                          type="button"
                                          className={styles.nameButton}
                                          aria-expanded={openUid === uid}
                                          data-panel-name={uid}
                                          onClick={(event) => openPanel(uid, event.currentTarget)}
                                        >
                                          {group.facilitatorFirstNames[at] || "NAISI member"}
                                        </button>
                                      </span>
                                    ))}
                              </div>
                              {fill !== null && (
                                <div
                                  className={styles.bar}
                                  role="progressbar"
                                  aria-label={`${group.name}: ${words.seatsWords(list.length, group.capacity)}`}
                                  aria-valuenow={fill}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                >
                                  <span
                                    className={full ? styles.barFull : styles.barFill}
                                    style={{ width: `${fill}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          }
                        >
                          {list.map((row) => cardFor(row, group.id))}
                          {invitedHere(group.id)}
                          {list.length === 0 && invitedHere(group.id).length === 0 && (
                            <p className={styles.columnNote}>{words.EMPTY_GROUP}</p>
                          )}
                        </Column>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
              {dragged ? (
                <div className={styles.overlay}>
                  <div className={styles.card}>
                    <span className={styles.handle} aria-hidden="true">
                      <GripIcon size={14} />
                    </span>
                    <span className={styles.avatar}>
                      <InitialsChip name={nameOf(dragged.uid)} uid={dragged.uid} size="md" />
                    </span>
                    <span className={styles.name}>{nameOf(dragged.uid)}</span>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          )}

          {view.gaveBack.length > 0 && (
            <div className={styles.gaveBack}>
              <button
                type="button"
                className={styles.gaveBackToggle}
                aria-expanded={showGaveBack}
                onClick={() => setShowGaveBack((was) => !was)}
              >
                <span className={showGaveBack ? styles.chevronOpen : styles.chevronShut}>
                  <ChevronDownIcon size={16} />
                </span>
                <span>{words.gaveBackTitle(view.gaveBack.length)}</span>
              </button>
              {showGaveBack && (
                <ul className={styles.gaveBackList}>
                  {view.gaveBack.map((person) => (
                    <li key={person.uid} className={styles.gaveBackItem}>
                      <span className={styles.gaveBackAvatar}>
                        <InitialsChip name={person.name} uid={person.uid} size="sm" />
                      </span>
                      <button
                        type="button"
                        className={`${styles.gaveBackName} ${styles.nameButton}`}
                        aria-expanded={openUid === person.uid}
                        data-panel-name={person.uid}
                        onClick={(event) => openPanel(person.uid, event.currentTarget)}
                      >
                        {person.name}
                      </button>
                      {person.line && <span className={styles.gaveBackLine}>· {person.line}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Under the legend on Rings too: the board is used mid-term, and who a move tells is said here. */}
          <p className={styles.footnote}>
            <span className={styles.footnoteIcon} aria-hidden="true">
              <InfoIcon size={16} />
            </span>
            <span>
              {data.run.allocationPublishedAt
                ? admin
                  ? words.AFTER_PUBLISH
                  : words.AFTER_PUBLISH_LEAD
                : admin
                  ? words.BEFORE_PUBLISH
                  : words.BEFORE_PUBLISH_LEAD}
            </span>
          </p>
        </div>
        {panel}
      </div>
      {/* On a narrow screen the panel is a sheet over the page: the page behind is dimmed, and a press on it closes the panel. */}
      {panel ? <div className={styles.panelScrim} aria-hidden="true" onClick={closePanel} /> : null}

      {takingOff && <TakeOffSheet runId={runId} uid={takingOff} onClose={() => setTakingOff(null)} onDone={takenOff} />}
      <ActionToast toast={toast} onDismiss={dismiss} />
    </GroupsFrame>
  );
}
