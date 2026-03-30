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
6. Select the macOS frame style (default)
7. [pause: 2s]
8. Switch to Windows XP frame — preview updates live
9. [pause: 2s]
10. Switch to Windows 98 frame
11. [pause: 2s]
12. Switch to VS Code frame
13. [pause: 2s]
14. Switch back to macOS frame
15. Change the window title to "My App Demo"
16. [pause: 1s]
17. Click "Save & Render MP4"
18. Wait for render to complete (status bar shows success)
19. [pause: 3s]
