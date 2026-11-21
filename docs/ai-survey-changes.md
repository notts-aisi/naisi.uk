# The AI at Nottingham survey: changes made while it was open

The survey (`/ai-survey`, [ai-survey.md](ai-survey.md)) opened on 17 November
2026. Its questions have not changed since: no question, answer, code or
scale, and not their order. This page records each change to the words around
the questions, and keeps the privacy notice as it read before, so that what a
student was told on the day they answered can always be shown.

It is kept here, apart from the answers. Nothing about any change is written
onto an answer set.

## Why `version` stays as it is

`version` in the words file is written onto every answer set. It exists so
that a result can be read against the wording of the question its answers
were given to, so a change to a question raises it.

A change to the words around the questions does not. A new number would mark
every answer set as given before the change or after it, and the survey
promises that an answer set carries no date or time. No question changed, so
the results do not need the two told apart.

## Change 1: what the results are for

Made on 18 November 2026. It replaced the earlier words on the live site with
the deploy of this change to `main`: this page's own history gives the day.

The survey is run by the society alone, and its results are published as
totals for anybody to read and use. Four sentences described one use of the
results, a petition and a student vote, as part of the survey. They now say
what the survey itself does.

| Where | Before | After |
|---|---|---|
| Start screen, the opening paragraph | Students here are drawing up proposals on how AI is used at Nottingham: in teaching and marking, with your work and your data, and in the Students' Union itself. Before anything goes to a student vote, we want to know what you think, whether you use AI every day or never touch it. | How should AI be used at Nottingham: in teaching and marking, with your work and your data, and in the Students' Union itself? We want to know what students think, whether you use AI every day or never touch it. |
| End screen, the line above the newsletter button | We'll launch a petition at the Students' Union to put proposals like these to a vote. To hear when it opens, sign up to our newsletter. It's separate from this survey and never linked to your answers. | To hear when the results are out, sign up to our newsletter. It's separate from this survey and never linked to your answers. |
| Privacy notice, "What it is for" | To find out what students think about how AI is used at Nottingham, so that students can decide what to put to a student vote and what to ask the University and the Union for. | To find out what students think about how AI is used at Nottingham, and to publish the results as totals for anyone to read and use, including students, the Students' Union and the University. |
| Privacy notice, "Who sees what", the second item | Totals, and comments with identifying details removed: the Union, the students drafting the proposals, and anyone who reads the published results. | Totals, and quoted comments with identifying details removed: anyone who reads the published results. |

The change to "Who sees what" narrows it: nobody sees more than a student who
answered before the change was told they would.

In the words file, the end screen's line was named `petition` and is now
`newsletterLine`. The newsletter button and its link are as they were.

## Change 2: back to the code box after a reload, and ten codes a day

Made on 20 November 2026. It reached the live site with the deploy of this
change to `main`: this page's own history gives the day.

No question, answer, code or scale changed, and `version` is still 1. The
privacy notice did not change. Nothing new is stored about anybody, and the
browser keeps nothing new: the pass, as before.

The email step and the code step gained three sentences, and an address can
be sent ten codes a day where it could be sent five.

| Where | Before | After |
|---|---|---|
| Code step, when the page has reloaded there (the address box is shown beside the code box) | (none) | This page reloaded, so type your University email again, then the code we sent you. |
| Code step, when "Send my code" is pressed again inside the minute on the email step | (none: the email step said "We've just sent you a code. Wait a minute before asking for another.") | We sent you a code less than a minute ago. Enter it below. |
| Email step, a link under "Send my code" | (none) | I already have a code |
| Codes a day for one address | Five | Ten |

What the page does: while the code step is shown, the page's address ends
`#code`, one fixed word and nothing about the person, so a page that reloads
there comes back to the code box once the start screen's button has been
pressed again, with both boxes ticked and the consent answer given on that
screen ([ai-survey.md](ai-survey.md), "Coming back to the code step"). "Send a new code" inside the minute still says "We've just
sent you a code. Wait a minute before asking for another." One code a minute,
five wrong tries for a code, fifteen minutes for a code and the ceiling an
hour across the survey are as they were, and "You've asked for several codes
today" still says to try again tomorrow.

## The privacy notice as it read from 17 November 2026 until change 1

Exactly as the page at `/ai-survey/privacy` showed it, with its values filled
in.

---

**Privacy notice for this survey**

**Who is responsible**

This survey is run by the Nottingham AI Safety Initiative (NAISI), a student society of the University of Nottingham Students' Union, on NAISI's website. Contact us at ai-safety@uonsu.com.

**What it is for**

To find out what students think about how AI is used at Nottingham, so that students can decide what to put to a student vote and what to ask the University and the Union for.

**What we collect, why, and for how long**

| What | Why | How long we keep it |
|---|---|---|
| Your University email address, once | To check you are a student and that each student answers once | The code lasts 15 minutes. A scrambled record of the address is kept apart from all answers until 7 days after the survey closes on Sunday 29 November 2026, then deleted |
| Your answers | To produce the results | 2 years from the closing date, then deleted. Published totals stay public |
| A record that a code was emailed to you | Our email service, Resend, keeps delivery records | 30 days. If the email bounces or you mark it as spam, the address is kept on a list of addresses we no longer email. |
| Technical records of visits to the site | To keep the site running and stop abuse. They are never matched to answers | As the site's privacy policy says |

**How your answers stay anonymous**

Your email is checked on its own and is never stored with your answers. Answers are stored with no name, email, account or IP address, and with no date or time. Nobody, including us, can tell which answers are yours, so we can't show you, change or delete them after you send them. The newsletter link at the end goes to a separate sign-up, which is never linked to your answers. While you are part way through, your browser keeps a key to your unfinished answers so that you can carry on in the same browser. It holds no answers, and it is removed when you finish.

**What we ask you to leave out**

Please don't put names, or anything that identifies you or someone else, in the comment boxes. If you do, we remove it before the comment goes any further. We don't ask about health, ethnicity, religion or other sensitive matters.

**Our lawful basis**

Legitimate interests: students and their Union have a real interest in knowing what students think, and in each student answering once. Taking part is voluntary and every question can be skipped.

**Who sees what**

- Individual answers, which carry no names: NAISI's president.
- Totals, and comments with identifying details removed: the Union, the students drafting the proposals, and anyone who reads the published results.
- The University: the published results only.
- A comment is quoted in public only if you tick the box, and never with a name.

**Services we use**

Google Cloud hosts the site and stores the answers. Resend sends the code. Google reCAPTCHA checks that the person asking for a code is not a bot, and sets a cookie. Some of these process data outside the UK, under the safeguards named in the site's privacy policy.

**Your rights**

You can ask for a copy of the personal data we hold about you, and ask us to correct it, delete it, restrict it or stop using it. For this survey that means the scrambled record of your email, for as long as we hold it. Write to ai-safety@uonsu.com.

**Complaints**

If you are unhappy with how we have handled your data, tell us at ai-safety@uonsu.com. We will acknowledge your complaint within 30 days and answer it without undue delay. You can also complain to the Information Commissioner's Office at ico.org.uk at any time.
