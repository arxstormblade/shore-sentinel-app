# Archon Protocol Telegram Coordination Policy

## Scope
This policy applies to the **ARX team only**.

Included profiles:
- `default` / ARX
- `vulcan`
- `apollo`
- `aegis`
- `chiron`
- `helios`

Excluded from this setup:
- `ericka`
- `nadia`

## Purpose
Use **Kanban** as the source of truth for task state and **Telegram group chat** (`Archon Protocol`) for live coordination, blocker alerts, handoffs, and approval requests.

## Step 3 — Notification policy
Telegram should carry only high-value workflow events:

### Send to Archon Protocol
- task created for a pilot or important work item
- task blocked / needs input
- task completed
- handoff ready for the next agent
- approval requested
- final approval / rejection / changes requested

### Do not send to Archon Protocol
- heartbeat noise
- low-value micro-updates
- internal retry chatter
- duplicate status echoes already present in Kanban
- long-form specs or bulky logs

### Delivery rules
- Kanban remains the system of record.
- Telegram is a notification and coordination layer only.
- If a task changes state in a meaningful way, record it in Kanban first or at the same time.
- If an update is only conversational, keep it in Telegram and do not overwrite Kanban unless the task state changed.

## Step 4 — Human approval rule
When a task needs the human owner’s decision:

1. The agent posts a short approval request in Archon Protocol.
2. The message explicitly states what decision is needed.
3. The message targets the human owner at Telegram ID `8573339018` or Telegram username `@eaguilar10` for approval routing; use the literal @mention when the bot has username visibility.
4. The task is marked `blocked` in Kanban until the decision is made.
5. Once approved or rejected, the final decision is recorded in Kanban.

### Approval request format
Use a short, explicit format:

```text
Approval needed: <what decision is needed>
Reason: <why this is blocked>
Options: <approve / reject / revise>
Task: <kanban task id>
```

### Mention rule
- Mention the human owner as `@eaguilar10` when the Telegram bot identity and group permissions allow it.
- Use one owner tag consistently for approvals so notifications stay predictable.
- Do not tag the owner for low-priority chatter.

## Operating rules
- **Kanban = task state**
- **Telegram = live coordination**
- **Approval-sensitive work = Kanban blocked until decision exists**
- **Archon Protocol messages should be concise and actionable**

## Setup placeholders for later token wiring
Once the BotFather tokens are provided, the relevant bot profile should be configured with:
- Telegram bot token
- allowed chat/group ID for Archon Protocol
- allowed user list for approval tagging
- home channel / delivery target set to `Archon Protocol`

Do not store tokens in this file.

## Success criteria
- The ARX team can coordinate live in Archon Protocol.
- Kanban still reflects the authoritative state.
- Approval requests are visible and explicit.
- Ericka and Nadia remain excluded from this Telegram setup.
- No heartbeat spam or redundant updates clutter the group.
