---
name: ayah-reminder
description: Show a short Quran ayah reminder in Arabic, English, or both. Use when the user asks for an ayah, wants reminders during long-running work, or wants to configure reminders for the current session.
---

# Ayah Reminder

Use `scripts/ayah_reminder.py` to select one ayah from the curated list and
retrieve verified Arabic text and/or an English meaning.

## Display

Run from this skill directory:

```bash
python3 scripts/ayah_reminder.py --language both
```

Accept `ar`, `en`, or `both`. Use the user's requested language; default to
`both`. Place the script output at the very end of the response without adding
commentary below it. During a long task, the output may instead be a standalone
progress update. Never invent, complete, or edit an ayah if retrieval fails.

## Long waits

If the user enables reminders while waiting, show one at the first available
progress update after about 30 seconds. For commands that support yielding or
polling, yield within 30 seconds and show the reminder before continuing to
wait. If work continues, do not repeat unless the user asks for recurring
reminders.

Use a normal progress-update opportunity; never delay, restart, or interrupt
the task just to show a reminder. A skill cannot interrupt model-only thinking,
and a host that is blocked must show it at the next available progress update.

## Session setup

When the user asks to configure reminders, ask only for:

- language: Arabic, English, or both;
- timing: on request, during long waits, session start, session end, or after
  each response.

Apply the preference for the current conversation. Explain briefly that
persistent or automatic lifecycle behavior requires support from the host; do
not claim a hook was installed when none was. Host-specific plugins may call
the same script without changing this skill.
