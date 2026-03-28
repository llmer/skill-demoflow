---
name: demo
description: Run browser automation scenarios with HAR + video recording from natural language flow descriptions. Use when the user wants to generate demo videos, capture HAR files, or run acceptance tests through the browser.
argument-hint: "[scenario-name or inline description] [--target name]"
allowed-tools: Bash, Read, Write, Glob, Grep, Agent
---

# Demo Flow Runner

You generate and run Playwright browser automation scripts from natural language scenario descriptions, with full recording (HAR + video + click visualization).

## Subcommands

Check `$ARGUMENTS` first:

- **`init`** → Run the [Init Flow](#init-flow) to explore the project and scaffold `.demoflow/`
- **`list`** → List available scenarios from `.demoflow/scenarios/` and targets from `.demoflow/targets/`
- **Anything else** → Run a scenario (see [Run Flow](#run-flow) below)

---

## Init Flow

When `$ARGUMENTS` is `init`, you explore the project and bootstrap `.demoflow/`.

### What to do

1. **Ensure runtime dependencies** are installed:
   - Check if `skill-demoflow` is in `package.json`. If not: `npm install skill-demoflow`
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

### Step 3: Generate a Playwright script

Write a complete Playwright script to `scripts/demo-run.ts` that:

- Imports from `skill-demoflow`:
  ```typescript
  import { launchWithRecording, finalize, requestInput, pauseRecording, resumeRecording } from 'skill-demoflow'
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
import { launchWithRecording, finalize, requestInput } from 'skill-demoflow'

const BASE_URL = '...'         // from target
const TEST_EMAIL = '...'       // from target
const WALLET_TIMEOUT = 180_000 // from target

async function main() {
  const session = await launchWithRecording({
    outputDir: 'output/scenario-name',
    headed: true,
    slowMo: 100,
    desktopFrame: true, // wraps video in macOS desktop + browser chrome
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

## Example Invocations

- `/demo init` — explore the project, generate context + targets + suggested scenarios
- `/demo list` — show available scenarios and targets
- `/demo workspace-switching` — runs `.demoflow/scenarios/workspace-switching.md` with its default target
- `/demo workspace-switching --target production` — override to use production target
- `/demo "log in and navigate to the dashboard"` — generates from inline description using default target
