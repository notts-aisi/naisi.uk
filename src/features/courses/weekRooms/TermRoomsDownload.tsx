"use client";

import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";
import { downloadCSV, toCSV } from "@/lib/csv";
import { termRoomsCsv } from "@/lib/courses/weekRooms/csv";
import type { TermSection } from "@/lib/courses/weekRooms/model";
import { DOWNLOAD, termFileName } from "@/lib/courses/weekRooms/words";

/** Download on the term's rooms: the grid as the page draws it, made in the browser, read from nothing. */
export default function TermRoomsDownload({ sections }: { sections: TermSection[] }) {
  const hydrated = useHydrated();
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={!hydrated || sections.every((section) => section.rows.length === 0)}
      onClick={() => {
        const { header, body } = termRoomsCsv(sections);
        downloadCSV(termFileName(), toCSV(header, body));
      }}
    >
      {DOWNLOAD}
    </Button>
  );
}
