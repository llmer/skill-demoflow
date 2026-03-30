# Local Development

DemoFlow Studio running locally via `npm run studio`.

## Connection
- url: http://localhost:3274
- No auth required

## Prerequisites
- Run `npm run build` first to compile TypeScript
- Run `npm run studio` to start the server
- At least one recording in `output/` (run a demo scenario first)

## Behavior
- headed: true
- slow_mo: 150
- action_timeout: 15s
- page_load_timeout: 10s

## Notes
- Studio is a local-only dev tool, no credentials needed
- If no recordings exist, the Studio shows an empty state
- Frame preview updates live; rendering requires ffmpeg
