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

## Step 3: Generate Title Ideas

Based on the date and any provided topic, generate 3-4 title/description ideas for the call:

1. If a topic was provided, create variations around that theme
2. Consider the time of year (seasonal themes, holidays, notable dates)
3. Consider the call number (milestone numbers like 50, 100)
4. Keep titles concise but memorable (2-5 words)

Present the options to the user and ask them to choose one or provide their own.

## Step 4: Research Ongoing Discussions (Quick Scan)

Do a brief WebFetch check on these key repositories for any hot topics:
- `https://github.com/ethereumclassic/ECIPs/pulls` - Open ECIP proposals
- `https://github.com/ethereumclassic/ECIPs/discussions` - Active discussions

Note any particularly active or time-sensitive discussions to mention in the skeleton agenda.

## Step 5: Create the Call File

1. Generate the filename: `YYYYMMDD_NNN.md` where:
   - YYYYMMDD is the call date (no dashes)
   - NNN is the zero-padded call number (e.g., 046)

2. Create the file with this structure:

```markdown
---
number: [CALL_NUMBER]
description: [CHOSEN_TITLE]
date: [YYYY-MM-DD]
time: [HHMM] UTC
location: Zoom
joinLink: https://us06web.zoom.us/j/89201220070
hosts:
  - Istora
greenRoom:
  time: [ONE_HOUR_BEFORE] UTC
  location: "ETC Discord #dev-meeting"
  joinLink: https://ethereumclassic.org/discord
---

## Preamble

Hello, and Welcome!

This community call is an open voice chat discussion about Ethereum Classic. Everyone is welcome. Please be excellent to each other.

The call will be published on YouTube.

If you are interested, you can join us in the Green Room 1 hour before the next call, in a pre-call hangout that will not be recorded. Find us in the Discord voice channels.

## Announcements

https://cc.ethereumclassic.org

You can browse all past episodes. You can subscribe to the Calendar or RSS to never miss a call. It has a handy timezone converter. You can find AI Summaries of all the calls.

## Let's Dive In

Agenda TBD.

[If any hot topics were found, add brief placeholders like:]
<!-- Potential topics to discuss:
- [Topic from research]
-->

---

# Call References

- https://cc.ethereumclassic.org
```

## Step 6: Confirm and Save

1. Show the user the complete file contents
2. Ask for confirmation before saving
3. Upon confirmation, use the Write tool to create the file in `calls/`
4. Report success with the filename and key details

## Important Notes

- The greenRoom time should be 1 hour before the main call time
- Default Zoom link is the standing ETC community call link
- The agenda is intentionally sparse - use `/draft-agenda` closer to the call date to flesh it out
- Keep the description/title short and punchy for easy reference
- If the user doesn't specify a time, suggest 1400 UTC or 1500 UTC as common options
