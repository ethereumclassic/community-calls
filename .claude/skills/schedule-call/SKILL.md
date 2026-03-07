---
name: schedule-call
description: Schedule a new community call by creating a skeleton markdown file with date, time, and placeholder agenda
---

# Schedule Call Skill

Create a new community call skeleton file to announce the date of an upcoming event.

## Arguments

- `$ARGUMENTS` - Date and time in UTC (e.g., "2026-02-13 1400 UTC"), and optionally a topic/theme

## Step 1: Parse User Input

1. Extract the date and time from the arguments
2. Extract any optional topic/theme if provided
3. If date or time is missing or unclear, ask the user to clarify

## Step 2: Determine Call Number

1. List all files in `calls/` directory matching pattern `*.md`
2. Extract the call number from each filename (pattern: `YYYYMMDD_NNN.md`)
3. The new call number = highest existing number + 1

## Step 3: Study the Latest Call

1. Read the most recent call file in full
2. This is the template — copy its frontmatter fields (except date/time/number/description) and body structure exactly
3. Do NOT hard-code any assumptions about frontmatter schema, section names, or boilerplate text — always derive from the latest call

## Step 4: Create the Call File

1. Filename: `YYYYMMDD_NNN.md` (date without dashes, zero-padded call number)
2. Copy the frontmatter structure from the latest call, updating only: `number`, `description`, `date`, `time`
3. Copy the body structure from the latest call, but replace topic-specific content with "Agenda TBD" or similar placeholder
4. If the user provided a title, use it for `description`; otherwise generate a concise default (2-5 words)
5. Briefly confirm what you're creating before writing

## Step 5: Validate

1. If a dev server is running, let it pick up the new file and check for errors
2. Otherwise run `npm run build` to validate; fix any schema errors and retry

## Step 6: Report

Report success with the filename, date, time, and call number.

## Important Notes

- Always derive structure from the latest call — never hard-code templates
- Refer to `src/content.config.ts` for the schema — optional fields can be omitted
- The agenda is intentionally sparse — use the draft-agenda skill closer to the call date to flesh it out
- If the user doesn't specify a time, suggest common options based on recent calls
