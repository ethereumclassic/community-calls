---
name: schedule-call
description: Schedule a new community call by creating a skeleton markdown file with date, time, and placeholder agenda
---

# Schedule Call Skill

Create a new community call skeleton file to announce the date of an upcoming event.

## Arguments

The user should provide:
- `$ARGUMENTS` - Date and time in UTC (e.g., "2026-02-13 1400 UTC"), and optionally a topic/theme

## Step 1: Parse User Input

1. Extract the date from the arguments (format: YYYY-MM-DD or similar)
2. Extract the time in UTC (format: HHMM UTC, e.g., "1400 UTC")
3. Extract any optional topic/theme if provided
4. If date or time is missing or unclear, ask the user to clarify

## Step 2: Determine Call Number

1. List all files in `calls/` directory matching pattern `*.md`
2. Extract the call number from each filename (pattern: `YYYYMMDD_NNN.md`)
3. Find the highest call number
4. The new call will be number = highest + 1

## Step 3: Confirm Title and Date

1. If the user provided a topic/title, use it directly
2. If no title was provided, generate a sensible default based on:
   - Time of year (seasonal themes, holidays)
   - Call number (milestone numbers like 50, 100)
3. Before writing, briefly confirm: "Scheduling call #[N] for [DATE] at [TIME] UTC with title '[TITLE]' - creating now."
4. Keep titles concise (2-5 words)

## Step 4: Create the Call File

1. Generate the filename: `YYYYMMDD_NNN.md` where:
   - YYYYMMDD is the call date (no dashes)
   - NNN is the zero-padded call number (e.g., 046)

2. Create the file with this structure (note: `joinLink` can be left blank if not yet available):

```markdown
---
number: [CALL_NUMBER]
description: [CHOSEN_TITLE]
date: [YYYY-MM-DD]
time: [HHMM] UTC
location: Zoom
joinLink: [link here]
hosts:
  - Istora
greenRoom:
  sameLocation: true
---

## Preamble

Hello, and Welcome!

This community call is an open voice chat discussion about Ethereum Classic. Everyone is welcome. Please be excellent to each other.

The call will be published on YouTube.

If you are interested, you can join us in the Green Room 1 hour before the next call, in a hangout that will not be recorded. Find us in the Discord voice channels.

## Announcements

https://cc.ethereumclassic.org

You can browse all past episodes. You can subscribe to the Calendar or RSS to never miss a call. It has a handy timezone converter. You can find AI Summaries of all the calls.

## Let's Dive In

Agenda TBD.

---

# Call References

- https://cc.ethereumclassic.org
```

## Step 5: Validate

1. Check if a dev server is already running (e.g., check for a running `npm run dev` or `astro dev` process)
2. If a dev server is running, skip the build — the dev server will pick up the new file automatically. Just check the terminal output for any errors.
3. If no dev server is running, run `npm run build` to validate the new file. If the build fails, fix any schema validation errors and re-run until it passes.

## Step 6: Save and Report

1. Report success with the filename and key details (date, time, call number)
2. If there were build errors, mention what was fixed

## Important Notes

- Use `greenRoom: { sameLocation: true }` when the green room is in the same Zoom meeting — this inherits the location, joinLink, and defaults the time to 1 hour before
- If the green room is on Discord or elsewhere, specify `location`, `joinLink`, and optionally `time` explicitly
- The greenRoom time defaults to 1 hour before the main call if not set
- `joinLink` can be left blank - the UI will hide the "Join Call" button until a link is added
- The agenda is intentionally sparse - use `/draft-agenda` closer to the call date to flesh it out
- Keep the description/title short and punchy for easy reference
- If the user doesn't specify a time, suggest 1400 UTC or 1500 UTC as common options
