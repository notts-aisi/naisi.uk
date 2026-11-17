/**
 * The AI at Nottingham survey's definition, cut down to what a student reads.
 *
 * Runs on the server, in the page. The definition also carries the admin
 * page's words, the code email, the notice and a short name for each line
 * used in results tables; none of that is for a student, and a client
 * component's props are written into the page's HTML. So the page hands over
 * this and never the definition (publicSurvey.ts says what "this" is).
 */
import { AI_SURVEY, fillValues, PROPOSALS_GROUP } from "@/lib/aiSurvey/definition";
import type { AiSurveyDefinition } from "@/lib/aiSurvey/types";
import type { PublicQuestion, PublicSurvey } from "./publicSurvey";

export function publicSurvey(def: AiSurveyDefinition = AI_SURVEY): PublicSurvey {
  const group = def.groups[PROPOSALS_GROUP];
  return {
    title: def.title,
    ui: def.ui,
    start: {
      eyebrow: def.start.eyebrow,
      intro: def.start.intro,
      time: def.start.time,
      organiser: def.values.unionCoBadged ? def.start.organiser.ifUnionCoBadged : def.start.organiser.otherwise,
      yourAnswersHeading: def.start.yourAnswersHeading,
      yourAnswers: def.start.yourAnswers,
      privacyLink: def.start.privacyLink,
      ticks: def.start.ticks,
      button: def.start.button,
      ticksNeeded: def.start.ticksNeeded,
      comingBack: def.start.comingBack,
      closed: fillValues(def.start.closed, {}, def),
      consent: def.start.consent,
    },
    support: def.support,
    emailCheck: def.emailCheck,
    proposalsIntro: { first: group?.introOnFirstShown ?? "", later: group?.introOnLater ?? "" },
    scales: def.scales,
    pages: def.pages.map((page) => ({
      id: page.id,
      heading: page.heading,
      intro: page.intro ?? null,
      proposal: page.group === PROPOSALS_GROUP,
      questions: page.questions.map((q): PublicQuestion => {
        switch (q.type) {
          case "single":
          case "multi":
            return { id: q.id, type: q.type, text: q.text, options: q.options };
          case "select":
            return { id: q.id, type: "select", text: q.text, help: q.help, groups: q.optionGroups, extra: q.extraOptions ?? [] };
          case "lines":
            return {
              id: q.id,
              type: "lines",
              text: q.text,
              scale: q.scale,
              shuffle: q.shuffle,
              lines: q.lines.map((line) => ({ id: line.id, text: line.text })),
            };
          case "rank":
            return { id: q.id, type: "rank", text: q.text, linesFrom: q.linesFrom, places: q.places, extra: q.extraOptions };
          case "text":
            return { id: q.id, type: "text", text: q.text, help: q.help, maxLength: q.maxLength, showIf: q.showIf };
          case "tick":
            return { id: q.id, type: "tick", text: q.text };
        }
      }),
    })),
    end: {
      heading: def.end.heading,
      body: fillValues(def.end.body, {}, def),
      passItOn: fillValues(def.end.passItOn, {}, def),
      petition: def.end.petition,
      newsletterButton: def.end.newsletterButton,
      // A plain address with nothing after it: no query, no source, nothing
      // that says the person came from the survey.
      newsletterHref: `https://${def.values.newsletterLink}`,
    },
  };
}
