---
name: draft-agenda
description: Draft an agenda for the next upcoming community call based on recent calls, GitHub activity, and ecosystem news
---

# Draft Agenda Skill

Draft a comprehensive agenda for the next upcoming ETC community call.

## Arguments

The user may optionally provide specific topics to include in the agenda:
- `$ARGUMENTS` - Optional comma-separated list of specific discussion topics

## Step 1: Find the Upcoming Call

1. List all files in `calls/` directory matching pattern `*.md`
2. Parse the frontmatter `date:` field from each call file
3. Find the call with a date in the future (after today's date)
4. **IMPORTANT: If no future call exists, throw an error:**
   ```
   Error: No upcoming call found. Please create a call file first with a future date.
   ```
5. Read and store the upcoming call's file path and current contents

## Step 2: Analyze Recent Calls

1. Read the **3 most recent past calls** (by date) to understand:
   - The preamble format and standard announcements
   - The agenda structure and topic format
   - The tone and style used
   - Any ongoing discussions or action items that should be followed up
2. Extract key information:
   - GitHub issue/PR/discussion links mentioned
   - Action items that were assigned
   - Topics that were marked for future discussion
   - Any unresolved questions or debates

## Step 3: Research GitHub Updates

For each GitHub link found in the recent calls:
1. Use WebFetch to check for updates since the last call date
2. Focus on these repositories:
   - `ethereumclassic/ECIPs` - ECIP proposals and discussions
   - `ethereumclassic/ethereumclassic.github.io` - Website updates
   - `ethereumclassic/community-calls` - Meta discussions
   - `etclabscore/core-geth` - Client development
3. Look for:
   - New comments on existing issues/PRs
   - Newly opened issues or PRs
   - Merged PRs since the last call
   - New discussions

## Step 4: Gather Ecosystem News

Use WebSearch to find recent news about:
1. "Ethereum Classic" news from the past 2-4 weeks
2. ETC ecosystem developments (exchanges, integrations, partnerships)
3. Relevant wider EVM ecosystem news that affects ETC
4. Mining and hashrate updates
5. Any significant price or market developments worth mentioning

## Step 5: Draft the Agenda

Create an agenda following this structure (based on recent calls):

```markdown
---
[Keep existing frontmatter unchanged]
---

## Preamble

Hello, and Welcome!

This community call is an open voice chat discussion about Ethereum Classic. Everyone is welcome. Please be excellent to each other.

The call will be published on YouTube.

If you are interested, you can join us in the Green Room 1 hour before the next call, in a hangout that will not be recorded. Find us in the Discord voice channels.

## Announcements

[Include any standing announcements like the community calls website]

https://cc.ethereumclassic.org

You can browse all past episodes. You can subscribe to the Calendar or RSS to never miss a call. It has a handy timezone converter. You can find AI Summaries of all the calls.

[Add any new announcements based on research]

## Let's Dive In

[Number of topics] Topics.

### [Topic 1 Title]

- [Key point or question]
- [Relevant link or context]

### [Topic 2 Title]

- [Key point or question]
- [Relevant link or context]

[Continue for each topic...]

---

# Call References

- [List all relevant links discussed in the agenda]
```

## Step 6: Include User-Provided Topics

If the user provided specific topics via `$ARGUMENTS`:
1. Add these as dedicated sections in the "Let's Dive In" portion
2. Research each topic for relevant context and links
3. Format them consistently with other topics

## Step 7: Update the Call File

1. Use the Edit tool to update the upcoming call file with the drafted agenda immediately
2. Preserve the existing frontmatter (number, date, time, location, hosts, etc.)
3. Replace "Agenta TBD" or similar placeholder content with the new agenda
4. Inform the user the draft has been saved and offer to iterate/refine together

## Important Notes

- Do NOT modify the frontmatter fields
- Do NOT add the AI Summary section - that comes after the call
- Keep the agenda concise but informative
- Use bullet points for key discussion points
- Include relevant links in each topic section
- Match the writing style and tone of previous calls
- If there are ongoing contentious topics from previous calls, include them for continued discussion
