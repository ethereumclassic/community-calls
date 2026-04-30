---
name: draft-agenda
description: Draft an agenda for the next upcoming community call based on recent calls, GitHub activity, and ecosystem news
---

# Draft Agenda Skill

Draft a comprehensive agenda for the next upcoming ETC community call.

## Arguments

- `$ARGUMENTS` - Optional specific discussion topics to include

## Step 1: Find the Upcoming Call

1. List all files in `calls/` directory matching pattern `*.md`
2. Parse the frontmatter `date:` field from each call file
3. Find the call with a date in the future (after today's date)
4. If no future call exists, tell the user to create one first
5. Read the upcoming call's file path and current contents

## Step 2: Study Recent Calls

1. Read the **most recent past call** in full — this is the style template
2. Skim the 2 calls before that for ongoing topics and action items
3. The most recent call's structure, formatting, tone, section names, and conventions are the ground truth — replicate them exactly
4. Note any GitHub links, action items, or topics marked for follow-up

## Step 3: Research Updates

For each GitHub link found in recent calls:
1. Use WebFetch to check for updates since the last call date
2. Look for new comments, newly opened or merged PRs, and new discussions

### Ethereum Classic News Since Last Call

Use WebSearch to find Ethereum Classic news and ecosystem developments that have occurred **since the date of the most recent past call**. This is required, not optional.

1. Note the date of the most recent past call (from its frontmatter)
2. Run WebSearch queries scoped to that window, e.g.:
   - `"Ethereum Classic" news after:<last-call-date>`
   - `ETC ecosystem developments since <last-call-date>`
   - `"Ethereum Classic" exchange OR listing OR partnership after:<last-call-date>`
   - `ETC mining OR hashrate OR client after:<last-call-date>`
3. Capture: exchange listings/delistings, regulatory news, ecosystem partnerships, client releases, notable price/market events, conference appearances, and protocol-related announcements
4. Include the relevant findings in an "ETC in the News" section of the agenda, following the format used in the most recent call. If nothing newsworthy surfaced, still include the section and note that briefly.

## Step 4: Draft the Agenda

1. Copy the structure and formatting of the most recent call exactly — same section headings, same boilerplate text, same conventions
2. Replace the topic-specific content with new topics based on your research
3. If the user provided topics via `$ARGUMENTS`, include them
4. Research each topic for relevant context and links

## Step 5: Update the Call File

1. Preserve the existing frontmatter unchanged
2. Replace placeholder content (e.g. "Agenda TBD") with the drafted agenda
3. Inform the user the draft has been saved and offer to iterate

## Important Notes

- Do NOT modify the frontmatter fields
- Do NOT add post-call sections (AI Summary, transcript, etc.)
- Do NOT invent new structural conventions — follow what the latest call does
- Follow the writing style guidance in AGENTS.md
