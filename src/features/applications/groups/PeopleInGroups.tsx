"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
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
import { placingCounts, poolRowIsToPlace, rowHasLeft } from "@/features/courses/allocationTally";
import { useAllocation, type AllocGroup, type AllocRow, type Placement } from "@/features/courses/useAllocation";
import type { PeopleInGroupsView } from "@/lib/applications/handover/peopleInGroups";
import { own } from "@/lib/applications/keys";
import { divergenceNote, type GroupDivergenceInput } from "@/lib/courses/groupResolve";
import { GroupsFrame } from "./GroupsViews";
import styles from "./PeopleInGroups.module.css";
import { POOL, TAKE_OFF, marksOf, menuOptions, notToldYet, type Mark } from "./peopleInGroupsBoard";
import * as words from "./peopleInGroupsWords";

/**
 * A PROGRAMME'S PEOPLE IN GROUPS (board st-groups): the course run's
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
 * WHAT THE BOARD DRAWS AND THIS LEAVES OUT, because the feature does not
 * exist yet: "Remind" (when-you're-free open until groups go out, Q7, a
 * later slice) and a facilitator's "(no reply yet)" (asking facilitators on
 * this board, a later slice). Publish itself is its own page, behind
 * "Publish groups…".
 */

type Props = {
  /** The page's own read; the board is drawn only for a run that is there. */
  view: PeopleInGroupsView & { run: { id: string; courseId: string } };
  /** The Groups tab's row of views, drawn by the page. */
  views: ReactNode;
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
};

function PersonCard({ row, name, detail, marks, warns, columnId, options, onMenu, busy, reducedMotion }: CardProps) {
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
        <span className={styles.name}>{name}</span>
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
      </div>
    </div>
  );
}

/** Somebody invited and not answered yet: a card that holds nothing and moves nowhere. */
function InvitedCard({ uid, name, line }: { uid: string; name: string; line: string }) {
  return (
    <div className={styles.invited}>
      <span className={styles.invitedAvatar}>
        <InitialsChip name={name} uid={uid} size="md" />
      </span>
      <span className={styles.invitedText}>
        <span className={styles.invitedName}>{name}</span>
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

export default function PeopleInGroups({ view, views }: Props) {
  const runId = view.run.id;
  const { data, loading, error, reload, place, removeEnrolment } = useAllocation(runId);
  const { toast, run: runAction, dismiss } = useActionToast();
  const reducedMotion = useReducedMotion();
  const [pending, setPending] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [draggingUid, setDraggingUid] = useState<string | null>(null);
  const [hoverColumn, setHoverColumn] = useState<string | null>(null);
  const [moveNote, setMoveNote] = useState<string | null>(null);
  const [showGaveBack, setShowGaveBack] = useState(true);

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

  const moveOptions = useCallback(
    (row: AllocRow): DropdownOption[] => menuOptions(row, groups, seated),
    [groups, seated],
  );

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
      setMoveNote(
        divergenceNote(autonomyOf(groupsById.get(from) ?? null), autonomyOf(groupsById.get(columnId) ?? null), {
          source: columnName(from),
          target: columnId === POOL ? null : columnName(columnId),
          who: nameOf(uid),
        }),
      );
      const placement: Placement = {
        uid,
        groupId: columnId === POOL ? null : columnId,
      };
      setPending((was) => ({ ...was, [uid]: placement.groupId }));
      const result = await place([placement]);
      if (!result.ok) {
        revert([uid]);
        await raise(result.error);
        return;
      }
      if (result.rejected.length > 0) {
        revert([uid]);
        await raise(words.notMovedWords(nameOf(uid), columnName(columnId), result.rejected[0].reason));
      }
    },
    [rowsByUid, columnOf, groupsById, columnName, nameOf, place, revert, raise],
  );

  const takeOff = useCallback(
    (row: AllocRow) => {
      const name = nameOf(row.uid);
      if (!window.confirm(words.takeOffConfirm(name, columnName(columnOf(row)), view.programmeName))) return;
      setBusy(true);
      void (async () => {
        try {
          await runAction(
            async () => {
              const result = await removeEnrolment(row.uid);
              if (!result.ok) throw new Error(result.error);
            },
            {
              savingMessage: `Taking ${name} off the run…`,
              successMessage: `${name} is off the run`,
            },
          );
        } finally {
          setBusy(false);
        }
      })();
    },
    [nameOf, columnName, columnOf, view.programmeName, runAction, removeEnrolment],
  );

  const onMenu = useCallback(
    (row: AllocRow, value: string) => {
      if (value === TAKE_OFF) takeOff(row);
      else void moveOne(row.uid, value);
    },
    [takeOff, moveOne],
  );

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

  const beside = (
    <div className={styles.publish}>
      {view.sent && counts.toPlace > 0 && (
        <span className={styles.stillToPlace}>{words.stillToPlace(counts.toPlace)}</span>
      )}
      <Link
        href={`/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/groups/publish`}
        className={`${shared.btn} ${styles.publishLink}`}
      >
        {words.PUBLISH_GROUPS}
      </Link>
    </div>
  );

  if (!data) {
    return (
      <GroupsFrame views={views} beside={beside}>
        <section className={shared.card}>
          {error ? (
            <>
              <p className={shared.cardNote}>{error.message}</p>
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
        options={moveOptions(row)}
        onMenu={onMenu}
        busy={busy}
        reducedMotion={reducedMotion}
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
        />
      ));
  const dragged = draggingUid ? rowsByUid.get(draggingUid) : undefined;
  const admin = view.viewer === "admin";
  // Once published: everybody sitting in a group whom Publish has not told,
  // in the board's order, by the name a menu item calls them.
  const placedSince = published
    ? groups.flatMap((group) =>
        (byColumn.get(group.id) ?? [])
          .filter((row) => !(row.uid in livePending) && notToldYet(row, group, true))
          .map((row) => nameOf(row.uid).split(" ")[0]),
      )
    : [];

  return (
    <GroupsFrame views={views} beside={beside}>
      <div className={styles.body}>
        <p className={styles.line}>{view.sent ? words.boardLine(counts) : words.NOBODY_YET}</p>
        {placedSince.length > 0 && (
          <p className={styles.placedSince} role="status">
            {words.placedSinceWords(placedSince).lead}{" "}
            <Link
              href={`/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/groups/publish`}
              className={styles.noteLink}
            >
              {words.placedSinceWords(placedSince).link}
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
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          accessibility={{ announcements }}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div className={styles.board} role="region" aria-label="Groups board" tabIndex={0}>
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
              </Column>

              {groups.length === 0 ? (
                <section className={`${shared.card} ${styles.noGroups}`}>
                  <p className={shared.cardNote}>{words.noGroupsWords(admin)}</p>
                  <Link
                    href={`/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/groups/times`}
                    className={shared.btn}
                  >
                    {words.GO_TO_TIMES}
                  </Link>
                </section>
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
                                <h3 className={styles.columnTitle}>{group.name}</h3>
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
                              {words.facilitatorsWords(group.facilitatorFirstNames)}
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
                    <span className={styles.gaveBackName}>{person.name}</span>
                    {person.line && <span className={styles.gaveBackLine}>· {person.line}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className={styles.footnote}>
          <span className={styles.footnoteIcon} aria-hidden="true">
            <InfoIcon size={16} />
          </span>
          <span>{data.run.allocationPublishedAt ? words.AFTER_PUBLISH : words.BEFORE_PUBLISH}</span>
        </p>
      </div>

      <ActionToast toast={toast} onDismiss={dismiss} />
    </GroupsFrame>
  );
}
