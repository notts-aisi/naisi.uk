import "server-only";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { DEFAULT_AVAILABILITY_GRID } from "@/lib/admissions/availability";
import { londonDateKey } from "@/lib/courses/weekPlan";
import type { SessionUser } from "@/lib/firebase/session";
import {
  ADMISSION_ROUND_FIELD_LIMITS,
  DEFAULT_SCORE_SCALE,
  EMPTY_PROGRAMME_PREFERENCE,
  admissionRoundId,
  zeroApplicationCounts,
} from "@/lib/firestore/admissionRounds";
import { slugify } from "@/lib/firestore/slugId";
import { canEditProgramme, canRunTerm, roleOnProgramme } from "../access";
import {
  APPLICATION_LIMITS,
  FORM_VERSION,
  QUESTION_SETS_SUBCOLLECTION,
  type ApplicationQuestion,
  type ProgrammeKind,
  type ProgrammeSettings,
  type QuestionSetDoc,
  type QuestionSetScope,
} from "../model";
import {
  isApplicationForm,
  isId,
  normaliseForm,
  normaliseQuestionSet,
  type ApplicationForm,
} from "../normalise";
import { formRef, questionSetRef } from "../repo";
import { mintId } from "./ids";
import { lockedSentence, questionsLocked, sentCount } from "./lock";
import { own } from "./own";
import type {
  FormChange,
  NewForm,
  NewProgramme,
  NewSet,
  ProgrammeChange,
  QuestionInput,
  SetChange,
} from "./parse";
import {
  FACILITATOR_SET_LABEL,
  GENERAL_SET_LABEL,
  orderWithNewSet,
  roleForScope,
  scoredRefusal,
} from "./sets";

/**
 * EVERY WRITE THE EDITOR MAKES.
 *
 * The form, its question sets and each programme's settings are written here
 * and nowhere else in this lane, each in one transaction that begins by
 * reading the round. That read is what three rules hang on:
 *
 *  - WHO MAY. The caller's right is decided from the form the transaction
 *    read, with the predicates in `../access.ts`, so there is no moment
 *    between the check and the write in which a lead could have been
 *    replaced.
 *  - THE LOCK. Whether anybody has sent an application is read off the
 *    round's own `applicationCounts`. A send moves those counts in its own
 *    transaction, so one that lands while a set is being saved makes this
 *    save run again, and the second run meets the lock.
 *  - TWO EDITORS. A programme's settings are written as field paths
 *    (`programmes.<id>.places`), never as the whole `programmes` map, so two
 *    leads saving two programmes at once each keep their own change.
 *
 * A refusal comes back as a status and a sentence. Somebody with no role on
 * the form is told there is no form, whether or not there is one.
 *
 * Who leads and who reviews a programme is NOT written here. That is
 * `setProgrammeRoles` in `../roles.ts`, the one writer of an access grant.
 */

export type Refusal = { ok: false; status: 400 | 403 | 404 | 409; error: string };
export type Done<T> = { ok: true; value: T };

function refuse(status: Refusal["status"], error: string): Refusal {
  return { ok: false, status, error };
}

const NO_FORM = refuse(404, "There is no application form here.");
const NO_PROGRAMME = refuse(404, "That programme is not on this form.");
const NO_SET = refuse(404, "That question set is not on this form.");

const L = APPLICATION_LIMITS;

// ---------------------------------------------------------------------------
// Reading inside a transaction
// ---------------------------------------------------------------------------

async function readForm(
  tx: Transaction,
  db: Firestore,
  roundId: string,
): Promise<ApplicationForm | null> {
  const snap = await tx.get(formRef(db, roundId));
  if (!snap.exists || !isApplicationForm(snap.data())) return null;
  return normaliseForm(snap.id, snap.data());
}

async function readSets(
  tx: Transaction,
  db: Firestore,
  roundId: string,
): Promise<QuestionSetDoc[]> {
  const snap = await tx.get(formRef(db, roundId).collection(QUESTION_SETS_SUBCOLLECTION));
  const sets: QuestionSetDoc[] = [];
  for (const doc of snap.docs) {
    const set = normaliseQuestionSet(doc.id, doc.data());
    if (set) sets.push(set);
  }
  return sets;
}

/** A new, empty question set as it is stored. */
function newSetData(roundId: string, label: string, scope: QuestionSetScope) {
  return {
    roundId,
    role: roleForScope(scope),
    scope,
    label,
    intro: "",
    questions: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

// ---------------------------------------------------------------------------
// A new form
// ---------------------------------------------------------------------------

/**
 * Create an application form: an admission round carrying `formVersion: 2`.
 *
 * It is written with every field the round's own reader expects as well, so
 * everything that already reads a round (the window, the counters, the list)
 * reads this one. Three of those fields are set differently from an older
 * round, on purpose:
 *
 *  - `stageIds` is empty. A form asks its questions through question sets.
 *  - `reminderOffsets` is empty. The deadline reminders an older round sends
 *    are written for the older form, so a new one sends none of them.
 *  - `blind.hideNames` is false. Reviewers see who they are reading.
 *
 * It starts as a draft, asking about facilitating, with the facilitator set
 * already on it and empty.
 */
export async function createForm(
  db: Firestore,
  actor: SessionUser,
  input: NewForm,
): Promise<Done<{ id: string }> | Refusal> {
  if (!canRunTerm(actor)) return refuse(403, "Only an admin can make an application form.");
  const id = admissionRoundId(input.label);
  const facilitatorSetId = mintId(FACILITATOR_SET_LABEL);
  const batch = db.batch();
  batch.create(formRef(db, id), {
    // The round, as the round's own reader expects it.
    kind: "enrolment",
    label: input.label,
    slug: slugify(input.label, ADMISSION_ROUND_FIELD_LIMITS.slug),
    blurb: "",
    academicYear: "",
    status: "draft",
    opensAt: null,
    closesAt: null,
    decisionsByDate: null,
    stageIds: [],
    programmePreference: { ...EMPTY_PROGRAMME_PREFERENCE },
    availabilityGrid: { ...DEFAULT_AVAILABILITY_GRID },
    accessRequirementsPrompt: "",
    criteria: [],
    scoreScale: { ...DEFAULT_SCORE_SCALE },
    reviewersPerApplication: 1,
    reviewerUids: [],
    finalDeciderUid: null,
    blind: { hideNames: false, hideMembership: true },
    evidenceRunIds: [],
    reminderOffsets: [],
    outcomeRunIds: [],
    applicationCounts: zeroApplicationCounts(),
    archived: false,
    clonedFromRoundId: null,
    authorUid: actor.uid,
    // What makes it an application form.
    formVersion: FORM_VERSION,
    programmeIds: [],
    programmes: {},
    questionSetIds: [facilitatorSetId],
    asksFacilitating: true,
    invitationReplyBy: null,
    revealOtherReviews: false,
    noOfferWording: null,
    decisionsSentAt: null,
    decisionsSentByUid: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.create(
    questionSetRef(db, id, facilitatorSetId),
    newSetData(id, FACILITATOR_SET_LABEL, { type: "facilitating" }),
  );
  try {
    await batch.commit();
  } catch (err) {
    // The id ends in eight random characters, so a collision is a retry and
    // not a name the admin has to change.
    const code = (err as { code?: number | string } | null)?.code;
    if (code === 6 || code === "already-exists") {
      return refuse(409, "That did not save. Try again.");
    }
    throw err;
  }
  return { ok: true, value: { id } };
}

// ---------------------------------------------------------------------------
// The form's own fields
// ---------------------------------------------------------------------------

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

function shortNameTaken(form: ApplicationForm, shortName: string, except: string | null): boolean {
  const wanted = shortName.trim().toLowerCase();
  return form.programmeIds.some(
    (id) => id !== except && own(form.programmes, id)?.shortName.trim().toLowerCase() === wanted,
  );
}

const SHORT_NAME_TAKEN = (shortName: string) =>
  `Another programme on this form is already called “${shortName}”. Rankings and emails use the short name, so each programme needs its own.`;

/** A new programme as it is stored: named, with nobody leading it yet. */
function newProgrammeData(input: NewProgramme): Omit<ProgrammeSettings, "id"> {
  return {
    kind: input.kind,
    name: input.name,
    shortName: input.shortName,
    pitch: "",
    facts: "",
    starts: "",
    places: null,
    groupCount: null,
    groupSize: "",
    leadUid: null,
    reviewerUids: [],
    useScores: true,
    closed: false,
    runId: null,
    emailWording: {},
  };
}

/** What a set has to say about itself to be placed in the form's order. */
type PlacedSet = { id: string; scope: QuestionSetScope; label: string };

/**
 * Change the form itself: its name, its dates, whether it asks about
 * facilitating, the order of its programmes, and adding a programme. Admin
 * only.
 *
 * Adding a programme also gives it somewhere to put its questions: the general
 * set for its kind when the form has none yet, and a stream set of its own.
 * Both start empty, and an empty set asks nobody anything.
 *
 * Every check runs before the first write is queued. A transaction commits
 * whatever was queued when its function returns, so a refusal that came after
 * a write would leave that write behind.
 */
export async function changeForm(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  change: FormChange,
): Promise<Done<{ addedProgrammeId: string | null }> | Refusal> {
  if (!canRunTerm(actor)) return refuse(403, "Only an admin can change the application form.");
  if (!isId(roundId)) return NO_FORM;
  const roundRef = formRef(db, roundId);

  return db.runTransaction(async (tx) => {
    const form = await readForm(tx, db, roundId);
    if (!form) return NO_FORM;
    const round = form.round;
    const needsSets = change.addProgramme !== undefined || change.asksFacilitating === true;
    const known: PlacedSet[] = needsSets ? await readSets(tx, db, roundId) : [];

    const update: Record<string, unknown> = {};
    /** Sets this change makes. Written last, once nothing can refuse. */
    const newSets: PlacedSet[] = [];
    let questionSetIds = form.questionSetIds;
    const place = (
      label: string,
      scope: QuestionSetScope,
      against: Pick<ApplicationForm, "programmes">,
    ) => {
      const set = { id: mintId(label, [...known.map((s) => s.id), ...questionSetIds]), scope, label };
      questionSetIds = orderWithNewSet(questionSetIds, known, against, set);
      known.push(set);
      newSets.push(set);
    };

    if (change.label !== undefined) {
      update.label = change.label;
      // The slug follows the name until the form has opened, and then holds.
      if (round.status === "draft") {
        update.slug = slugify(change.label, ADMISSION_ROUND_FIELD_LIMITS.slug);
      }
    }

    const opensAt = change.opensAt !== undefined ? change.opensAt : round.opensAt;
    const closesAt = change.closesAt !== undefined ? change.closesAt : round.closesAt;
    if (change.opensAt !== undefined) update.opensAt = change.opensAt;
    if (change.closesAt !== undefined) {
      if (change.closesAt === null && round.closesAt !== null && round.status === "open") {
        return refuse(
          409,
          "The form is open and people have been told when it closes. Move the close to another time. It cannot be cleared while people are applying.",
        );
      }
      update.closesAt = change.closesAt;
    }
    if (opensAt && closesAt && closesAt.getTime() <= opensAt.getTime()) {
      return refuse(400, "Applications have to close after they open.");
    }

    const decisions =
      change.decisionsByDate !== undefined ? change.decisionsByDate : round.decisionsByDate;
    if (change.decisionsByDate !== undefined) update.decisionsByDate = change.decisionsByDate;
    if (decisions && closesAt && decisions < londonDateKey(closesAt)) {
      return refuse(400, "Everyone hears after applications close. Pick a later day.");
    }

    const replyBy =
      change.invitationReplyBy !== undefined ? change.invitationReplyBy : form.invitationReplyBy;
    if (change.invitationReplyBy !== undefined) update.invitationReplyBy = change.invitationReplyBy;
    if (replyBy && decisions && replyBy < decisions) {
      return refuse(
        400,
        "Invitations go out on the day everyone hears, so they cannot be due back before it.",
      );
    }

    if (change.asksFacilitating !== undefined && change.asksFacilitating !== form.asksFacilitating) {
      const sent = sentCount(round.applicationCounts);
      if (sent > 0) {
        return refuse(
          409,
          `${lockedSentence(sent)} That includes the question about facilitating.`,
        );
      }
      update.asksFacilitating = change.asksFacilitating;
      if (change.asksFacilitating && !known.some((set) => set.scope.type === "facilitating")) {
        place(FACILITATOR_SET_LABEL, { type: "facilitating" }, form);
      }
    }

    let programmeIds = form.programmeIds;
    if (change.programmeIds !== undefined) {
      if (!sameMembers(change.programmeIds, form.programmeIds)) {
        return refuse(
          409,
          "The programmes on this form have changed since this page loaded. Reload and try again.",
        );
      }
      programmeIds = change.programmeIds;
      update.programmeIds = programmeIds;
    }

    let addedProgrammeId: string | null = null;
    if (change.addProgramme !== undefined) {
      const input = change.addProgramme;
      if (form.programmeIds.length >= L.maxProgrammes) {
        return refuse(400, `A form takes at most ${L.maxProgrammes} programmes.`);
      }
      if (shortNameTaken(form, input.shortName, null)) {
        return refuse(400, SHORT_NAME_TAKEN(input.shortName));
      }
      const id = mintId(input.shortName, Object.keys(form.programmes));
      addedProgrammeId = id;
      programmeIds = [...programmeIds, id];
      update.programmeIds = programmeIds;
      update[`programmes.${id}`] = newProgrammeData(input);

      // The sets are placed against the form as it will be, with the new
      // programme on it, so its stream lands beside its own kind.
      const withProgramme = {
        programmes: { ...form.programmes, [id]: { ...newProgrammeData(input), id } },
      };
      const kind: ProgrammeKind = input.kind;
      if (!known.some((set) => set.scope.type === "kind" && set.scope.kind === kind)) {
        place(GENERAL_SET_LABEL[kind], { type: "kind", kind }, withProgramme);
      }
      // A stream named exactly like another set would read as one section
      // listed twice.
      const wanted = input.shortName.trim().toLowerCase();
      const clashes = known.some((set) => set.label.trim().toLowerCase() === wanted);
      place(
        clashes ? `${input.shortName} stream`.slice(0, L.setLabel) : input.shortName,
        { type: "programme", programmeId: id },
        withProgramme,
      );
    }

    if (newSets.length > 0) {
      if (questionSetIds.length > L.maxQuestionSets) {
        return refuse(
          400,
          `A form takes at most ${L.maxQuestionSets} question sets. Remove one that is not in use first.`,
        );
      }
      update.questionSetIds = questionSetIds;
    }

    // Nothing above can refuse from here on, so the writes are queued now.
    for (const set of newSets) {
      tx.create(questionSetRef(db, roundId, set.id), newSetData(roundId, set.label, set.scope));
    }
    if (Object.keys(update).length > 0) {
      update.updatedAt = FieldValue.serverTimestamp();
      tx.update(roundRef, update);
    }
    return { ok: true, value: { addedProgrammeId } } as const;
  });
}

// ---------------------------------------------------------------------------
// Question sets
// ---------------------------------------------------------------------------

/** Add an empty question set to the form. Admin only, and not once the questions lock. */
export async function createSet(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  input: NewSet,
): Promise<Done<{ id: string }> | Refusal> {
  if (!canRunTerm(actor)) return refuse(403, "Only an admin can change the application form.");
  if (!isId(roundId)) return NO_FORM;
  return db.runTransaction(async (tx) => {
    const form = await readForm(tx, db, roundId);
    if (!form) return NO_FORM;
    const sets = await readSets(tx, db, roundId);
    const sent = sentCount(form.round.applicationCounts);
    if (sent > 0) return refuse(409, lockedSentence(sent));
    if (input.scope.type === "programme" && !own(form.programmes, input.scope.programmeId)) {
      return NO_PROGRAMME;
    }
    if (form.questionSetIds.length >= L.maxQuestionSets) {
      return refuse(400, `A form takes at most ${L.maxQuestionSets} question sets.`);
    }
    const id = mintId(input.label, [...sets.map((set) => set.id), ...form.questionSetIds]);
    tx.create(questionSetRef(db, roundId, id), newSetData(roundId, input.label, input.scope));
    tx.update(formRef(db, roundId), {
      questionSetIds: orderWithNewSet(form.questionSetIds, sets, form, { id, scope: input.scope }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, value: { id } } as const;
  });
}

/**
 * The questions as they are stored, from what the editor sent.
 *
 * A question keeps its id only when the stored set already has it. Anything
 * else is new, whatever it claimed to be, and is given an id minted from its
 * own text. That is what lets a score and an answer go on meaning the
 * question they were given for.
 */
function questionsToStore(
  given: readonly QuestionInput[],
  stored: readonly ApplicationQuestion[],
): ApplicationQuestion[] {
  const existing = new Set(stored.map((question) => question.id));
  const used = new Set<string>();
  for (const question of given) {
    if (question.id && existing.has(question.id)) used.add(question.id);
  }
  return given.map((question) => {
    const keeps = question.id !== null && existing.has(question.id);
    const id = keeps ? (question.id as string) : mintId(question.text, [...existing, ...used]);
    used.add(id);
    return {
      id,
      text: question.text,
      help: question.help,
      type: question.type,
      options: question.options,
      optionsFromRanking: question.optionsFromRanking,
      wordLimit: question.wordLimit,
      required: question.required,
      scored: question.scored,
    };
  });
}

/**
 * Change one question set: its name, the line under its heading, or its whole
 * list of questions (which is also how they are reordered and deleted). Admin
 * only, and refused once anybody has sent an application.
 */
export async function changeSet(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  setId: string,
  change: SetChange,
): Promise<Done<null> | Refusal> {
  if (!canRunTerm(actor)) return refuse(403, "Only an admin can change the application form.");
  if (!isId(roundId)) return NO_FORM;
  if (!isId(setId)) return NO_SET;
  const setRef = questionSetRef(db, roundId, setId);
  return db.runTransaction(async (tx) => {
    const form = await readForm(tx, db, roundId);
    if (!form) return NO_FORM;
    const snap = await tx.get(setRef);
    const set = snap.exists ? normaliseQuestionSet(snap.id, snap.data()) : null;
    if (!set || !form.questionSetIds.includes(setId)) return NO_SET;
    const sent = sentCount(form.round.applicationCounts);
    if (sent > 0) return refuse(409, lockedSentence(sent));

    const update: Record<string, unknown> = {};
    if (change.label !== undefined) update.label = change.label;
    if (change.intro !== undefined) update.intro = change.intro;
    if (change.questions !== undefined) {
      const cannotScore = scoredRefusal(set.role);
      if (cannotScore && change.questions.some((question) => question.scored)) {
        return refuse(400, cannotScore);
      }
      update.questions = questionsToStore(change.questions, set.questions);
    }
    update.updatedAt = FieldValue.serverTimestamp();
    tx.update(setRef, update);
    return { ok: true, value: null } as const;
  });
}

/** Take a question set off the form, with its questions. Admin only, and not once they lock. */
export async function deleteSet(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  setId: string,
): Promise<Done<null> | Refusal> {
  if (!canRunTerm(actor)) return refuse(403, "Only an admin can change the application form.");
  if (!isId(roundId)) return NO_FORM;
  if (!isId(setId)) return NO_SET;
  const setRef = questionSetRef(db, roundId, setId);
  return db.runTransaction(async (tx) => {
    const form = await readForm(tx, db, roundId);
    if (!form) return NO_FORM;
    const snap = await tx.get(setRef);
    if (!snap.exists || !form.questionSetIds.includes(setId)) return NO_SET;
    if (questionsLocked(form.round.applicationCounts)) {
      return refuse(409, lockedSentence(sentCount(form.round.applicationCounts)));
    }
    tx.delete(setRef);
    tx.update(formRef(db, roundId), {
      questionSetIds: form.questionSetIds.filter((id) => id !== setId),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, value: null } as const;
  });
}

// ---------------------------------------------------------------------------
// One programme's settings
// ---------------------------------------------------------------------------

/**
 * Change one programme's settings. Its lead or an admin; closing it, or
 * opening it again, is an admin's alone.
 *
 * Each field is written at its own path under `programmes.<id>`, so this never
 * replaces another programme's settings, or this programme's lead and
 * reviewers, which belong to `setProgrammeRoles`.
 */
export async function changeProgramme(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  change: ProgrammeChange,
): Promise<Done<null> | Refusal> {
  if (!isId(roundId)) return NO_FORM;
  if (!isId(programmeId)) return NO_PROGRAMME;
  const roundRef = formRef(db, roundId);
  return db.runTransaction(async (tx) => {
    const form = await readForm(tx, db, roundId);
    if (!form) return NO_FORM;
    const programme = own(form.programmes, programmeId);
    // No role on this programme reads as no programme, so a stranger learns
    // nothing about what the form carries.
    if (!programme || roleOnProgramme(actor, form, programmeId) === null) return NO_PROGRAMME;
    if (!canEditProgramme(actor, form, programmeId)) {
      return refuse(403, "Only this programme’s lead or an admin can change its settings.");
    }
    if (change.closed !== undefined && !canRunTerm(actor)) {
      return refuse(403, "Only an admin can close a programme.");
    }

    const at = (field: string) => `programmes.${programmeId}.${field}`;
    const update: Record<string, unknown> = {};

    if (change.shortName !== undefined && change.shortName !== programme.shortName) {
      const sent = sentCount(form.round.applicationCounts);
      if (sent > 0) {
        return refuse(
          409,
          `${sent === 1 ? "1 person has" : `${sent} people have`} applied, and their answers name this programme by its short name, so it can no longer change.`,
        );
      }
      if (shortNameTaken(form, change.shortName, programmeId)) {
        return refuse(400, SHORT_NAME_TAKEN(change.shortName));
      }
      update[at("shortName")] = change.shortName;
    }
    for (const field of ["name", "pitch", "facts", "starts", "groupSize"] as const) {
      if (change[field] !== undefined) update[at(field)] = change[field];
    }
    for (const field of ["places", "groupCount"] as const) {
      if (change[field] !== undefined) update[at(field)] = change[field];
    }
    for (const field of ["useScores", "closed"] as const) {
      if (change[field] !== undefined) update[at(field)] = change[field];
    }
    for (const [kind, wording] of Object.entries(change.emailWording ?? {})) {
      update[at(`emailWording.${kind}`)] = wording ?? FieldValue.delete();
    }

    if (Object.keys(update).length === 0) return { ok: true, value: null } as const;
    update.updatedAt = FieldValue.serverTimestamp();
    tx.update(roundRef, update);
    return { ok: true, value: null } as const;
  });
}
