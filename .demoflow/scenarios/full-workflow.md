# Full Workflow Demo

End-to-end demonstration: create a sample recording, then open DemoFlow Studio to adjust frame styles and render to MP4.

## Config
target: local
capture: video
viewport: 1280x720

## Steps

### Phase 1: Create a sample recording
1. Record a quick browser session visiting a sample page to generate content in `output/sample-app/`
2. This creates the WebM, HAR, and manifest needed for Studio

### Phase 2: DemoFlow Studio
3. Start Studio server (http://localhost:3274)
4. Open Studio in the browser
5. The recording dropdown should show "sample-app"
6. The Frame section is expanded — macOS style is active by default
7. [pause: 2s]
8. Click the "Windows XP" option in the style list — preview updates live
9. [pause: 2s]
10. Click the "Windows 98" option in the style list
11. [pause: 2s]
12. Click the "VS Code" option in the style list
13. [pause: 2s]
14. Click the "macOS" option to switch back
15. Change the window title to "My App Demo"
16. [pause: 1s]
17. Click the amber "Render MP4" button in the topbar
18. Wait for render to complete (status bar shows green success message)
19. [pause: 3s]
