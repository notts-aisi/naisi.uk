import { GROUP_FIELD_LIMITS } from "@/lib/firestore/courseGroups";

/**
 * The room field's limit, the one the writer holds a moved room to
 * (`parseChangePress`): a pasted room longer than this is refused in the
 * paste box before anything is asked.
 */
export const GROUP_ROOM_LIMIT = GROUP_FIELD_LIMITS.location;

/** The reason's limit, the one the writer holds it to: one line the group reads. */
export const CHANGE_REASON_LIMIT = GROUP_FIELD_LIMITS.changeReason;
