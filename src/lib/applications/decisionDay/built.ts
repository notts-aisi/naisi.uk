/**
 * WHAT DECISION DAY DOES TODAY, said once, so the page never promises more.
 *
 * The design gives a line to each of two things that happen around the send,
 * and each is shown only while the thing it describes is true. Approving a
 * waiting account is decided here, in code. The daily reminder for an
 * invitation is a scheduled job that is switched on per copy of the site, so
 * that one is asked of the scheduler's own receipts when the page is built
 * (`./armed`), not recorded here.
 */

/**
 * Whether the send approves an accepted applicant's account when it is still
 * waiting. While this is off, the page says how many accepted people are
 * still waiting and where to approve them, instead of saying it is done.
 */
export const SEND_APPROVES_WAITING_ACCOUNTS = false;
