/**
 * WHAT DECISION DAY DOES TODAY, said once, so the page never promises more.
 *
 * The design gives two lines to things that happen around the send. Each is
 * shown only while the thing it describes is true, and these two switches are
 * where that is recorded. Turn one on in the same change that builds what it
 * names.
 */

/**
 * Whether the send approves an accepted applicant's account when it is still
 * waiting. While this is off, the page says how many accepted people are
 * still waiting and where to approve them, instead of saying it is done.
 */
export const SEND_APPROVES_WAITING_ACCOUNTS = false;

/**
 * Whether somebody invited is reminded each day until they reply. While this
 * is off, the page gives the reply-by day and says nothing about reminders.
 */
export const INVITATIONS_ARE_REMINDED_DAILY = false;
