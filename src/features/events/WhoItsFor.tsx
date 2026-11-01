"use client";

import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import OptionRow from "@/components/ui/OptionRow";
import Select from "@/components/ui/Select";
import Switch from "@/components/ui/Switch";
import WhoIsThisFor from "@/features/audience/WhoIsThisFor";
import { invitationWords, partOfWords, peopleCount, publishingWords } from "@/lib/events/inviteWords";
import { REACH_WORDS, VISIBILITIES, eventReach, liveVisibilityChange } from "@/lib/events/reach";
import type { EventStatus, EventVisibility } from "@/lib/firestore/events";
import { programmeChoiceKey, sameTags, type EventAudienceHandle } from "./useEventAudience";
import styles from "./WhoItsFor.module.css";

/**
 * THE EDITOR'S "WHO’S IT FOR" STEP.
 *
 * Three choices (`src/lib/events/reach.ts`): anyone, people with a NAISI
 * account, or only people the organiser chooses. The first two are listed,
 * and announced to the people who said yes to event announcements unless
 * the organiser switches that off. The third is listed nowhere and never
 * announced: its people are chosen with "Who is this for?", it shows on their
 * Home, and publishing emails each of them an invitation, the way
 * `src/lib/events/invitations.ts` decides, whose counts this draws.
 *
 * Every field here is saved by the editor's Save, like the rest of the form:
 * the choice of audience and the switch with the event, the people chosen
 * through `useEventAudience`.
 */
type Props = {
  status: EventStatus;
  /** Whether this person may change the event at all. */
  editable: boolean;
  busy: boolean;
  visibility: EventVisibility;
  onVisibility: (next: EventVisibility) => void;
  announce: boolean;
  onAnnounce: (next: boolean) => void;
  /** Whether the event was announced when it was published. */
  announced: boolean;
  /** Whether the person looking is the event's author, for "You’re its author". */
  isAuthor: boolean;
  audience: EventAudienceHandle;
  /** Told when the people chosen change, so Save knows. */
  onAudienceChange: () => void;
};

export default function WhoItsFor({
  status,
  editable,
  busy,
  visibility,
  onVisibility,
  announce,
  onAnnounce,
  announced,
  isAuthor,
  audience,
  onAudienceChange,
}: Props) {
  const reach = eventReach({ visibility });
  const published = status === "published" || status === "cancelled";
  const locked = !editable || busy;

  return (
    <div className={styles.step}>
      <fieldset className={styles.choices}>
        <legend className={styles.legend}>Who’s it for?</legend>
        {VISIBILITIES.map((value) => {
          const option = eventReach({ visibility: value });
          // Once it is published, an event stays on its side of the line between
          // listed and for chosen people (the update route refuses the crossing).
          const crossing = published && !liveVisibilityChange(visibility, value).ok;
          return (
            <OptionRow
              key={value}
              type="radio"
              name="event-reach"
              value={value}
              checked={reach === option}
              onChange={() => onVisibility(value)}
              disabled={locked || crossing}
              description={REACH_WORDS.choiceHint[option]}
            >
              {REACH_WORDS.choice[option]}
            </OptionRow>
          );
        })}
      </fieldset>
      {published && (
        <p className={styles.quiet}>
          {reach === "chosen"
            ? "It’s published for the people you chose, so it stays that way."
            : "It’s published and listed, so it can’t become an event for chosen people."}
        </p>
      )}

      {reach === "chosen" ? (
        <ChosenPeople
          locked={locked}
          isAuthor={isAuthor}
          audience={audience}
          onAudienceChange={onAudienceChange}
        />
      ) : (
        <div className={styles.card}>
          <Switch
            checked={announce}
            onChange={onAnnounce}
            disabled={locked || published}
            label="Announce to event-announcement subscribers"
            description={
              published
                ? announced
                  ? "It was announced when it was published."
                  : "It wasn’t announced when it was published."
                : "When it’s published, the people who said yes to event announcements are emailed about it, and notified on their phones if they chose that."
            }
          />
        </div>
      )}
    </div>
  );
}

/** The people chosen, how they are told, and what publishing does. */
function ChosenPeople({
  locked,
  isAuthor,
  audience,
  onAudienceChange,
}: {
  locked: boolean;
  isAuthor: boolean;
  audience: EventAudienceHandle;
  onAudienceChange: () => void;
}) {
  const { stored, loadFailed, retry, tags, setTags, programmeKey, setProgrammeKey, count, problem, counting } = audience;

  if (loadFailed) {
    return (
      <div className={styles.card}>
        <p className={styles.problem} role="alert">
          We couldn’t load who this event is for. Try again in a moment.
        </p>
        <div>
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (!stored) {
    return (
      <div className={styles.card}>
        <p className={styles.quiet} role="status">
          Loading who it’s for…
        </p>
      </div>
    );
  }

  const canChoose = stored.mayChoose && !locked;
  // A choice somebody else made, which this person may not read back as tags:
  // they see whose it is and what it does, and may start again.
  const othersChoice = stored.choice === null && stored.chosenBy !== null && !stored.chosenByYou && tags === null;
  const offered = stored.programmes;
  const chosenProgramme =
    offered.find((each) => programmeChoiceKey(each) === programmeKey) ??
    (stored.programme && programmeChoiceKey(stored.programme) === programmeKey
      ? { ...stored.programme, shortName: stored.programme.name }
      : null);

  return (
    <>
      <div className={styles.card}>
        {canChoose && !othersChoice ? (
          <WhoIsThisFor
            initial={tags ?? undefined}
            peopleOnly
            onChange={(choice) => {
              // The picker reports its first moment, and every new count, as
              // well as every change of tags: only a change is one to save.
              const next = { include: choice.include, exclude: choice.exclude };
              if (sameTags(next, tags)) return;
              setTags(next);
              onAudienceChange();
            }}
          />
        ) : (
          <div className={styles.summary}>
            <h3 className={styles.cardTitle}>Who is this for?</h3>
            <p className={styles.line}>
              {stored.chosenBy
                ? `Chosen by ${stored.chosenBy}${count ? `: ${peopleCount(count.home)}.` : "."}`
                : "Nobody has chosen who it’s for yet."}
            </p>
            {canChoose && (
              <div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setTags({ include: [], exclude: [] });
                    onAudienceChange();
                  }}
                >
                  Choose again
                </Button>
              </div>
            )}
            {!canChoose && !locked && (
              <p className={styles.quiet}>Only the people who can edit this event can change who it’s for.</p>
            )}
          </div>
        )}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Telling them</h3>
        <ul className={styles.facts}>
          <li className={styles.fact}>
            <span className={styles.factLabel}>Shown on their Home</span>
            <span className={styles.factHint}>Always, for an event only some people can see.</span>
          </li>
        </ul>

        {offered.length === 1 ? (
          <OptionRow
            checked={programmeKey === programmeChoiceKey(offered[0])}
            onChange={(e) => {
              setProgrammeKey(e.target.checked ? programmeChoiceKey(offered[0]) : "");
              onAudienceChange();
            }}
            disabled={!canChoose}
            description={partOfWords(offered[0].name, null).hint}
          >
            {partOfWords(offered[0].name, null).label}
          </OptionRow>
        ) : offered.length > 1 ? (
          <div className={styles.field}>
            <label className={styles.factLabel} htmlFor="event-part-of">
              Part of a programme
            </label>
            <Select
              id="event-part-of"
              value={programmeKey}
              disabled={!canChoose}
              onChange={(e) => {
                setProgrammeKey(e.target.value);
                onAudienceChange();
              }}
            >
              <option value="">Not part of a programme</option>
              {offered.map((each) => (
                <option key={programmeChoiceKey(each)} value={programmeChoiceKey(each)}>
                  {each.name}
                </option>
              ))}
            </Select>
            <p className={styles.factHint}>
              {partOfWords(chosenProgramme?.name ?? "a programme", null).hint}
            </p>
          </div>
        ) : chosenProgramme ? (
          <p className={styles.line}>{partOfWords(chosenProgramme.shortName, null).label}.</p>
        ) : null}

        <div className={styles.fact}>
          <span className={styles.factLabel}>Email them an invitation</span>
          <span className={styles.factHint} aria-live="polite">
            {problem ? (
              <span className={styles.problem}>{problem}</span>
            ) : counting ? (
              "Counting…"
            ) : count ? (
              invitationWords(count, isAuthor).join(" ")
            ) : (
              "Choose who it’s for to see who is emailed."
            )}
          </span>
        </div>

        <Switch
          checked={false}
          onChange={() => {}}
          disabled
          label="Announce to event-announcement subscribers"
          description="Not for an event only some people can see."
        />
      </div>

      {count && !problem && !counting && (
        <Notice tone="neutral" role="note">
          {publishingWords(count)}
        </Notice>
      )}
    </>
  );
}
