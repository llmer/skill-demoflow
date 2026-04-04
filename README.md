# llmer-demoflow

A Claude Code skill for generating demo videos and acceptance tests from natural language. Write what a user does in plain English, point it at an environment, and get a HAR file + MP4 with click visualization.

```
/demo workspace-switching --target production
```

## What it does

1. You describe a user journey in a Markdown scenario file (plain English)
2. You define target environments (local dev, staging, production) with URLs, auth strategies, and timeouts
3. Claude reads the scenario + target + app context, generates a Playwright script, and runs it
4. You get: **HAR** (full network capture), **MP4** (screen recording with click indicators), and a step log

No selectors in your scenario files. No test framework boilerplate. Claude figures out the Playwright code from your app context and the page state.

## Quick Start

### 1. Install the skill

```bash
npx skills add llmer/llmer-demoflow
```

This installs the `/demo` skill into your project via [skills.sh](https://skills.sh/).

### 2. Install the runtime library

```bash
npm install llmer-demoflow
npx playwright install chromium
```

### 3. Initialize

Run the init skill to have Claude explore your project and scaffold everything:

```
/demo init
```

This will:
- Scan your routes, pages, and components
- Generate `.demoflow/context.md` with your app's UI patterns and selectors
- Create target configs for detected environments (local, staging, production)
- Suggest scenarios based on the flows it discovers
- Set up `.demoflow/` directory structure

You can also set up manually — see [Manual Setup](#manual-setup) below.

### 4. Run a demo

```
/demo workspace-switching
/demo workspace-switching --target production
/demo "log in and create a new project"
```

## Natural Language Usage

You don't need to write config files by hand. Just describe what you want:

```bash
# Scaffold everything — Claude explores your project and generates context, targets, and scenarios
/demo init

# Add a target by describing your environment
/demo "add a local dev target at localhost:3000 with Mailpit on port 8025 for OTP"

# Add a scenario by describing the user journey
/demo "add a scenario for user signup and first project creation"

# Run a demo from an inline description (no scenario file needed)
/demo "log in and navigate to settings"
```

## How it works

```
┌──────────────────────────┐
│  .demoflow/scenarios/    │  ← What to do (plain English)
│    workspace-switching.md    │
├──────────────────────────┤
│  .demoflow/targets/      │  ← Where to run (DUT config)
│    local.md              │
│    production.md         │
├──────────────────────────┤
│  .demoflow/context.md    │  ← App knowledge (UI patterns, selectors)
├──────────────────────────┤
│  Claude reads all three, │
│  generates a Playwright  │  ← Claude is the AI driver
│  script, runs it with    │
│  full recording          │
├──────────────────────────┤
│  output/                 │
│    recording.har         │  ← Network capture
│    recording.mp4         │  ← Video with click indicators
│    steps.json            │  ← Step-by-step log
└──────────────────────────┘
```

## Project Structure

After setup, your project will have:

```
.demoflow/
├── context.md              # App-specific UI patterns and selectors
├── targets/
│   ├── local.md            # Local dev environment config
│   └── production.md       # Production environment config
└── scenarios/
    ├── onboarding.md       # User signup + first action
    └── core-workflow.md    # Main happy-path flow

.claude/skills/demo/
└── SKILL.md                # The skill definition (installed via skills.sh)
```

## Writing Targets

Targets are your DUT (Device Under Test) configs. They tell Claude **where** and **how** to run.

### Target format

```markdown
# Local Development

Description of this environment.

## Connection
- url: https://localhost:3000
- email: test-${RUN_ID}@example.com

## Auth
How to handle authentication. Two strategies:

**Auto-fetch** (for local dev with Mailpit/Inbucket):
- Email API: http://127.0.0.1:8025
- Search: GET /api/v1/search?query=to:{email}
- Read: GET /api/v1/message/{ID}
- Extract OTP: regex /(\d{6})/ from message Text body

**Prompt** (for production with real email):
- strategy: prompt
- message: Enter the OTP code sent to {email}

## Behavior
- headed: true
- slow_mo: 100ms
- action_timeout: 60s
- page_load_timeout: 15s

## Notes
- Any environment-specific gotchas or constraints
```

Key fields:
- **`url`** — base URL for the app
- **`email`** — login email. Use `${RUN_ID}` for a unique value per run (avoids rate limits)
- **`strategy: prompt`** — pauses and asks you for input (OTP, 2FA codes)
- **Email API section** — auto-retrieves OTP from local email server
- **Behavior** — timeouts, headed/headless, action speed

## Writing Scenarios

Scenarios describe **what** to do in plain English. They're target-agnostic.

### Scenario format

```markdown
# My Demo

What this scenario demonstrates.

## Config
target: local
capture: har, video
viewport: 1280x720

## Steps

1. Go to the login page
2. Enter the target email and submit
3. Get the OTP (auto or prompt, depending on target)
4. Verify the OTP
5. Click "Create Project" on the dashboard
6. Fill in the project name "Test Project"
7. Click Save
8. [assert: url contains /projects/]
9. [screenshot: project-created]
10. Navigate to Settings
11. [pause: 2s]
```

### Directives

These are the only structured bits — everything else is natural language:

| Directive | What it does |
|-----------|-------------|
| `[prompt: message]` | Pause and ask the user for input |
| `[save: var_name from url]` | Capture a value from the URL into a variable |
| `[pause: 3s]` | Visual pause (for video pacing) |
| `[assert: condition]` | Verify state — fails in `--assert` mode |
| `[screenshot: name]` | Take a named screenshot |

### Referencing variables

Use saved variables in later steps:

```markdown
9. [save: project_id from url]
...
15. Open the first project (project_id)
```

## Writing Context

The context file (`.demoflow/context.md`) gives Claude app-specific knowledge so it can generate accurate selectors and handle UI patterns correctly. You don't need to cover every page — focus on:

- **Auth flow** — what the login/signup looks like
- **Key pages** — selectors for important interactive elements
- **Navigation patterns** — sidebar, breadcrumbs, tabs
- **Modals/dialogs** — anything that might appear unexpectedly
- **Rate limits** — so the script doesn't get throttled
- **Gotchas** — slow operations, async loading states, iframes

See [examples/context.md](examples/context.md) for a complete example.

## Running Demos

### Via Claude Code skill

```
/demo scenario-name                      # Uses default target from scenario
/demo scenario-name --target production  # Override target
/demo "describe what you want to do"     # Inline description (no scenario file)
```

### Interactive prompts

When the script needs input (OTP codes, 2FA tokens), it pauses and Claude asks you in the conversation. You reply with the code, and the script continues.

### Output

Recordings are saved to `output/{scenario-name}/`:

```
output/workspace-switching/
├── recording.har        # Full network traffic (importable in Chrome DevTools)
├── recording.mp4        # Screen recording with red click indicators
├── recording.webm       # Raw video
└── error.png            # Screenshot if something failed
```

## Manual Setup

If you prefer to set up without `/demo init`:

```bash
# Install skill + runtime
npx skills add llmer/llmer-demoflow
npm install llmer-demoflow
npx playwright install chromium

# Create directory structure
mkdir -p .demoflow/targets .demoflow/scenarios

# Create files (use examples/ as templates)
cp node_modules/llmer-demoflow/examples/targets/local.md .demoflow/targets/local.md
cp node_modules/llmer-demoflow/examples/context.md .demoflow/context.md
```

Then edit the files to match your app.

## Requirements

- [Claude Code](https://claude.ai/code) (the skill runner)
- [Playwright](https://playwright.dev/) (`npx playwright install chromium`)
- [ffmpeg](https://ffmpeg.org/) (for webm → mp4 conversion, optional)

## Development

### Setup

```bash
git clone https://github.com/llmer/llmer-demoflow.git
cd llmer-demoflow
npm install
npm run build
```

### Dev workflow

Start the watcher — it runs `tsc --watch` and auto-copies compiled output to `demo/lib/`:

```bash
npm run dev
```

### Testing in local repos

To test changes against a repo that already has `.demoflow/` initialized, link it once:

```bash
npm run link ~/src/my-app
```

This replaces the copied `.agents/skills/demo/` in the target repo with a symlink back to this repo's `demo/` directory. After linking:

- Edits to `src/*.ts` auto-compile to `demo/lib/` (via `npm run dev`) and are immediately visible
- Edits to `demo/SKILL.md` are instant — no build step needed

You can link multiple repos at once:

```bash
npm run link ~/src/app-one ~/src/app-two
```

> **Note:** Running `npx skills add` in a target repo overwrites the symlink with a copy. Re-run `npm run link` after any `skills add`.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | One-shot compile + copy to `demo/lib/` |
| `npm run dev` | Watch mode: `tsc --watch` + auto-copy to `demo/lib/` |
| `npm run link <repo>` | Symlink a target repo to `demo/` for live testing |
| `npm run studio` | Launch DemoFlow Studio at http://localhost:3274 |

## Examples

See the [examples/](examples/) directory for a complete working setup.
