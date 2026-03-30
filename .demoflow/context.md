# App Context

skill-demoflow is a Claude Code skill that generates demo videos from natural language scenarios. It has a web UI called DemoFlow Studio for adjusting frame styles on existing recordings.

## DemoFlow Studio (http://localhost:3274)

The Studio is a single-page web app served by a Node.js HTTP server.

### Layout

- **Top bar**: "DemoFlow Studio" title + recording dropdown `<select id="recording-select">`
- **Preview pane** (left): Large iframe showing the framed video preview
- **Controls panel** (right, 280px sidebar): All adjustment controls

### Controls Panel

- **Frame Style**: Radio group with options: macOS, XP, 98, Terminal, VS Code, iPhone, None
  - Selectors: `input[name="style"][value="macos"]`, etc.
- **Window Title**: Text input `#title-input`
- **Address Bar URL**: Text input `#url-input` (visible for XP/98 styles only)
- **Components**: Checkboxes for Traffic Lights, Address Bar, Status Bar, Taskbar
  - `#tl-check`, `#ab-check`, `#sb-check`, `#tb-check`
  - Visibility depends on frame style (e.g., taskbar only for Windows styles)
- **Component Text**: Inputs for title suffix, status text, clock text (XP/98 only)
  - `#title-suffix-input`, `#status-text-input`, `#clock-text-input`
- **Desktop Resolution**: Select dropdown `#resolution-select`
  - Landscape: 1920x1080, 2560x1440, 1440x900, 1280x800
  - Portrait (iOS): 1080x1920, 750x1334, 1290x2796
- **Window Offset Y**: Range slider `#offset-slider` (-200 to 200)
- **Wallpaper Color**: Color picker `#wallpaper-color` + "Custom" checkbox `#wallpaper-custom`
- **Render Button**: `button#render-btn` "Save & Render MP4"
- **Status bar**: `#status` shows render progress/result

### Behavior

- Selecting a recording loads its manifest and populates controls
- Changing any control updates the live iframe preview (debounced for text inputs)
- "Save & Render MP4" POSTs to `/api/recordings/{name}/render` and shows the output path
- Preview iframe scales to fit the pane using CSS transform
- Empty state shown when no recordings exist

### API Endpoints

- `GET /api/recordings` — list recording directories
- `GET /api/recordings/{name}/manifest` — get capture manifest
- `POST /api/recordings/{name}/render` — re-render with new options
- `GET /preview/{name}?style=&title=&...` — live frame preview HTML
- `GET /files/{name}/{file}` — serve recording files (video, HAR, screenshots)

## CLI Entry Points

- `npm run studio` or `npx tsx src/studio.ts` — launches Studio
- `npm run build` — compiles TypeScript to dist/ and copies to demo/lib/
- `npm run dev` — watch mode with auto-copy

## Output Structure

Recordings live in `output/{scenario-name}/`:
- `recording.webm` — raw video
- `recording.mp4` — framed video
- `recording.har` — network capture
- `manifest.json` — metadata (git hash, viewport, pauses, render options)

## Notes

- Studio requires at least one recording in `output/` to be useful
- No auth required — local dev tool
- Frame preview updates instantly; render takes a few seconds (ffmpeg)
