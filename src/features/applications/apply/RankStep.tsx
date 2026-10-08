"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import kit from "@/features/applications/kit/kit.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import { ordinal } from "@/lib/applications/words";
import type { ApplicantProgramme } from "@/lib/applications/applicant/types";
import { ArrowDownIcon, ArrowUpIcon, GripIcon } from "./icons";
import form from "./form.module.css";
import styles from "./rank.module.css";

/**
 * Rank: the programmes somebody ticked, in the order they want them.
 *
 * THREE WAYS TO MOVE A ROW, and none of them needs the others:
 *
 *  - drag it by its handle, with a mouse or a finger;
 *  - focus the handle and use the keyboard (space to pick up, arrows to
 *    move, space to drop), which is the drag library's own keyboard route;
 *  - press the row's up or down button. This is the plain route, for a
 *    switch, a screen reader or anybody who would rather not drag, and it
 *    says what happened in a live region.
 *
 * The lifted row is drawn in a layer attached to the page body, because the
 * public page animates in with a transform and a transformed ancestor would
 * otherwise drag that layer off the pointer.
 */

/** "6 WEEKS" from "6 WEEKS · ~5 HRS A WEEK": the first fact is enough beside a rank. */
function firstFact(facts: string): string {
  return facts.split("·")[0]?.trim() ?? "";
}

type RowProps = {
  programme: ApplicantProgramme;
  position: number;
  total: number;
  onMove: (direction: -1 | 1) => void;
};

function RowBody({
  programme,
  position,
  total,
  onMove,
  handle,
  lifted,
}: RowProps & { handle: React.ReactNode; lifted?: boolean }) {
  const fact = firstFact(programme.facts);
  return (
    <div className={styles.row} data-lifted={lifted ? "true" : "false"}>
      {handle}
      <span aria-hidden="true" className={styles.number}>
        {position}
      </span>
      <div className={styles.text}>
        <div className={styles.name}>
          {programme.shortName}
          <span className="visually-hidden">
            , {position} of {total}
          </span>
        </div>
        {fact ? (
          <div className={styles.fact}>
            <span className={`${kit.mono} ${styles.factText}`}>{fact}</span>
          </div>
        ) : null}
      </div>
      <div className={styles.moves}>
        {lifted ? (
          // The lifted copy is a picture of the row: nothing in it takes focus.
          <>
            <span className={styles.move} data-off={position === 1 ? "true" : "false"}>
              <ArrowUpIcon />
            </span>
            <span className={styles.move} data-off={position === total ? "true" : "false"}>
              <ArrowDownIcon />
            </span>
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.move}
              aria-label={`Move ${programme.shortName} up`}
              disabled={position === 1}
              onClick={() => onMove(-1)}
            >
              <ArrowUpIcon />
            </button>
            <button
              type="button"
              className={styles.move}
              aria-label={`Move ${programme.shortName} down`}
              disabled={position === total}
              onClick={() => onMove(1)}
            >
              <ArrowDownIcon />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SortableRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.programme.id });
  return (
    // While it is lifted the row stays mounted, so the handle keeps the focus
    // a keyboard drag depends on. The stylesheet fades it out and draws the
    // dashed gap in its place.
    <li
      ref={setNodeRef}
      className={styles.item}
      data-dragging={isDragging ? "true" : "false"}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <RowBody
        {...props}
        handle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            className={styles.handle}
            {...attributes}
            {...listeners}
            aria-label={`Drag to reorder ${props.programme.shortName}`}
          >
            <GripIcon />
          </button>
        }
      />
    </li>
  );
}

export default function RankStep({
  programmes,
  onReorder,
}: {
  /** The ticked programmes, in the person's current order. */
  programmes: readonly ApplicantProgramme[];
  onReorder: (ids: string[]) => void;
}) {
  const hydrated = useHydrated();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = programmes.map((programme) => programme.id);
  const total = programmes.length;
  const nameOf = (id: string | number) =>
    programmes.find((programme) => programme.id === id)?.shortName ?? "";
  const placeOf = (id: string | number) => ids.indexOf(String(id)) + 1;

  function move(id: string, direction: -1 | 1) {
    const from = ids.indexOf(id);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= ids.length) return;
    onReorder(arrayMove(ids, from, to));
    setSaid(`${nameOf(id)} is now ${ordinal(to + 1)} of ${total}.`);
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(ids, from, to));
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `${nameOf(active.id)}, moving. Drop to make it ${ordinal(placeOf(active.id))} of ${total}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(active.id)}, moving. Drop to make it ${ordinal(placeOf(over.id))} of ${total}.`
        : `${nameOf(active.id)}, moving.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} is now ${ordinal(placeOf(over.id))} of ${total}.`
        : `${nameOf(active.id)} was put back.`,
    onDragCancel: ({ active }) => `${nameOf(active.id)} was put back.`,
  };

  const active = programmes.find((programme) => programme.id === activeId) ?? null;

  return (
    <div className={form.body}>
      <DndContext
        id="application-rank"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
        accessibility={{ announcements }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol aria-label="Your order" className={styles.list}>
            {programmes.map((programme, index) => (
              <SortableRow
                key={programme.id}
                programme={programme}
                position={index + 1}
                total={total}
                onMove={(direction) => move(programme.id, direction)}
              />
            ))}
          </ol>
        </SortableContext>
        {hydrated
          ? createPortal(
              <DragOverlay dropAnimation={null}>
                {active ? (
                  <ApplicationsRoot className={form.tokens}>
                    <div aria-hidden="true">
                      <RowBody
                        programme={active}
                        position={placeOf(active.id)}
                        total={total}
                        onMove={() => {}}
                        lifted
                        handle={
                          <span className={styles.handle} data-lifted="true">
                            <GripIcon />
                          </span>
                        }
                      />
                    </div>
                  </ApplicationsRoot>
                ) : null}
              </DragOverlay>,
              document.body,
            )
          : null}
      </DndContext>
      <div role="status" aria-live="polite" className="visually-hidden">
        {said}
      </div>
    </div>
  );
}
