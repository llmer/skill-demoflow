---
name: demo
description: Run browser or terminal automation scenarios with video recording from natural language flow descriptions. Use when the user wants to generate demo videos, capture HAR files, record CLI tool demos, or run acceptance tests.
argument-hint: "[scenario-name or inline description] [--target name]"
allowed-tools: Bash, Read, Write, Glob, Grep, Agent
---

# Demo Flow Runner

You generate and run Playwright automation scripts from natural language scenario descriptions, with full recording (video + click/keystroke visualization). Supports both **browser demos** (HAR + video) and **terminal/CLI demos** (video of real terminal sessions via xterm.js + node-pty).

## Preamble (run first)

```bash
# Check skill lib
if [ -f ".claude/skills/demo/lib/index.js" ]; then
  echo "SKILL_LIB: ready"
else
  echo "SKILL_LIB: missing"
fi

# Check Playwright
if npx playwright --version >/dev/null 2>&1; then
  echo "PLAYWRIGHT: $(npx playwright --version 2>&1)"
else
  echo "PLAYWRIGHT: missing"
fi

# Check Chromium
if [ -d "$(npx playwright install --dry-run chromium 2>/dev/null | head -1)" ] || npx playwright install --dry-run chromium 2>&1 | grep -q "is already installed"; then
  echo "CHROMIUM: ready"
else
  echo "CHROMIUM: missing"
fi

# Check ffmpeg (required for video)
if command -v ffmpeg >/dev/null 2>&1; then
  echo "FFMPEG: $(ffmpeg -version 2>&1 | head -1)"
else
  echo "FFMPEG: missing (video conversion will fail)"
fi

# Check node-pty (required for terminal demos, optional otherwise)
if node -e "require('node-pty')" 2>/dev/null; then
  echo "NODE_PTY: ready"
else
  echo "NODE_PTY: missing (install with 'npm install node-pty' for terminal demos)"
fi

# Check for .demoflow
if [ -d ".demoflow" ]; then
  echo "DEMOFLOW: initialized"
  ls .demoflow/scenarios/ 2>/dev/null | head -10
else
  echo "DEMOFLOW: not initialized (run /demo init)"
fi
```

If `SKILL_LIB` is `missing`: the skill was not installed correctly. Tell the user to run `npx skills add llmer/skill-demoflow`.

If `PLAYWRIGHT` is `missing`: run `npm install --save-dev @playwright/test`.

If `CHROMIUM` is `missing`: run `npx playwright install chromium`.

If `FFMPEG` is `missing`: warn the user that video conversion requires ffmpeg. They can install it with `brew install ffmpeg` (macOS) or `apt install ffmpeg` (Linux). Recording will still work but MP4 output will be skipped.

If `NODE_PTY` is `missing` and the user requests a terminal demo: run `npm install node-pty`. This is only required for terminal/CLI demos, not browser demos.

## Subcommands

Check `$ARGUMENTS` first:

- **`init`** → Run the [Init Flow](#init-flow) to explore the project and scaffold `.demoflow/`
- **`list`** → List available scenarios from `.demoflow/scenarios/` and targets from `.demoflow/targets/`
- **`studio`** → Launch the DemoFlow Studio web UI for adjusting frame options on existing recordings: `npx tsx src/studio.ts` (or `npm run studio` if built). Opens at http://localhost:3274
- **`render [scenario-name] [--style macos|windows-xp|windows-98|macos-terminal|vscode|none] [--title "..."]`** → Re-render an existing capture without re-recording. Only works if `output/{name}/recording.webm` exists.
- **Anything else** → Run a scenario (see [Run Flow](#run-flow) below)

---

## Init Flow

When `$ARGUMENTS` is `init`, you explore the project and bootstrap `.demoflow/`.

### What to do

1. **Ensure runtime dependencies** are installed:
   - Verify the skill lib exists: `.claude/skills/demo/lib/index.js` (installed by `skills add`)
   - Check if `@playwright/test` is in `package.json`. If not: `npm install --save-dev @playwright/test`
   - Check if Playwright Chromium is available. If not: `npx playwright install chromium`

2. **Explore the codebase** using the Explore agent:
   - Find all routes/pages (look for `app/` or `pages/` directory structures, route files, page components)
   - Identify the auth flow (login, signup, verify, OAuth — look for auth pages, middleware, session handling)
   - Find key interactive components (forms, wizards, modals, dialogs)
   - Detect the framework (Next.js, Remix, SvelteKit, etc.) and UI library (shadcn, MUI, etc.)
   - Look for existing environment config (.env.example, .env.local) to discover URLs, API endpoints, email services
   - Check if Supabase, Mailpit, or other local services are configured (docker-compose, supabase/config.toml)

3. **Generate `.demoflow/context.md`** from what you discover:
   - Auth flow (login page selectors, OTP input, submit buttons)
   - Key pages and their interactive elements
   - Navigation patterns (sidebar, breadcrumbs, tabs, header links)
   - Modals/dialogs that might appear during flows
   - Rate limits or gotchas you spot in the code
   - Keep it concise — focus on what a Playwright script would need to know

4. **Generate target configs** in `.demoflow/targets/`:
   - **`local.md`** — detect the dev server URL (from package.json scripts, .env), and if there's a local email server (Mailpit/Inbucket), configure auto-OTP
   - **`production.md`** (if a prod URL is discoverable) — use prompt strategy for OTP
   - Ask the user to confirm URLs and credentials you can't find

5. **Suggest 3-5 scenarios** based on the flows you discover:
   - The primary happy path (signup → first action → core feature)
   - A CRUD flow (create, read, update, delete of the main entity)
   - Navigation coverage (visit every major section)
   - An edge case or error flow if obvious
   - Present these to the user and ask which to generate. Write the selected ones to `.demoflow/scenarios/`

6. **Create the directory structure** if it doesn't exist:
   ```
   .demoflow/
   ├── context.md
   ├── targets/
   │   ├── local.md
   │   └── production.md
   └── scenarios/
       └── (suggested scenarios)
   ```

7. **Ensure `scripts/` is excluded from the build**:
   - Read `tsconfig.json` and check if `scripts` is in the `exclude` array
   - If not, add `"scripts"` to the `exclude` array — Playwright imports are Node-only and will break framework builds (Next.js, Remix, etc.) if included in the compilation scope
   - If there's no `exclude` array, create one with `["scripts"]`

8. **Report what was created** and suggest the user review context.md for accuracy.

---

## Run Flow

### Step 1: Resolve the scenario

If `$ARGUMENTS` matches a file in `.demoflow/scenarios/` (by name, with or without `.md`), read that file. Otherwise treat `$ARGUMENTS` as an inline flow description.

If `--target <name>` is present in arguments, use that target. Otherwise use the `target:` field from the scenario's `## Config` section.

### Step 2: Read target + context

1. Read `.demoflow/targets/{target-name}.md` — this is the DUT (Device Under Test) config that tells you the base URL, how to handle auth/OTP, timeouts, and environment-specific behavior
2. Read `.demoflow/context.md` if it exists — app-specific UI patterns, selectors, navigation hints
3. Read the scenario file (or use the inline description)
4. If needed, read relevant source files to understand selectors and page structure

### Step 2b: Check for valid existing capture

Before generating and running a new script, check if a valid capture already exists:

```typescript
import { isCaptureValid, render } from '../.claude/skills/demo/lib/index.js'

if (isCaptureValid('output/scenario-name', { scenarioPath, targetPath })) {
  // Skip re-recording — just re-render with current options
  const result = await render('output/scenario-name', { frameStyle: 'macos' })
  console.log('Re-rendered from cache:', result.mp4Path)
} else {
  // Capture is stale — run the full recording flow below
}
```

If `isCaptureValid()` returns true, skip to rendering. This avoids expensive browser replay when only frame options changed.

### Step 3: Generate a Playwright script

Write a complete Playwright script to `scripts/demo-run.ts` that:

- Imports from the skill lib (path relative to `scripts/`):
  ```typescript
  import { launchWithRecording, finalize, requestInput, pauseRecording, resumeRecording, getLibHash } from '../.claude/skills/demo/lib/index.js'
  ```
- Uses the **target config** to set:
  - `BASE_URL` from the target's Connection section
  - `TEST_EMAIL` from the target's Connection section
  - OTP strategy: if target says `strategy: prompt`, use `requestInput()`. If target provides Mailpit API details, auto-fetch the OTP.
  - Timeouts from the target's Behavior section
- Launches a headed browser with HAR + video recording
- Executes every step from the scenario
- Takes error screenshots on failure
- Calls `finalize()` in a finally block to ensure recordings are saved

**Output directory**: `output/{scenario-name}/`

**Key pattern:**

```typescript
import { launchWithRecording, finalize, requestInput, isCaptureValid, render, getLibHash } from '../.claude/skills/demo/lib/index.js'

const BASE_URL = '...'         // from target
const TEST_EMAIL = '...'       // from target
const WALLET_TIMEOUT = 180_000 // from target
const SCENARIO_PATH = '.demoflow/scenarios/scenario-name.md'
const TARGET_PATH = '.demoflow/targets/local.md'

async function main() {
  // Check if we can skip re-recording
  if (isCaptureValid('output/scenario-name', { scenarioPath: SCENARIO_PATH, targetPath: TARGET_PATH })) {
    console.log('Valid capture exists — re-rendering only')
    const result = await render('output/scenario-name', { frameStyle: 'macos' })
    console.log('Video:', result.mp4Path)
    return
  }

  const session = await launchWithRecording({
    outputDir: 'output/scenario-name',
    headed: true,
    slowMo: 100,
    desktopFrame: true,
    scenarioPath: SCENARIO_PATH,
    targetPath: TARGET_PATH,
  })
  const { page } = session

  try {
    // Steps here, using target-specific values

    // When waiting for user input, pass session to auto-trim idle time from video:
    const otp = await requestInput(session.outputDir, 'Enter the OTP code', { session })
  } catch (err) {
    await page.screenshot({ path: 'output/scenario-name/error.png' })
    throw err
  } finally {
    const result = await finalize(session)
    console.log('HAR:', result.harPath)
    console.log('Video:', result.mp4Path)
  }
}

main()
```

### Step 4: Run the script

1. Run the script in the background: `npx tsx scripts/demo-run.ts`
2. Monitor for the input signal file: poll `output/{name}/.waiting-for-input`
3. When the signal appears, read its contents (the prompt message) and ask the user for the value
4. When the user responds, write their answer to `output/{name}/.input-value`
5. The script will pick it up and continue automatically
6. Wait for the script to complete

### Step 5: Report results

Tell the user:
- Target used (local/production/etc.)
- HAR file path
- Video file path (MP4)
- Any errors that occurred
- Summary of what was captured

### Step 6: Offer adjustments

After reporting results, ask the user if they'd like to adjust the video. Present these options:

- **Change frame style** — re-render with `macos`, `windows-xp`, `windows-98`, `macos-terminal`, `vscode`, or `none` (raw viewport)
- **Change title** — update the text shown in the frame's titlebar/tab
- **Open Studio** — launch the DemoFlow Studio web UI at http://localhost:3274 for live preview and adjustments
- **Keep as-is** — done

If the user picks a re-render option, call `render()` on the existing capture (no re-recording needed):

```typescript
import { render } from '../.claude/skills/demo/lib/index.js'

const result = await render('output/{scenario-name}', {
  frameStyle: 'windows-xp',  // or 'macos', 'none'
  title: 'Custom Title',     // optional
})
console.log('Updated video:', result.mp4Path)
```

If the user picks Studio, run: `node -e "import('./.claude/skills/demo/lib/studio.js').then(m => m.startStudio())"`

After any adjustment, report the updated file path and offer again — the user may want to try multiple styles.

---

## Terminal Demo Flow

For CLI-based product demos (agentic coding tools, CLIs, terminal applications). Uses xterm.js rendered in Playwright connected to a real PTY via node-pty.

### Detecting terminal scenarios

A scenario is a terminal demo if:
- Its `## Config` section includes `type: terminal`
- The scenario only describes CLI commands (no URLs, no browser navigation)
- The user explicitly asks for a terminal/CLI demo

### Terminal scenario format

```markdown
# Claude Code Refactoring Demo

## Config
type: terminal
shell: /bin/zsh
cwd: ~/projects/demo-app
frame: macos-terminal
typing_speed: 40ms
theme: dark-plus

## Steps

[require: node npx]
[hide]
cd ~/projects/demo-app && git checkout demo-branch
[show]

1. Show the project: `ls -la`
2. [pause: 2s]
3. Show the code: `cat server.ts`
4. [pause: 3s]
5. Run Claude Code: `npx claude "refactor server.ts to use async/await"`
6. [wait-for: /✓|Done/ timeout: 120s]
7. Show result: `cat server.ts`
8. [pause: 3s]
9. Run tests: `npm test`
10. [wait-for: "passing" timeout: 30s]
```

### Terminal directives

| Directive | Generated Code |
|-----------|---------------|
| `` `command` `` | `await session.exec('command')` |
| `[type: "text"]` | `await session.type('text')` |
| `[type@100ms: "text"]` | `await session.type('text', { delay: 100 })` |
| `[enter]` | `await session.press('Enter')` |
| `[tab]` | `await session.press('Tab')` |
| `[ctrl+c]` | `await session.press('Ctrl+C')` |
| `[pause: 3s]` | `await new Promise(r => setTimeout(r, 3000))` |
| `[wait-for: /pattern/ timeout: 30s]` | `await session.waitForOutput(/pattern/, { timeout: 30000 })` |
| `[wait-for-prompt timeout: 10s]` | `await session.waitForPrompt({ timeout: 10000 })` |
| `[hide]` / `[show]` | `pauseRecording(session)` / `resumeRecording(session)` (hides setup from video) |
| `[require: node npm]` | Check dependencies exist before running |
| `[env: KEY=value]` | Set via `TerminalRecordingOptions.env` |
| `[clear]` | `await session.clear()` |
| `[screenshot: name]` | `await page.screenshot({ path: ... })` |
| `[prompt: "message"]` | `await requestInput(outputDir, 'message', { session })` |

### Terminal script pattern

```typescript
import { launchTerminal, finalize, pauseRecording, resumeRecording } from '../.claude/skills/demo/lib/index.js'

const session = await launchTerminal({
  outputDir: 'output/cli-demo',
  shell: '/bin/zsh',
  cwd: '/path/to/project',
  desktopFrame: { style: 'macos-terminal', title: 'Terminal' },
  theme: 'dark-plus',
  typingSpeed: 50,
})

try {
  // [hide] — setup commands hidden from video
  pauseRecording(session)
  await session.exec('cd ~/projects/demo-app')
  resumeRecording(session)

  // Visible demo steps
  await session.exec('ls -la')
  await new Promise(r => setTimeout(r, 2000))
  await session.exec('npx claude "refactor server.ts"')
  await session.waitForOutput(/Done|✓/, { timeout: 120_000 })
  await session.exec('cat server.ts')
  await new Promise(r => setTimeout(r, 3000))
} catch (err) {
  await session.page.screenshot({ path: 'output/cli-demo/error.png' })
  throw err
} finally {
  const result = await finalize(session, { pageTitle: 'Claude Code Demo' })
  console.log('Video:', result.mp4Path)
}
```

### `launchTerminal(options) → TerminalSession`

Launch a terminal session with Playwright recording: xterm.js in browser connected to real PTY.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outputDir` | `string` | *required* | Output directory for video, screenshots. |
| `viewport` | `{ width, height }` | `960x600` | Terminal canvas pixel size. |
| `headed` | `boolean` | `true` | Show the browser window. |
| `desktopFrame` | `boolean \| DesktopFrameOptions` | `true` (macos-terminal) | Desktop frame style. |
| `shell` | `string` | `$SHELL` or `/bin/zsh` | Shell to spawn. |
| `cwd` | `string` | `process.cwd()` | Working directory for PTY. |
| `env` | `Record<string, string>` | `{}` | Extra environment variables. |
| `theme` | `string \| TerminalTheme` | `'dark-plus'` | Color theme: `'dark-plus'`, `'dracula'`, `'monokai'`, or custom object. |
| `fontSize` | `number` | `14` | Font size in px. |
| `fontFamily` | `string` | `'Menlo, Monaco, monospace'` | Font family. |
| `typingSpeed` | `number` | `50` | Default ms delay per character. |

### TerminalSession methods

| Method | Description |
|--------|-------------|
| `type(text, { delay? })` | Type text character-by-character with visual delay. |
| `press(key)` | Send keystroke: `'Enter'`, `'Tab'`, `'Ctrl+C'`, `'Up'`, `'Down'`, etc. |
| `exec(command, { timeout? })` | Type command + Enter + wait for prompt to return. |
| `waitForOutput(pattern, { timeout? })` | Wait for regex/string to appear in terminal buffer. Default timeout: 30s. |
| `waitForPrompt({ timeout? })` | Wait for shell prompt to return (command finished). Default timeout: 30s. |
| `clear()` | Clear the terminal screen. |

The session also has `browser`, `context`, `page`, `outputDir` like `RecordingSession`. Use `pauseRecording(session)` / `resumeRecording(session)` for pause trimming. Pass to `finalize(session, { pageTitle: '...' })` at the end.

---

## Recording Library Reference

All functions are exported from the skill lib at `.claude/skills/demo/lib/index.js`.

### `launchWithRecording(options) → RecordingSession`

Launch a Chromium browser with full recording: HAR capture, video, and click visualization.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outputDir` | `string` | *required* | Output directory for HAR, video, screenshots. Created if missing. |
| `viewport` | `{ width, height }` | `1280x720` | Browser viewport size. Also sets video resolution. |
| `headed` | `boolean` | `true` | Show the browser window. Set `false` for CI. |
| `slowMo` | `number` | `100` | Delay between actions in ms. Higher = more readable video. |
| `ignoreHTTPSErrors` | `boolean` | `true` | Bypass HTTPS certificate errors (useful for local dev). |
| `desktopFrame` | `boolean \| DesktopFrameOptions` | `true` | Wrap video in desktop chrome. See [Desktop Frame](#desktop-frame). |

Returns a `RecordingSession` with `browser`, `context`, `page`, and `outputDir`.

### `finalize(session, overrides?) → RecordingResult`

Close the browser, save a capture manifest, convert video to MP4, and apply desktop frame compositing. **Must be called in a finally block** — skipping this loses the HAR and video.

Optional `overrides`: `{ pageTitle?: string, pageUrl?: string }` — use to set meaningful metadata for terminal sessions (which otherwise show `localhost:XXXXX`).

Returns:
| Field | Type | Description |
|-------|------|-------------|
| `harPath` | `string` | Path to the HAR file (always present) |
| `mp4Path` | `string \| null` | Path to MP4 video (`null` if ffmpeg missing) |
| `webmPath` | `string \| null` | Path to raw WebM video |

Pipeline: close browser → rename WebM → **save manifest.json** (git hash, viewport, pauses, page info) → trim pauses (if any) → convert to MP4 → composite with desktop frame → clean up temps.

### `render(outputDir, options?) → RenderResult`

**Re-render** an existing capture to MP4 without re-recording. Reads viewport and pause data from `manifest.json`. Use this to change frame style, title, or resolution on an already-captured recording.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `frameStyle` | `'macos' \| 'windows-xp' \| 'windows-98' \| 'macos-terminal' \| 'vscode' \| 'none'` | `'macos'` | Frame style. `'none'` produces raw viewport video. |
| `title` | `string` | manifest page title | Window title / tab text. |
| `url` | `string` | manifest page URL | Address bar URL (XP style). |
| `resolution` | `{ width, height }` | `1920x1080` | Desktop resolution for the frame. |

Returns `{ mp4Path: string | null }`.

### `isCaptureValid(outputDir, options?) → boolean`

Check whether a previous capture can be reused. Returns `true` if:
- `manifest.json` and `recording.webm` exist in `outputDir`
- Current git HEAD matches the manifest's commit hash
- Working tree is clean (not dirty)
- Skill lib hash matches (detects lib code changes across linked repos)
- Scenario/target file hashes match (if paths provided)

| Option | Type | Description |
|--------|------|-------------|
| `scenarioPath` | `string` | Path to scenario file — hash is compared to manifest. |
| `targetPath` | `string` | Path to target file — hash is compared to manifest. |

Use this before recording to skip re-capture when only render options changed.

### `requestInput(outputDir, message, options?) → string`

Pause the script and wait for external input (OTP codes, 2FA tokens, manual confirmation).

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `session` | `RecordingSession` | — | If provided, video is auto-paused while waiting and idle time is trimmed from final video. |
| `timeoutMs` | `number` | `300000` | Max wait time in ms before throwing. |

Writes `.waiting-for-input` signal file. Polls for `.input-value` response file. Auto-cleans both files after input is received.

### `pauseRecording(session)` / `resumeRecording(session)`

Manually mark idle periods. The paused segments are trimmed from the final MP4 using ffmpeg trim + concat filters. Use when you have a known wait that isn't handled by `requestInput`.

```typescript
pauseRecording(session)
await someSlowOperation()
resumeRecording(session)
```

### `provideInput(outputDir, value)`

Write input from the skill/CLI side. Called by the skill runner after getting the value from the user.

### `checkWaiting(outputDir) → string | null`

Check if a script is waiting for input. Returns the prompt message or `null`.

---

## Desktop Frame

Videos are composited onto a desktop OS frame (titlebar + window chrome + wallpaper background) for polished output.

### Options

Pass to `launchWithRecording({ desktopFrame: ... })`:

| Value | Behavior |
|-------|----------|
| `true` (default) | macOS Sonoma style frame |
| `false` | No frame — raw viewport video |
| `{ style: 'macos' }` | macOS Sonoma with traffic lights and tab |
| `{ style: 'windows-xp' }` | Windows XP with IE chrome, taskbar, Start button (uses XP.css) |
| `{ style: 'windows-98' }` | Windows 98 with classic grey chrome (uses 98.css) |
| `{ style: 'macos-terminal' }` | macOS Terminal.app style — dark titlebar, traffic lights, no address bar |
| `{ style: 'vscode' }` | VS Code integrated terminal — dark chrome, tab bar, blue status bar |
| `{ title: 'My App' }` | Override the tab/titlebar text (default: page title at finalize) |
| `{ resolution: { width: 1920, height: 1080 } }` | Desktop resolution (default: 1920x1080) |
| `{ windowOffsetY: -50 }` | Shift window up/down from center (negative = up) |
| `{ wallpaperColor: '#008080' }` | Solid wallpaper color (overrides default gradient) |

### Frame anatomy

**macOS (default):**
- Dark gradient wallpaper (purple/blue tones)
- Window vertically centered with rounded corners, drop shadow
- Titlebar: traffic lights (red/yellow/green) + centered tab with page title
- Content area: your recorded video

**Windows XP (via XP.css):**
- Blue sky + green hills wallpaper
- Authentic XP title bar with minimize/maximize/close
- Address bar with URL + Go button, status bar
- XP taskbar at bottom with green Start button + clock

**Windows 98 (via 98.css):**
- Teal wallpaper (classic default)
- Classic grey window chrome with beveled edges
- Address bar with URL, status bar
- Grey taskbar with Start button

**macOS Terminal:**
- Same purple/blue gradient wallpaper as macOS browser frame
- Dark titlebar (#3c3c3c) with traffic lights
- Centered title text (shell name or custom)
- No address bar, no tab — clean terminal window look
- Best for CLI/terminal demos

**VS Code:**
- Dark chrome (#1f1f1f) with traffic lights
- Tab bar with terminal tab icon (`>_`)
- Blue status bar with branch name + line/col info
- Best for agentic coding tool demos shown in IDE context

### How it works

1. Browser records WebM video at viewport size
2. `finalize()` converts WebM → MP4 (with pause trimming if needed)
3. Playwright renders the frame HTML to a PNG at the desktop resolution
4. ffmpeg overlays the MP4 onto the frame PNG at the calculated content position
5. Framed MP4 replaces the original

The frame is a static PNG — it doesn't change during the video. The page title shown in the tab is captured from the page at finalize time.

---

## Click Visualization

Every page automatically gets a click visualization script injected via `addInitScript`. When the user clicks anywhere:

1. A red circle (30px, semi-transparent) appears at the click point
2. The circle expands to 2.5x and fades out over 900ms
3. Removed from DOM after 1200ms

This is captured in the video recording — no post-processing needed. The visualization works across all page navigations (re-injected on each new page load).

---

## Output Files

After a successful run, `output/{scenario-name}/` contains:

| File | Description |
|------|-------------|
| `recording.har` | Full network capture (importable in Chrome DevTools Network tab) |
| `recording.mp4` | Polished video with click indicators + desktop frame |
| `recording.webm` | Raw video from Playwright (pre-conversion) |
| `manifest.json` | Capture metadata (git hash, viewport, pauses) + render options |
| `error.png` | Screenshot at point of failure (only on error) |

If desktop frame is disabled, `recording.mp4` is the raw viewport video without chrome.

---

## Target Resolution

Targets are Markdown files in `.demoflow/targets/` that describe the runtime environment. They contain:

- **Connection**: URL and email/credentials
- **Auth**: How to handle OTP (auto via Mailpit, or prompt the user)
- **Behavior**: Timeouts, headed/headless, slow motion
- **Notes**: Environment-specific gotchas

When generating the script, read the target file and use its values. If a value uses `${RUN_ID}`, generate a unique ID (e.g. `Date.now().toString(36)`).

## Handling Directives

When you see these in the scenario, handle them in the generated script:

| Directive | Generated Code |
|-----------|---------------|
| `[prompt: message]` | `const val = await requestInput(outputDir, "message", { session })` |
| `[save: var from url]` | `const var = page.url().match(/pattern/)[1]` |
| `[pause: Ns]` | `await new Promise(r => setTimeout(r, N * 1000))` |
| `[assert: condition]` | Appropriate Playwright assertion |
| `[screenshot: name]` | `await page.screenshot({ path: join(outputDir, 'name.png') })` |

## Script Generation Guidelines

- Use target-specified timeouts (don't hardcode)
- Add `await new Promise(r => setTimeout(r, 500))` between actions for video readability
- Use Playwright's text-based selectors when possible: `page.click('button:has-text("Create Trust")')`
- Handle dialogs/modals that might appear unexpectedly
- Add retry logic for flaky operations
- Always wrap the main flow in try/catch/finally with `finalize()` in finally
- Never skip `finalize()` — even on error, it saves the HAR and whatever video was captured
- Prefer `page.getByRole()` and `page.getByText()` over CSS selectors
- Use `page.waitForURL()` after navigation actions to ensure the page has loaded
- Add `page.waitForLoadState('networkidle')` before screenshots or assertions on dynamic pages

---

## Tips

1. **Always call `finalize()` in finally.** If you skip it, the HAR is lost and the browser process leaks.
2. **Pass `{ session }` to `requestInput()`.** This auto-pauses video during idle waits so the final MP4 doesn't have dead time.
3. **Use `slowMo` for video quality.** 100ms is a good default. Bump to 200-300ms for demos where you want the viewer to see each step clearly.
4. **Use `pauseRecording` / `resumeRecording` around long waits.** Any operation where the screen is static for >2s should be trimmed.
5. **Set viewport to match your target audience.** 1280x720 is a safe default. Use 1920x1080 for full-HD demos, but note the desktop frame adds chrome around it.
6. **The desktop frame title is captured at finalize.** Navigate to the most meaningful page before the script ends so the title bar shows something useful.
7. **Use `desktopFrame: { style: 'windows-xp' }` or `'windows-98'` for retro frames.** XP uses authentic XP.css styling with IE chrome and taskbar. 98 gives classic grey beveled chrome. Both use the XP.css library for faithful rendering.
8. **Use `macos-terminal` or `vscode` frame for terminal demos.** `macos-terminal` gives a clean Terminal.app look; `vscode` wraps the terminal in VS Code chrome — great for agentic coding demos.
9. **For terminal demos, pass `{ pageTitle: '...' }` to `finalize()`.** Terminal sessions run at `localhost:XXXXX` so the default page title/URL are meaningless.
8. **Check for ffmpeg before running.** Without it, you get HAR + WebM but no MP4 and no desktop frame compositing.

---

## Completion Status

When the run finishes, report status:

- **DONE** — Scenario completed. HAR + video saved. Report file paths.
- **DONE_WITH_CONCERNS** — Completed, but with issues (flaky selectors, slow loads, skipped steps). List each concern.
- **BLOCKED** — Cannot proceed. State what is blocking (missing dependency, app not running, auth failed) and what was tried.
- **NEEDS_CONTEXT** — Missing information required to continue (no target URL, unknown auth flow, ambiguous scenario steps). State exactly what you need.

---

## Example Invocations

- `/demo init` — explore the project, generate context + targets + suggested scenarios
- `/demo list` — show available scenarios and targets
- `/demo workspace-switching` — runs `.demoflow/scenarios/workspace-switching.md` with its default target
- `/demo workspace-switching --target production` — override to use production target
- `/demo "log in and navigate to the dashboard"` — generates from inline description using default target
- `/demo "run npm install then npm test and show the output"` — terminal demo from inline description (auto-detected: no URLs)
- `/demo cli-onboarding` — runs a terminal scenario from `.demoflow/scenarios/cli-onboarding.md` (detected via `type: terminal` in Config)
