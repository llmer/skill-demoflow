# Cinematic DemoFlow Showcase

Three-act demo showcasing DemoFlow's capabilities: auto-zoom, frame styles, annotations, speed control, and GIF export.

## Config
target: local
capture: video
viewport: 1280x720

## Steps

### Act 1: The Canvas
1. Record Hacker News with auto-zoom enabled (depth 3, 1200ms duration)
2. Click story links to trigger auto-zoom effect
3. Output: `output/cinematic-canvas/`

### Act 2: The Gallery
4. Start DemoFlow Studio
5. Select the Act 1 recording
6. Click through frame styles in the vertical style list: macOS, XP, 98, VS Code, Terminal, iPhone, None
7. Use speed: 0.5 on transitions and annotations labeling each style
8. Expand the Appearance section to customize title and wallpaper color
9. Click the amber Render button in the topbar
10. Output: `output/cinematic-gallery/`

### Act 3: The Polish
11. Open Studio with the Act 1 recording
12. Expand the Effects section, enable auto-zoom and increase depth
13. Expand the Export section, switch format toggle to GIF
14. Click Render to export with effects
15. Output: `output/cinematic-polish/`
