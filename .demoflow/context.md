# App Context

llmer-demoflow is a Claude Code skill that generates demo videos from natural language scenarios. It has a web UI called DemoFlow Studio for adjusting frame styles on existing recordings.

## DemoFlow Studio (http://localhost:3274)

The Studio is a single-page web app served by a Node.js HTTP server. Industrial/utilitarian aesthetic with amber accents, JetBrains Mono labels, grain texture overlay.

### Layout

- **Top bar** (48px): "DemoFlow Studio" title + `/` separator + recording dropdown + keyboard hint + amber "Render MP4" button
- **Preview pane** (left, flex:1): Iframe showing framed video preview, scales to fill available space
- **Controls sidebar** (right, 260px): Collapsible sections with chevron disclosure triangles
- **Status bar** (bottom, full-width): Shows recording info or render progress

### Controls Sidebar — Collapsible Sections

#### Frame (expanded by default)
- **Style list**: Vertical radio list with amber left-border accent on active item
  - Options: macOS (Sonoma), Windows XP, Windows 98, Terminal (macOS), VS Code, iPhone (iOS), None (Raw)
  - Each option is a `.style-option` div with `data-style` attribute
- **Title**: Text input `#title-input`
- **Resolution**: Select dropdown `#resolution-select`

#### Appearance (collapsed by default)
- **Address Bar URL**: Text input `#url-input` (visible for XP/98 styles only)
- **Components**: Checkboxes for Traffic Lights, Address Bar, Status Bar, Taskbar
  - `#tl-check`, `#ab-check`, `#sb-check`, `#tb-check`
  - Visibility depends on frame style
- **Component Text**: Inputs for title suffix, status text, clock text (XP/98 only)
- **Window Offset**: Range slider `#offset-slider` (-200 to 200)
- **Wallpaper**: Color picker `#wallpaper-color` — auto-activates on pick, "Reset" button to revert

#### Effects (collapsed by default)
- **Zoom Regions**: Read-only list (auto-detected), enable checkbox, depth slider

#### Export (collapsed by default)
- **Format**: Segmented toggle MP4/GIF
- **GIF Options**: FPS and size selects (visible when GIF selected)

### Key Selectors

- Recording dropdown: `#recording-select`
- Render button: `button#render-btn` (in topbar, amber background)
- Preview iframe: `#preview-frame`
- Status bar: `#status`
- Sections: `#section-frame`, `#section-appearance`, `#section-effects`, `#section-export`
- Section headers: `.section-header` (click to toggle)
- Style options: `.style-option[data-style="macos"]`, etc.

### Keyboard Shortcuts

- `Cmd+Enter` — Render
- `1-7` — Quick frame style selection
- `Escape` — Collapse all sections

### Behavior

- Selecting a recording loads its manifest and populates controls
- Changing any control updates the live iframe preview (debounced for text inputs)
- Render button POSTs to `/api/recordings/{name}/render` and shows output path in status bar
- Preview iframe uses absolute positioning + CSS transform scale (no cap — fills available space)
- Only Frame section is expanded by default; others collapse to reduce cognitive load

### API Endpoints

- `GET /api/recordings` — list recording directories
- `GET /api/recordings/{name}/manifest` — get capture manifest
- `POST /api/recordings/{name}/render` — re-render with new options
- `GET /preview/{name}?style=&title=&...` — live frame preview HTML
- `GET /files/{name}/{file}` — serve recording files

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
