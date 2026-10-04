# Thekra (ذِكرى)

**Quran reminders for AI agents.** Thekra can show an ayah in Arabic, English,
or both—on request or while a long task is running.

The same project is distributed in three forms:

- **Claude Code plugin:** the ayah reminder skill, plus a page of Quran ayat
  that stays above the prompt and scrolls while Claude works.
- **Codex plugin:** the easiest installation and update path for Codex users.
- **Portable Agent Skill:** usable by compatible hosts such as Codex, Claude,
  Gemini, and other agents that support skill folders.

## Install as a Claude Code plugin

In Claude Code:

```text
/plugin marketplace add hamaney/THEKRA
/plugin install thekra@thekra
```

Start a new session after installation. The plugin brings the
`thekra:ayah-reminder` skill and the ayat page described below.

### The ayat page

Above the prompt, Thekra keeps a bordered page of four lines of consecutive
ayat, starting at a random ayah, for the whole session:

- The ayat run on as one text, each followed by its number. Lines are laid out
  once and never re-wrapped, so a word keeps its place as the page moves.
- While Claude works the page moves up one line at a time; the oldest line
  fades and the newest is bright.
- Buttons below the page: `prev` and `next` move one line (they swap sides in
  Arabic), the speed button cycles 10, 20 and 30 seconds per line, the
  autoscroll button cycles scrolling while Claude works, always, or never, and
  `English` / `العربية` switches between the Uthmani Arabic and the Saheeh
  International translation. Click them, or focus the band with `ctrl+x tab`
  and press `p`, `n`, `s`, `a` or `t`.
- The source line names the surah and the ayat on the page.
- `/config` has an **Ayat alignment** setting: right (default), center or left.

The page needs a recent Claude Code in the terminal or the desktop app; it is
not drawn in web or headless sessions. It fetches a whole surah per request
from Al Quran Cloud.

## Install as a Codex plugin

This is the recommended option for Codex users.

```bash
codex plugin marketplace add hamaney/THEKRA
codex plugin add thekra@thekra
```

Start a new Codex task after installation so the `thekra:ayah-reminder` skill
is loaded.

## Install as a portable skill

Clone or download this repository, then copy the skill directory into your
agent's personal skills directory.

For Codex:

```bash
cp -R plugins/thekra/skills/ayah-reminder ~/.codex/skills/
```

For Claude, Gemini, DeepSeek, or another compatible agent, copy
`plugins/thekra/skills/ayah-reminder` into that host's Agent Skills directory.
The exact destination depends on the host.

## What it does

- Selects from 100 curated Quran ayah references.
- Displays Uthmani Arabic, Pickthall English, or both.
- Can remind you on request, at session boundaries, after responses, or during
  long-running work.
- Uses only Python's standard library—no package installation or API key.
- Never invents an ayah when the Quran service is unavailable.

The ayah text is retrieved from the [Al Quran Cloud API](https://alquran.cloud/api).
Internet access is currently required.

## Requirements

- Python 3
- Internet access to retrieve ayah text
- A host that supports Agent Skills, or Codex with plugin support

## Usage

Ask naturally. For example:

```text
Show me an ayah in Arabic and English.
Show me an ayah in Arabic only.
Show me an ayah in English only.
Remind me with an ayah when a long task passes 30 seconds.
For this session, show an ayah after each response.
Show an ayah at the beginning and end of this session.
```

You can also run the bundled script directly:

```bash
python3 plugins/thekra/skills/ayah-reminder/scripts/ayah_reminder.py --language both
```

Accepted language values are `ar`, `en`, and `both`.

## Long-task reminders

For a long task, Thekra asks the agent to show an ayah at the first safe
progress update after roughly 30 seconds. A skill cannot interrupt silent model
reasoning or force a message at an exact wall-clock time, so the reminder may
appear at the next tool result or progress update.

Timing and lifecycle preferences are normally scoped to the current
conversation unless the host provides persistent lifecycle settings.

## Updating

### Claude Code plugin

```text
/plugin marketplace update thekra
```

### Codex plugin

Refresh the marketplace, then install the current plugin version:

```bash
codex plugin marketplace upgrade thekra
codex plugin add thekra@thekra
```

### Portable skill

Pull or download the newest repository version and replace the installed
`ayah-reminder` directory. If you installed it as a symbolic link to a cloned
repository, a normal `git pull` is enough.

Updates are not pushed automatically to installations. Users receive them when
they refresh the marketplace or update their local copy.

## Maintaining and contributing

The project intentionally stays small. The main files are:

```text
.
├── .agents/plugins/marketplace.json     Codex marketplace
├── .claude-plugin/marketplace.json      Claude Code marketplace
└── plugins/thekra/
    ├── .codex-plugin/plugin.json
    ├── .claude-plugin/plugin.json
    ├── hooks/                           Claude Code ayat page
    │   ├── hooks.json
    │   ├── index.tsx
    │   └── ayah.test.ts
    ├── types/index.d.ts
    └── skills/ayah-reminder/
        ├── SKILL.md
        ├── agents/openai.yaml
        └── scripts/ayah_reminder.py
```

When changing the project:

1. Keep the plugin identity `thekra` and the bundled skill name
   `ayah-reminder` unless you are intentionally making a breaking change.
2. Update the instructions in `SKILL.md` and the Python script together when
   behavior changes.
3. Bump the semantic version in `plugins/thekra/.codex-plugin/plugin.json`
   and `plugins/thekra/.claude-plugin/plugin.json` for a release.
4. Run the built-in validation and manually test the supported output modes:

```bash
python3 plugins/thekra/skills/ayah-reminder/scripts/ayah_reminder.py --check
python3 plugins/thekra/skills/ayah-reminder/scripts/ayah_reminder.py --language ar
python3 plugins/thekra/skills/ayah-reminder/scripts/ayah_reminder.py --language en
python3 plugins/thekra/skills/ayah-reminder/scripts/ayah_reminder.py --language both
```

   For the Claude Code ayat page:

```bash
claude plugin validate plugins/thekra
claude plugin test plugins/thekra
```

5. Commit and push the changes. Plugin users can then receive the release by
   upgrading the marketplace; portable-skill users can pull or copy it again.

When editing the curated ayah list or translations, verify references and text
against a trustworthy Quran source before publishing.

## Privacy and offline behavior

Thekra does not require an account, API key, or analytics service. Each run
sends only the selected surah-and-ayah reference to Al Quran Cloud to retrieve
the Arabic and English text. The Claude Code ayat page requests a whole surah
at a time and keeps it in memory for the session.

Responses are not currently cached, and the whole Quran is not downloaded
during installation. If the network request fails, Thekra reports that it could
not retrieve an ayah instead of displaying unverified text.

## Current limitations

- Internet access is required.
- There is no offline cache yet.
- Exact timed reminders depend on the host exposing a progress or tool-yield
  point.
- Session-start, session-end, and post-response behavior depends on what the
  host allows a skill to observe.
