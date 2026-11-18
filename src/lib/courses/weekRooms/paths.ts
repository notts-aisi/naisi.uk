/**
 * Where the week's rooms and the term's rooms live: under a term's
 * application form, beside its programmes, because they cross every
 * programme on it. No imports, so a page, a model and a browser file build the
 * same address.
 */

const FORMS = "/admin/admissions/forms";

/** The week's rooms: `?week=` any day of the week (its Monday is shown), `?programme=` one programme. */
export function weekRoomsPath(roundId: string, query: { week?: string | null; programme?: string | null } = {}): string {
  const params = new URLSearchParams();
  if (query.week) params.set("week", query.week);
  if (query.programme) params.set("programme", query.programme);
  const search = params.toString();
  return `${FORMS}/${encodeURIComponent(roundId)}/rooms${search ? `?${search}` : ""}`;
}

/** The term's rooms: every programme, or `?programme=` one. */
export function termRoomsPath(roundId: string, programme: string | null = null): string {
  const base = `${FORMS}/${encodeURIComponent(roundId)}/rooms/term`;
  return programme ? `${base}?programme=${encodeURIComponent(programme)}` : base;
}

/** A row's anchor on the week's rooms page: its key, made safe for an id. */
export function rowAnchor(key: string): string {
  return `room-${key.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}
