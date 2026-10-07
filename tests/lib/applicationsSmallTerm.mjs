/**
 * One small term on an application form, as stored documents.
 *
 * For the suites that run the application system's own writers against
 * `tests/lib/applicationsStore.mjs` and need a form, its question sets, a few
 * people who applied and the committee who read them. It is the shapes the
 * real normalisers read, written out once, so a suite that only wants "a
 * term" does not carry two hundred lines of fixture of its own.
 *
 * Everybody here has a name no other string in the term contains, on
 * purpose: a suite can then fail on a name turning up somewhere it has no
 * business being. Every address is on a reserved domain.
 */

export const ROUND = "autumn-2026__sm4llt3rm";
export const ROUND_LABEL = "Autumn 2026";
export const AGI = "agi-strategy";
export const TAIS = "technical-ai-safety";
export const INCUBATOR = "research-incubator";

export const GRID = { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 };

/** Inside the form's window. */
export const WHILE_OPEN = new Date("2026-10-10T12:00:00+01:00");
/** After the close, while the committee is deciding. */
export const WHILE_DECIDING = new Date("2026-10-19T10:00:00+01:00");
const SENT_AT = new Date("2026-10-09T14:20:00+01:00");

const PERMISSIONS = {
  draftNewsletter: false,
  approveNewsletter: false,
  draftEvent: false,
  approveEvent: false,
  draftCourse: false,
  approveCourse: false,
  manageMembership: false,
  circulateWorksheet: false,
};

/** A signed-in person, as `getCurrentUser()` hands one back. */
export const session = (uid, role, suRecognised, displayName) => ({
  uid,
  email: `${uid}@example.com`,
  role,
  suRecognised,
  displayName,
  permissions: PERMISSIONS,
});

/**
 * The committee, and the people who applied.
 *
 * `claudia` leads AGI Strategy and `lloyd` reviews it. `tess` leads Technical
 * AI Safety and the incubator. `yusuf` is SU-recognised committee and is
 * named on nothing. `zach` is the admin.
 */
export const CAST = {
  zach: session("zach", "admin", false, "Zach Levin"),
  claudia: session("claudia", "committee", true, "Claudia Reyes"),
  lloyd: session("lloyd", "committee", true, "Lloyd Brandon"),
  tess: session("tess", "committee", true, "Tess Okoro"),
  yusuf: session("yusuf", "committee", true, "Yusuf Demir"),
  amara: session("amara", "member", false, "Amara Okafor"),
  dev: session("dev", "member", false, "Dev Patel"),
  wen: session("wen", "pending", false, "Wen Zhao"),
  nina: session("nina", "member", false, "Nina Petrova"),
  refused: session("refused", "rejected", false, "Rory Quill"),
};

/** [uid, what they ranked, 1st choice first]. Each has SENT an application. */
export const APPLICANTS = [
  ["amara", [AGI, TAIS]],
  ["dev", [AGI]],
  ["wen", [TAIS, AGI]],
];

/** Every word of every applicant's name, and each address: what must never leak. */
export function namesOf(uid) {
  const who = CAST[uid];
  return [...who.displayName.split(" "), who.email, `${uid}@students.example.com`];
}

const question = (id, text, over = {}) => ({
  id,
  text,
  help: "",
  type: "long",
  options: [],
  optionsFromRanking: false,
  wordLimit: null,
  required: true,
  scored: false,
  ...over,
});

export const SETS = {
  fellowships: {
    role: "general",
    scope: { type: "kind", kind: "fellowship" },
    label: "Fellowships",
    questions: [question("why", "Why this term?")],
  },
  [AGI]: {
    role: "stream",
    scope: { type: "programme", programmeId: AGI },
    label: "AGI Strategy",
    questions: [question("event", "Pick something that happened in AI this year.", { scored: true })],
  },
  [TAIS]: {
    role: "stream",
    scope: { type: "programme", programmeId: TAIS },
    label: "Technical AI Safety",
    questions: [question("built", "Something you have built.", { scored: true })],
  },
};

function programme(over) {
  return {
    kind: "fellowship",
    pitch: "",
    facts: "6 WEEKS",
    starts: "w/c 26 Oct",
    groupSize: "Up to 8",
    groupCount: 4,
    reviewerUids: [],
    useScores: true,
    closed: false,
    runId: null,
    emailWording: {},
    ...over,
  };
}

/** The form, as its round document stores it. `status` and the dates are the caller's to move. */
export function roundDoc(over = {}) {
  return {
    formVersion: 2,
    kind: "enrolment",
    label: ROUND_LABEL,
    slug: "autumn-2026",
    status: "open",
    archived: false,
    opensAt: new Date("2026-10-06T09:00:00+01:00"),
    closesAt: new Date("2026-10-18T23:59:00+01:00"),
    decisionsByDate: "2026-10-23",
    availabilityGrid: GRID,
    applicationCounts: { draft: 0, submitted: APPLICANTS.length },
    reviewerUids: ["claudia", "lloyd", "tess"],
    programmeIds: [TAIS, AGI, INCUBATOR],
    programmes: {
      [TAIS]: programme({
        name: "Technical AI Safety Fellowship",
        shortName: "Technical AI Safety",
        places: 2,
        leadUid: "tess",
      }),
      [AGI]: programme({
        name: "AGI Strategy Fellowship",
        shortName: "AGI Strategy",
        places: 3,
        leadUid: "claudia",
        reviewerUids: ["lloyd"],
      }),
      [INCUBATOR]: programme({
        kind: "incubator",
        name: "Research Incubator",
        shortName: "Research incubator",
        places: 4,
        leadUid: "tess",
        useScores: false,
      }),
    },
    questionSetIds: ["fellowships", AGI, TAIS],
    asksFacilitating: false,
    invitationReplyBy: "2026-10-25",
    revealOtherReviews: false,
    noOfferWording: null,
    decisionsSentAt: null,
    decisionsSentByUid: null,
    ...over,
  };
}

/** What somebody wrote, complete enough to send. */
export function contentFor(uid, ranked) {
  const who = CAST[uid];
  const answers = { fellowships: { why: "To find out which arguments hold up." } };
  if (ranked.includes(AGI)) answers[AGI] = { event: "A new law came into force." };
  if (ranked.includes(TAIS)) answers[TAIS] = { built: "A small classifier." };
  return {
    aboutYou: {
      preferredName: who.displayName.split(" ")[0],
      universityEmail: `${uid}@students.example.com`,
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject: "BA Philosophy",
      expectedGraduation: "2028-07",
      motivation: "I want to know which arguments hold up.",
      interests: "Governance",
    },
    rankedProgrammeIds: ranked,
    wantsToFacilitate: null,
    answers,
    availability: { ...GRID, days: ["", "000000000fff", "", "", "", "", ""] },
    suMembership: "yes",
  };
}

/** One stored application. `sent: false` leaves it a draft nobody has sent. */
export function applicationDoc(uid, ranked, { sent = true } = {}) {
  const who = CAST[uid];
  const content = contentFor(uid, ranked);
  return {
    formVersion: 2,
    roundId: ROUND,
    uid,
    email: who.email,
    displayName: who.displayName,
    draft: content,
    sent: sent ? content : null,
    status: sent ? "submitted" : "draft",
    submittedAt: sent ? SENT_AT : null,
    sentAt: sent ? SENT_AT : null,
    withdrawnAt: null,
    result: null,
    invitation: null,
    attendance: null,
    createdAt: SENT_AT,
    updatedAt: SENT_AT,
  };
}

export const userDoc = (who, over = {}) => ({
  uid: who.uid,
  email: who.email,
  displayName: who.displayName,
  role: who.role,
  suRecognised: who.suRecognised,
  profile: {
    preferredName: who.displayName.split(" ")[0],
    universityEmail: `${who.uid}@students.example.com`,
    uniEmailVerifiedAt: SENT_AT,
    status: "undergraduate",
    subject: "BA Philosophy",
    expectedGraduation: "2028-07",
    motivation: "I want to know which arguments hold up.",
  },
  ...over,
});

export const applicationPath = (uid, roundId = ROUND) => `admissionApplications/${roundId}__${uid}`;
export const decisionPath = (uid, roundId = ROUND) => `admissionDecisions/${roundId}__${uid}`;
export const privatePath = (uid, roundId = ROUND) => `admissionApplicationPrivate/${roundId}__${uid}`;

/**
 * The term as documents by path: the form, its question sets, everybody's
 * account, and a sent application from each of `APPLICANTS`. `round` changes
 * the form (its status, say) and `over` adds or replaces whole documents.
 */
export function seedTerm({ round = {}, over = {} } = {}) {
  const docs = {
    [`admissionRounds/${ROUND}`]: roundDoc(round),
    // A round of the older kind, which no form route may treat as a form.
    "admissionRounds/older-round": { kind: "enrolment", label: "An older round", reviewerUids: [] },
  };
  for (const [id, set] of Object.entries(SETS)) {
    docs[`admissionRounds/${ROUND}/questionSets/${id}`] = { roundId: ROUND, intro: "", ...set };
  }
  for (const who of Object.values(CAST)) docs[`users/${who.uid}`] = userDoc(who);
  for (const [uid, ranked] of APPLICANTS) docs[applicationPath(uid)] = applicationDoc(uid, ranked);
  return { ...docs, ...over };
}

/** Every string anywhere inside a value. */
export function stringsIn(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => stringsIn(entry, out));
  else if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, entry] of Object.entries(value)) {
      out.push(key);
      stringsIn(entry, out);
    }
  }
  return out;
}
