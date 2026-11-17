/**
 * Every word a student reads in the survey "AI at Nottingham: what should
 * students ask for?", with a code for each question and each answer.
 *
 * DATA, not code: the pages under src/app/ai-survey are a shell around this
 * module, and no question is written into a component. Curly brackets mark a
 * value from the `values` block (src/lib/aiSurvey/definition.ts fills them).
 *
 * LOCKED ONCE THE SURVEY IS OPEN. After that the questions do not change. A
 * fix to a typo raises `version`, which is kept on each answer set, so a
 * result can always be read against the wording its answers were given to.
 * tests/ai-survey-definition.test.mjs holds the codes and the export's
 * columns in place.
 */
import type { AiSurveyDefinition } from "@/lib/aiSurvey/types";

export const AI_SURVEY: AiSurveyDefinition = {
  "id": "ai-at-nottingham",
  "version": 1,
  "language": "en-GB",
  "title": "AI at Nottingham: what should students ask for?",
  "values": {
    "unionCoBadged": false,
    "unionDataProtectionContact": null,
    "closesAt": "2026-11-29T23:59",
    "closingDate": "Sunday 29 November 2026",
    "resultsBy": "Friday 11 December 2026",
    "surveyAddress": "naisi.uk/ai-survey",
    "noticeAddress": "naisi.uk/ai-survey/privacy",
    "resultsPage": "naisi.uk/ai-survey/results",
    "shortLink": "naisi.uk/q/ai",
    "newsletterLink": "naisi.uk/stay-in-touch",
    "whoOpensAnswers": "NAISI's president",
    "usedEmailListDays": 7,
    "answersYears": 2,
    "emailService": "Resend",
    "emailServiceRetention": "30 days. If the email bounces or you mark it as spam, the address is kept on a list of addresses we no longer email.",
    "botCheck": true,
    "commentsGroupedWithClaude": false,
    "showAiNote": false,
    "timezone": "Europe/London"
  },
  "mustBeSetBeforeOpening": [
    "emailService",
    "emailServiceRetention"
  ],
  "shortLinks": [
    {
      "slug": "ai",
      "where": "The pass-it-on link on the end screen"
    },
    {
      "slug": "ai-mun",
      "where": "The NAISI x Model UN social, Tue 17 Nov 2026"
    },
    {
      "slug": "ai-forum",
      "where": "The QR code on screen at the Students' Union's AI forum, Thu 19 Nov 2026"
    },
    {
      "slug": "ai-naisi",
      "where": "NAISI's Instagram, WhatsApp and emails"
    },
    {
      "slug": "ai-su",
      "where": "The Students' Union's emails, social media and campaigns team"
    },
    {
      "slug": "ai-posters",
      "where": "Posters on campus"
    },
    {
      "slug": "ai-reps",
      "where": "Course reps and lecturers"
    }
  ],
  "scales": {
    "agree": [
      {
        "id": "sa",
        "label": "Strongly agree"
      },
      {
        "id": "a",
        "label": "Agree"
      },
      {
        "id": "n",
        "label": "Neither"
      },
      {
        "id": "d",
        "label": "Disagree"
      },
      {
        "id": "sd",
        "label": "Strongly disagree"
      },
      {
        "id": "dk",
        "label": "Don't know",
        "outsideScale": true
      }
    ],
    "support": [
      {
        "id": "ss",
        "label": "Strongly support"
      },
      {
        "id": "s",
        "label": "Support"
      },
      {
        "id": "n",
        "label": "Neither"
      },
      {
        "id": "o",
        "label": "Oppose"
      },
      {
        "id": "so",
        "label": "Strongly oppose"
      },
      {
        "id": "dk",
        "label": "Don't know enough",
        "outsideScale": true
      }
    ],
    "yesNoNotSure": [
      {
        "id": "yes",
        "label": "Yes"
      },
      {
        "id": "no",
        "label": "No"
      },
      {
        "id": "not_sure",
        "label": "Not sure"
      }
    ]
  },
  "ui": {
    "progress": "Page {n} of {total}",
    "skipNote": "You can skip any question.",
    "savedNote": "Each page is saved when you press Next.",
    "next": "Next",
    "back": "Back",
    "finish": "Finish",
    "saving": "Saving",
    "saveFailed": "We couldn't save that page. Check your connection and try again.",
    "tryAgain": "Try again",
    "charactersLeft": "{n} characters left",
    "selectPlaceholder": "Choose one",
    "frameLabel": "Survey"
  },
  "start": {
    "eyebrow": "Student survey",
    "intro": "Students here are drawing up proposals on how AI is used at Nottingham: in teaching and marking, with your work and your data, and in the Students' Union itself. Before anything goes to a student vote, we want to know what you think, whether you use AI every day or never touch it.",
    "time": "It takes about 10 minutes. You can skip any question.",
    "organiser": {
      "ifUnionCoBadged": "Run by the Students' Union campaigns team with the Nottingham AI Safety Initiative, a student society, on the society's website.",
      "otherwise": "Run by the Nottingham AI Safety Initiative, a student society, on the society's website."
    },
    "aiNote": "This survey was drafted with help from AI and checked by students.",
    "yourAnswersHeading": "Your answers",
    "yourAnswers": [
      "Your answers are anonymous. We check your University email once, so that each student answers once. We don't keep it with your answers, and we can't tell which answers are yours.",
      "The University never sees individual answers. Results are published as totals.",
      "Because we can't tell which answers are yours, we can't take them out after you send them.",
      "Nothing you say here affects your studies."
    ],
    "privacyLink": "Read the full privacy notice",
    "ticks": [
      {
        "id": "student",
        "label": "I'm a current University of Nottingham student."
      },
      {
        "id": "adult",
        "label": "I'm 18 or over."
      }
    ],
    "button": "Start",
    "ticksNeeded": "Tick both boxes to start.",
    "comingBack": {
      "heading": "Carry on where you left off?",
      "body": "This browser has an unfinished survey. Pages already saved stay closed.",
      "carryOn": "Carry on",
      "startOwn": "That wasn't me: start my own"
    },
    "closed": "This survey has closed. Thank you to everyone who answered. Results will be published as totals on {resultsPage} by {resultsBy}."
  },
  "emailCheck": {
    "heading": "Check you're a Nottingham student",
    "fieldLabel": "Your University email (ends @nottingham.ac.uk)",
    "fieldHelp": "We use this once, to check you're a student and haven't answered already. It isn't kept with your answers.",
    "sendButton": "Send my code",
    "botCheckLine": "This step is protected by reCAPTCHA. Google's privacy policy and terms apply.",
    "codeSent": "We've sent a 6-digit code to your University email. It works for 15 minutes.",
    "codeFieldLabel": "Your 6-digit code",
    "checkButton": "Check my code",
    "newCodeLink": "Send a new code",
    "differentEmailLink": "Use a different email",
    "noEmailArrived": "Check your junk folder, or ask for a new code.",
    "afterTheCodeHeading": "You're in",
    "afterTheCode": "Please finish on this device: we don't keep your email with your answers, so we can't bring them back anywhere else.",
    "afterTheCodeButton": "Start the questions",
    "errors": {
      "notUniversityAddress": "Use your University email, ending @nottingham.ac.uk.",
      "wrongCode": "That code doesn't match. Check the email and try again.",
      "codeRunOut": "That code has run out. Ask for a new one.",
      "tooManyWrongTries": "That's too many tries. Ask for a new code.",
      "alreadyAnswered": "This email has already been used to answer. Each student can answer once. If you started on another device, carry on there.",
      "askedAgainTooSoon": "We've just sent you a code. Wait a minute before asking for another.",
      "tooManyCodesToday": "You've asked for several codes today. Try again tomorrow, or write to ai-safety@uonsu.com.",
      "botCheckFailed": "We couldn't check that you're a person. Try again in a moment.",
      "busy": "We're sending a lot of codes right now. Try again in a few minutes.",
      "couldNotSend": "We couldn't send your code. Try again in a minute."
    },
    "stepAddress": "Step 1 of 2",
    "stepCode": "Step 2 of 2"
  },
  "codeEmail": {
    "fromName": "Nottingham AI Safety Initiative",
    "replyTo": "ai-safety@uonsu.com",
    "subject": "{code} is your code for the AI at Nottingham survey",
    "textBody": [
      "Your code is {code}.",
      "",
      "It works for 15 minutes. Type it into the survey page to start.",
      "",
      "If you didn't ask for this, ignore this email and nothing more will happen.",
      "",
      "Nottingham AI Safety Initiative, a student society at the University of Nottingham",
      "ai-safety@uonsu.com"
    ]
  },
  "groups": {
    "proposals": {
      "shufflePages": true,
      "introOnFirstShown": "Students could put proposals like these to a vote. Say how far you'd support or oppose each one. If you haven't heard enough to say, choose 'Don't know enough'.",
      "introOnLater": "More proposals. How far would you support or oppose each one?"
    }
  },
  "pages": [
    {
      "id": "about1",
      "heading": "About you",
      "intro": "Two quick questions first.",
      "questions": [
        {
          "id": "A1",
          "type": "single",
          "text": "What are you studying for?",
          "options": [
            {
              "id": "ug",
              "label": "Undergraduate degree"
            },
            {
              "id": "pgt",
              "label": "Taught postgraduate degree"
            },
            {
              "id": "pgr",
              "label": "Research degree"
            },
            {
              "id": "other",
              "label": "Foundation or other"
            }
          ]
        },
        {
          "id": "A2",
          "type": "select",
          "text": "Which school or department are you in?",
          "help": "If your course spans two, choose the one you think of as home.",
          "optionGroups": [
            {
              "label": "Arts",
              "options": [
                {
                  "id": "clas",
                  "label": "Cultures, Languages and Area Studies (modern languages, American and Canadian studies, cultural, media and visual studies)"
                },
                {
                  "id": "english",
                  "label": "English"
                },
                {
                  "id": "humanities",
                  "label": "Humanities (classics and archaeology, history, music, philosophy, theology and religious studies)"
                }
              ]
            },
            {
              "label": "Engineering",
              "options": [
                {
                  "id": "abe",
                  "label": "Architecture and Built Environment"
                },
                {
                  "id": "chemeng",
                  "label": "Chemical and Environmental Engineering"
                },
                {
                  "id": "civil",
                  "label": "Civil Engineering"
                },
                {
                  "id": "eee",
                  "label": "Electrical and Electronic Engineering"
                },
                {
                  "id": "foundation",
                  "label": "Foundation Engineering and Physical Sciences"
                },
                {
                  "id": "m3",
                  "label": "Mechanical, Materials and Manufacturing Engineering"
                }
              ]
            },
            {
              "label": "Medicine and Health Sciences",
              "options": [
                {
                  "id": "health",
                  "label": "Health Sciences"
                },
                {
                  "id": "life",
                  "label": "Life Sciences"
                },
                {
                  "id": "medicine",
                  "label": "Medicine"
                },
                {
                  "id": "vet",
                  "label": "Veterinary Medicine and Science"
                }
              ]
            },
            {
              "label": "Science",
              "options": [
                {
                  "id": "biosci",
                  "label": "Biosciences"
                },
                {
                  "id": "chem",
                  "label": "Chemistry"
                },
                {
                  "id": "cs",
                  "label": "Computer Science"
                },
                {
                  "id": "maths",
                  "label": "Mathematical Sciences"
                },
                {
                  "id": "pharmacy",
                  "label": "Pharmacy"
                },
                {
                  "id": "physics",
                  "label": "Physics and Astronomy"
                },
                {
                  "id": "psych",
                  "label": "Psychology"
                }
              ]
            },
            {
              "label": "Social Sciences",
              "options": [
                {
                  "id": "econ",
                  "label": "Economics"
                },
                {
                  "id": "education",
                  "label": "Education"
                },
                {
                  "id": "geog",
                  "label": "Geography"
                },
                {
                  "id": "law",
                  "label": "Law"
                },
                {
                  "id": "nubs",
                  "label": "Nottingham University Business School"
                },
                {
                  "id": "polir",
                  "label": "Politics and International Relations"
                },
                {
                  "id": "ssp",
                  "label": "Sociology and Social Policy"
                }
              ]
            }
          ],
          "extraOptions": [
            {
              "id": "not_sure",
              "label": "Not sure"
            }
          ]
        }
      ]
    },
    {
      "id": "use",
      "heading": "How you use AI",
      "intro": "These ask what has happened, not what you think should happen.",
      "questions": [
        {
          "id": "B1",
          "type": "single",
          "text": "How often do you use AI tools (such as ChatGPT, Copilot, Claude or Gemini) for your studies?",
          "options": [
            {
              "id": "daily",
              "label": "Every day"
            },
            {
              "id": "weekly",
              "label": "A few times a week"
            },
            {
              "id": "monthly",
              "label": "A few times a month"
            },
            {
              "id": "rarely",
              "label": "Less often"
            },
            {
              "id": "never",
              "label": "Never"
            }
          ]
        },
        {
          "id": "B2",
          "type": "multi",
          "text": "Which of these have you used AI for when preparing assessed work? Tick any.",
          "options": [
            {
              "id": "explain",
              "label": "Having a concept explained"
            },
            {
              "id": "summarise",
              "label": "Summarising a reading"
            },
            {
              "id": "ideas",
              "label": "Getting ideas for what to research"
            },
            {
              "id": "plan",
              "label": "Planning or organising my thoughts"
            },
            {
              "id": "sources",
              "label": "Searching for sources"
            },
            {
              "id": "draft",
              "label": "Drafting text that I then edited"
            },
            {
              "id": "paste",
              "label": "Putting AI-written text straight into my work"
            },
            {
              "id": "media",
              "label": "Making images, audio or other media"
            },
            {
              "id": "grammar",
              "label": "Checking grammar or wording"
            },
            {
              "id": "code",
              "label": "Writing or checking code"
            },
            {
              "id": "none",
              "label": "None of these",
              "exclusive": true
            }
          ]
        },
        {
          "id": "B3",
          "type": "single",
          "text": "Overall, what effect has AI had on your experience as a student?",
          "options": [
            {
              "id": "much_better",
              "label": "Much better"
            },
            {
              "id": "better",
              "label": "Somewhat better"
            },
            {
              "id": "same",
              "label": "No real difference"
            },
            {
              "id": "worse",
              "label": "Somewhat worse"
            },
            {
              "id": "much_worse",
              "label": "Much worse"
            }
          ]
        },
        {
          "id": "B4",
          "type": "single",
          "text": "How clear are the rules on using AI in your assessments this year?",
          "options": [
            {
              "id": "all",
              "label": "Clear for all of them"
            },
            {
              "id": "most",
              "label": "Clear for most"
            },
            {
              "id": "some",
              "label": "Clear for some"
            },
            {
              "id": "unclear",
              "label": "Mostly unclear"
            },
            {
              "id": "not_looked",
              "label": "I haven't looked"
            },
            {
              "id": "none_yet",
              "label": "No assessments yet"
            }
          ]
        }
      ]
    },
    {
      "id": "seen",
      "heading": "What you've seen this year",
      "intro": null,
      "questions": [
        {
          "id": "B5",
          "type": "lines",
          "text": "This academic year, has a member of teaching staff told you they used AI to do any of these?",
          "scale": "yesNoNotSure",
          "shuffle": false,
          "lines": [
            {
              "id": "B5a",
              "text": "Produce teaching materials"
            },
            {
              "id": "B5b",
              "text": "Write feedback"
            },
            {
              "id": "B5c",
              "text": "Mark work"
            }
          ]
        },
        {
          "id": "B6",
          "type": "single",
          "text": "This academic year, have you had teaching materials or feedback that you believed were made with AI, without being told? Please don't name anyone.",
          "options": [
            {
              "id": "materials",
              "label": "Yes, teaching materials"
            },
            {
              "id": "feedback",
              "label": "Yes, feedback"
            },
            {
              "id": "both",
              "label": "Both"
            },
            {
              "id": "no",
              "label": "No"
            },
            {
              "id": "not_sure",
              "label": "Not sure"
            }
          ]
        },
        {
          "id": "B7",
          "type": "single",
          "text": "Have you ever been questioned or investigated at Nottingham over suspected AI use?",
          "options": [
            {
              "id": "yes",
              "label": "Yes"
            },
            {
              "id": "no",
              "label": "No"
            },
            {
              "id": "prefer_not",
              "label": "Prefer not to say"
            }
          ]
        },
        {
          "id": "B8",
          "type": "single",
          "text": "How worried are you about being wrongly accused of using AI?",
          "options": [
            {
              "id": "very",
              "label": "Very"
            },
            {
              "id": "fairly",
              "label": "Fairly"
            },
            {
              "id": "not_very",
              "label": "Not very"
            },
            {
              "id": "not_at_all",
              "label": "Not at all"
            }
          ]
        },
        {
          "id": "B9",
          "type": "single",
          "text": "Have you been required to use an AI tool for assessed work this year?",
          "options": [
            {
              "id": "yes",
              "label": "Yes"
            },
            {
              "id": "no",
              "label": "No"
            },
            {
              "id": "not_sure",
              "label": "Not sure"
            }
          ]
        },
        {
          "id": "B10",
          "type": "single",
          "text": "Before today, had you heard that Turnitin proposed using students' work to develop AI tools?",
          "options": [
            {
              "id": "yes",
              "label": "Yes"
            },
            {
              "id": "no",
              "label": "No"
            },
            {
              "id": "dont_know_turnitin",
              "label": "I don't know what Turnitin is"
            }
          ]
        }
      ]
    },
    {
      "id": "stand",
      "heading": "Where you stand",
      "intro": "How far do you agree or disagree with each of these?",
      "questions": [
        {
          "id": "C",
          "type": "lines",
          "text": null,
          "scale": "agree",
          "shuffle": true,
          "lines": [
            {
              "id": "C1",
              "text": "Using AI is weakening skills I should be building at university."
            },
            {
              "id": "C2",
              "text": "The University should teach every student to use AI well."
            },
            {
              "id": "C3",
              "text": "Leaving university without knowing how to use AI would put me at a disadvantage."
            },
            {
              "id": "C4",
              "text": "The University should use and promote AI as little as it can."
            },
            {
              "id": "C5",
              "text": "I'd be comfortable with AI helping to mark my work if a person made the final decision and I was told."
            },
            {
              "id": "C6",
              "text": "If students have to declare their AI use, staff should have to declare theirs."
            },
            {
              "id": "C7",
              "text": "The University should avoid AI tools that were trained on people's work without their permission."
            },
            {
              "id": "C8",
              "text": "The environmental cost of AI should count when the University decides whether to use it."
            },
            {
              "id": "C9",
              "text": "I'm worried about what AI will do to graduate jobs in my field."
            },
            {
              "id": "C10",
              "text": "AI has helped me understand things I would otherwise have struggled with."
            },
            {
              "id": "C11",
              "text": "I'd accept more in-person or supervised assessment if it protected the value of my degree."
            },
            {
              "id": "C12",
              "text": "I want to learn about the risks of advanced AI, not only how to use the tools."
            }
          ]
        }
      ]
    },
    {
      "id": "choices",
      "heading": "Four choices",
      "intro": "Pick the answer closest to your view.",
      "questions": [
        {
          "id": "X1",
          "type": "single",
          "text": "Which is closest to your view of how the University should treat AI?",
          "options": [
            {
              "id": "minimal",
              "label": "Use and promote it as little as possible"
            },
            {
              "id": "rules",
              "label": "Use it, with firm rules and full openness about where"
            },
            {
              "id": "embrace",
              "label": "Embrace it and prepare every student to use it"
            },
            {
              "id": "not_sure",
              "label": "Not sure"
            }
          ]
        },
        {
          "id": "X2",
          "type": "single",
          "text": "And AI in marking?",
          "options": [
            {
              "id": "never",
              "label": "AI should never be used to mark students' work"
            },
            {
              "id": "human",
              "label": "AI can help, if a person decides every mark and students are told"
            },
            {
              "id": "free",
              "label": "Staff should be free to use AI in marking as they see fit"
            },
            {
              "id": "not_sure",
              "label": "Not sure"
            }
          ]
        },
        {
          "id": "X3",
          "type": "single",
          "text": "Turnitin is the service the University uses to collect coursework and check it for matching text. In 2026 it proposed new terms that would let it use students' work to develop AI tools. After universities objected, it put the change on hold until September 2027. What should the University do?",
          "options": [
            {
              "id": "stop",
              "label": "Stop using Turnitin"
            },
            {
              "id": "guarantee",
              "label": "Keep it only with a written guarantee that no student work trains any AI"
            },
            {
              "id": "carry_on",
              "label": "Carry on using it as now"
            },
            {
              "id": "not_sure",
              "label": "Not sure"
            }
          ]
        },
        {
          "id": "X4",
          "type": "single",
          "text": "Should the Students' Union use AI-made images, video or music in its own publicity and events?",
          "options": [
            {
              "id": "no",
              "label": "No"
            },
            {
              "id": "labelled",
              "label": "Only if it's labelled"
            },
            {
              "id": "yes",
              "label": "Yes"
            },
            {
              "id": "not_sure",
              "label": "Not sure"
            }
          ]
        }
      ]
    },
    {
      "id": "d1",
      "group": "proposals",
      "heading": "Your work and your data",
      "questions": [
        {
          "id": "D1",
          "type": "lines",
          "text": null,
          "scale": "support",
          "shuffle": true,
          "lines": [
            {
              "id": "P1",
              "text": "The University guarantees that no student's work is used to train or improve any AI system, AI detectors included, unless that student opts in.",
              "short": "No AI training on student work without opt-in"
            },
            {
              "id": "P2a",
              "text": "The University publishes its contract dates and settings for Turnitin.",
              "short": "Publish Turnitin's contract dates and settings"
            },
            {
              "id": "P2b",
              "text": "The University stops using Turnitin if its future terms let student work train AI.",
              "short": "Stop using Turnitin if its terms allow AI training"
            },
            {
              "id": "P3",
              "text": "The University does not renew contracts with any company that uses students' work to train AI.",
              "short": "No contracts with companies that train AI on student work"
            },
            {
              "id": "P4",
              "text": "The University's rules state that students own their work and that it can be used only to assess them.",
              "short": "Students own their work"
            },
            {
              "id": "P5",
              "text": "Students and staff have seats wherever the University decides to buy, renew or adopt AI tools.",
              "short": "Students at the table for AI tools"
            },
            {
              "id": "P6",
              "text": "The University publishes a list of where AI is used on students or their data, such as marking, admissions, support services and survey analysis.",
              "short": "Register of AI used on students"
            }
          ]
        },
        {
          "id": "M1",
          "type": "mostOf",
          "text": "Which one of these matters most to you?",
          "linesFrom": "D1",
          "extraOptions": [
            {
              "id": "none",
              "label": "None of these"
            }
          ]
        }
      ]
    },
    {
      "id": "d2",
      "group": "proposals",
      "heading": "Teaching and marking",
      "questions": [
        {
          "id": "D2",
          "type": "lines",
          "text": null,
          "scale": "support",
          "shuffle": true,
          "lines": [
            {
              "id": "P7",
              "text": "Staff say where AI is used in teaching, marking and feedback: at the start of each module, and on any work it helped to mark.",
              "short": "Staff say when AI marks, feeds back or makes materials"
            },
            {
              "id": "P8",
              "text": "A person makes every marking decision, even where AI is used to help.",
              "short": "A person makes every marking decision"
            },
            {
              "id": "P9",
              "text": "Staff use AI tools in teaching or assessment only after opting in, so that not using AI is the default.",
              "short": "Staff opt in before using AI"
            },
            {
              "id": "P10",
              "text": "Staff never put students' work into AI tools or AI detectors that the University hasn't approved.",
              "short": "No unapproved AI tools or detectors"
            },
            {
              "id": "P11",
              "text": "If AI helped mark a piece of work and the student wasn't told, the student can have it re-marked by a person.",
              "short": "Human re-mark where AI use wasn't disclosed"
            },
            {
              "id": "P12",
              "text": "The Students' Union runs an anonymous form where students report how AI is used on their course, and publishes the totals for each School every term.",
              "short": "Union reporting form"
            }
          ]
        },
        {
          "id": "M2",
          "type": "mostOf",
          "text": "Which one of these matters most to you?",
          "linesFrom": "D2",
          "extraOptions": [
            {
              "id": "none",
              "label": "None of these"
            }
          ]
        }
      ]
    },
    {
      "id": "d3",
      "group": "proposals",
      "heading": "Rules for students",
      "questions": [
        {
          "id": "D3",
          "type": "lines",
          "text": null,
          "scale": "support",
          "shuffle": true,
          "lines": [
            {
              "id": "P13",
              "text": "Every assessment states its AI rules in the same standard format, from the start of the module.",
              "short": "Standard AI rules on every assessment"
            },
            {
              "id": "P14",
              "text": "No student is investigated or penalised on the strength of an AI detector score.",
              "short": "No cases on detector scores"
            },
            {
              "id": "P15",
              "text": "Every module can be passed without using AI.",
              "short": "Every module passable without AI"
            },
            {
              "id": "P16",
              "text": "Where an assessment allows or requires AI, the University gives every student the tool free.",
              "short": "Free tools where AI is allowed"
            },
            {
              "id": "P17",
              "text": "The University deals with AI-related cheating more firmly, and more consistently across Schools.",
              "short": "Firmer, more consistent handling of AI cheating"
            }
          ]
        },
        {
          "id": "M3",
          "type": "mostOf",
          "text": "Which one of these matters most to you?",
          "linesFrom": "D3",
          "extraOptions": [
            {
              "id": "none",
              "label": "None of these"
            }
          ]
        }
      ]
    },
    {
      "id": "d4",
      "group": "proposals",
      "heading": "Learning about AI, and the University's wider stance",
      "questions": [
        {
          "id": "D4",
          "type": "lines",
          "text": null,
          "scale": "support",
          "shuffle": true,
          "lines": [
            {
              "id": "P18",
              "text": "Optional teaching on how AI works, how to use it well and its risks is open to students on every course.",
              "short": "Optional AI literacy and safety teaching"
            },
            {
              "id": "P30",
              "text": "Every degree includes compulsory teaching on AI safety: how AI systems can fail or cause harm, and how those risks are managed.",
              "short": "Compulsory AI safety teaching in every degree"
            },
            {
              "id": "P19",
              "text": "The careers service gives guidance on how AI is changing graduate jobs in each subject.",
              "short": "Careers support"
            },
            {
              "id": "P20",
              "text": "The University does not use AI-made images, video or music in its marketing.",
              "short": "No AI-made media in University marketing"
            },
            {
              "id": "P21",
              "text": "The University does not take sponsorship from AI companies or run marketing partnerships with them.",
              "short": "No AI company sponsorship or marketing partnerships"
            },
            {
              "id": "P22",
              "text": "The University does not use AI to write or change its regulations and governing documents.",
              "short": "No AI in writing University regulations"
            },
            {
              "id": "P23",
              "text": "The University measures the carbon emissions of the AI it uses and sets out how it will cut them.",
              "short": "AI emissions measured and cut"
            },
            {
              "id": "P24",
              "text": "The University does not use AI tools that imitate a real person's voice, face or personality.",
              "short": "No tools that imitate a real person"
            }
          ]
        },
        {
          "id": "M4",
          "type": "mostOf",
          "text": "Which one of these matters most to you?",
          "linesFrom": "D4",
          "extraOptions": [
            {
              "id": "none",
              "label": "None of these"
            }
          ]
        }
      ]
    },
    {
      "id": "d5",
      "group": "proposals",
      "heading": "Your Students' Union",
      "questions": [
        {
          "id": "D5",
          "type": "lines",
          "text": null,
          "scale": "support",
          "shuffle": true,
          "lines": [
            {
              "id": "P25",
              "text": "Elected Officers publish, each term, a list of where they used AI in work that reaches students.",
              "short": "Officers' AI log"
            },
            {
              "id": "P26",
              "text": "Statements, speeches and papers from the Students' Union that were drafted with AI say so.",
              "short": "AI-drafted Union documents say so"
            },
            {
              "id": "P27",
              "text": "The Students' Union sets out what AI is never used for: advice casework, disciplinary cases, elections and decisions about individual students.",
              "short": "What the Union never uses AI for"
            },
            {
              "id": "P28",
              "text": "Officers take training on using AI responsibly, and Students' Union staff are offered it.",
              "short": "Training for Officers and staff"
            },
            {
              "id": "P29",
              "text": "The Students' Union repeats this survey every year and reports progress on AI to students each term.",
              "short": "Yearly survey and termly reports"
            }
          ]
        },
        {
          "id": "M5",
          "type": "mostOf",
          "text": "Which one of these matters most to you?",
          "linesFrom": "D5",
          "extraOptions": [
            {
              "id": "none",
              "label": "None of these"
            }
          ]
        }
      ]
    },
    {
      "id": "priorities",
      "heading": "Priorities and the vote",
      "intro": null,
      "questions": [
        {
          "id": "E1",
          "type": "single",
          "text": "Which of these areas matters most to you?",
          "options": [
            {
              "id": "work_data",
              "label": "Your work and your data"
            },
            {
              "id": "teaching",
              "label": "Teaching and marking"
            },
            {
              "id": "rules",
              "label": "Rules for students"
            },
            {
              "id": "learning",
              "label": "Learning about AI"
            },
            {
              "id": "stance",
              "label": "The University's wider stance on AI"
            },
            {
              "id": "union",
              "label": "How the Students' Union uses AI"
            },
            {
              "id": "none",
              "label": "None of these"
            }
          ]
        },
        {
          "id": "F1",
          "type": "single",
          "text": "If proposals like these went to a vote of all students this year, how likely would you be to vote?",
          "options": [
            {
              "id": "definitely",
              "label": "Definitely"
            },
            {
              "id": "probably",
              "label": "Probably"
            },
            {
              "id": "probably_not",
              "label": "Probably not"
            },
            {
              "id": "definitely_not",
              "label": "Definitely not"
            },
            {
              "id": "not_sure",
              "label": "Not sure"
            }
          ]
        },
        {
          "id": "F2",
          "type": "single",
          "text": "Before today, did you know that students can vote on Students' Union policy?",
          "options": [
            {
              "id": "yes",
              "label": "Yes"
            },
            {
              "id": "no",
              "label": "No"
            }
          ]
        }
      ]
    },
    {
      "id": "last",
      "heading": "Last page",
      "intro": "One comment, then a few quick questions about you.",
      "questions": [
        {
          "id": "G1",
          "type": "text",
          "text": "What is the one thing about AI at Nottingham you would change? Please don't name anyone, or include anything that identifies you or someone else.",
          "help": "Up to 500 characters.",
          "maxLength": 500
        },
        {
          "id": "G2",
          "type": "tick",
          "text": "You can quote this, without my name."
        },
        {
          "id": "A3",
          "type": "single",
          "text": "Which year of your course are you in?",
          "options": [
            {
              "id": "1",
              "label": "1"
            },
            {
              "id": "2",
              "label": "2"
            },
            {
              "id": "3",
              "label": "3"
            },
            {
              "id": "4plus",
              "label": "4 or later"
            },
            {
              "id": "na",
              "label": "Doesn't apply"
            }
          ]
        },
        {
          "id": "A4",
          "type": "single",
          "text": "Are you a home or an international student?",
          "options": [
            {
              "id": "home",
              "label": "Home"
            },
            {
              "id": "international",
              "label": "International"
            },
            {
              "id": "prefer_not",
              "label": "Prefer not to say"
            }
          ]
        },
        {
          "id": "A5",
          "type": "single",
          "text": "Is English your first language?",
          "options": [
            {
              "id": "yes",
              "label": "Yes"
            },
            {
              "id": "no",
              "label": "No"
            },
            {
              "id": "prefer_not",
              "label": "Prefer not to say"
            }
          ]
        },
        {
          "id": "A6",
          "type": "single",
          "text": "Have you been to an event or programme run by NAISI, the society running this survey?",
          "options": [
            {
              "id": "yes",
              "label": "Yes"
            },
            {
              "id": "no",
              "label": "No"
            },
            {
              "id": "not_sure",
              "label": "Not sure"
            }
          ]
        },
        {
          "id": "H1",
          "type": "single",
          "text": "Where did you first hear about this survey?",
          "options": [
            {
              "id": "forum",
              "label": "The Students' Union's AI forum"
            },
            {
              "id": "mun",
              "label": "The Model UN social"
            },
            {
              "id": "naisi",
              "label": "NAISI's Instagram, WhatsApp or emails"
            },
            {
              "id": "su",
              "label": "The Students' Union's emails or social media"
            },
            {
              "id": "poster",
              "label": "A poster"
            },
            {
              "id": "reps",
              "label": "A course rep or lecturer"
            },
            {
              "id": "friend",
              "label": "A friend"
            },
            {
              "id": "other",
              "label": "Somewhere else"
            }
          ]
        }
      ]
    }
  ],
  "end": {
    "heading": "Thank you",
    "body": "Your answers are in. Results will be published as totals on {resultsPage} by {resultsBy}.",
    "passItOn": "Every Nottingham student can answer once. If you know someone who'd want a say, send them {shortLink}.",
    "petition": "We'll launch a petition at the Students' Union to put proposals like these to a vote. To hear when it opens, sign up to our newsletter. It's separate from this survey and never linked to your answers.",
    "newsletterButton": "Sign up to the newsletter"
  },
  "privacyNotice": {
    "title": "Privacy notice for this survey",
    "sections": [
      {
        "heading": "Who is responsible",
        "body": {
          "ifUnionCoBadged": "This survey is run jointly by the University of Nottingham Students' Union and the Nottingham AI Safety Initiative (NAISI), a student society of the Union, on NAISI's website. Contact us at ai-safety@uonsu.com or {unionDataProtectionContact}.",
          "otherwise": "This survey is run by the Nottingham AI Safety Initiative (NAISI), a student society of the University of Nottingham Students' Union, on NAISI's website. Contact us at ai-safety@uonsu.com."
        }
      },
      {
        "heading": "What it is for",
        "body": "To find out what students think about how AI is used at Nottingham, so that students can decide what to put to a student vote and what to ask the University and the Union for."
      },
      {
        "heading": "What we collect, why, and for how long",
        "table": {
          "columns": [
            "What",
            "Why",
            "How long we keep it"
          ],
          "rows": [
            [
              "Your University email address, once",
              "To check you are a student and that each student answers once",
              "The code lasts 15 minutes. A scrambled record of the address is kept apart from all answers until {usedEmailListDays} days after the survey closes on {closingDate}, then deleted"
            ],
            [
              "Your answers",
              "To produce the results",
              "{answersYears} years from the closing date, then deleted. Published totals stay public"
            ],
            [
              "A record that a code was emailed to you",
              "Our email service, {emailService}, keeps delivery records",
              "{emailServiceRetention}"
            ],
            [
              "Technical records of visits to the site",
              "To keep the site running and stop abuse. They are never matched to answers",
              "As the site's privacy policy says"
            ]
          ]
        }
      },
      {
        "heading": "How your answers stay anonymous",
        "body": "Your email is checked on its own and is never stored with your answers. Answers are stored with no name, email, account or IP address, and with no date or time. Nobody, including us, can tell which answers are yours, so we can't show you, change or delete them after you send them. The newsletter link at the end goes to a separate sign-up, which is never linked to your answers."
      },
      {
        "heading": "What we ask you to leave out",
        "body": "Please don't put names, or anything that identifies you or someone else, in the comment box. If you do, we remove it before the comment goes any further. We don't ask about health, ethnicity, religion or other sensitive matters."
      },
      {
        "heading": "Our lawful basis",
        "body": "Legitimate interests: students and their Union have a real interest in knowing what students think, and in each student answering once. Taking part is voluntary and every question can be skipped."
      },
      {
        "heading": "Who sees what",
        "list": [
          "Individual answers, which carry no names: {whoOpensAnswers}.",
          "Totals, and comments with identifying details removed: the Union, the students drafting the proposals, and anyone who reads the published results.",
          "The University: the published results only.",
          "A comment is quoted in public only if you tick the box, and never with a name."
        ]
      },
      {
        "heading": "Services we use",
        "sentences": [
          {
            "text": "Google Cloud hosts the site and stores the answers."
          },
          {
            "text": "{emailService} sends the code."
          },
          {
            "text": "Anthropic's Claude helps us group written comments into themes. A person checks the result and no email addresses are sent.",
            "onlyIf": "commentsGroupedWithClaude"
          },
          {
            "text": "Google reCAPTCHA checks that the person asking for a code is not a bot, and sets a cookie.",
            "onlyIf": "botCheck"
          },
          {
            "text": "Some of these process data outside the UK, under the safeguards named in the site's privacy policy."
          }
        ]
      },
      {
        "heading": "Your rights",
        "body": "You can ask for a copy of the personal data we hold about you, and ask us to correct it, delete it, restrict it or stop using it. For this survey that means the scrambled record of your email, for as long as we hold it. Write to ai-safety@uonsu.com."
      },
      {
        "heading": "Complaints",
        "body": "If you are unhappy with how we have handled your data, tell us at ai-safety@uonsu.com. We will acknowledge your complaint within 30 days and answer it without undue delay. You can also complain to the Information Commissioner's Office at ico.org.uk at any time."
      }
    ],
    "frameLabel": "Privacy",
    "backLink": "Back to the survey"
  },
  "export": {
    "skipped": "",
    "notReached": "not_seen",
    "multi": "One column for each option, named like B2_explain, holding 1 or 0."
  },
  "admin": {
    "heading": "AI at Nottingham survey",
    "stages": {
      "pilot": "Pilot",
      "open": "Open",
      "closed": "Closed"
    },
    "stageNotes": {
      "pilot": "Reachable by its address. Pilot answers and the used-email list are thrown away when you clear them or open the survey.",
      "open": "Open to every Nottingham student until {closingDate}.",
      "closed": "Closed. Sessions already under way could save for 30 minutes after closing."
    },
    "counts": {
      "started": "Answer sets started",
      "finished": "Finished",
      "codesLastHour": "Codes sent in the last hour",
      "ceiling": "Ceiling: {n} an hour"
    },
    "missingHeading": "Before it can open",
    "missingSet": "Set",
    "missingNotSet": "Not set",
    "openButton": "Open the survey",
    "openNote": "Opening clears the pilot answers and the used-email list first.",
    "closeButton": "Close it now",
    "closeConfirm": "Close the survey now? Nobody new can start. Anyone part way through has 30 minutes to save.",
    "clearButton": "Clear pilot data",
    "clearConfirmLabel": "Type clear pilot data to confirm",
    "clearDone": "Pilot answers and the used-email list are cleared.",
    "exportButton": "Download the answers (CSV)",
    "exportNote": "Only you can download this. Each download is logged.",
    "totalsLink": "See the totals",
    "shortLinksHeading": "Short links",
    "shortLinksScans": "Scans",
    "neverOnePerson": "This page never shows anything about one person.",
    "frameLabel": "Admin · Surveys",
    "stageNow": "(now)",
    "shortLinksLink": "Link",
    "shortLinksWhere": "Where"
  }
};
