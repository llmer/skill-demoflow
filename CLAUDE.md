# Development

## Structure

```
src/          → TypeScript source
dist/         → Compiled JS (.gitignored)
demo/lib/     → Compiled JS copied here (committed, ships with skill)
demo/SKILL.md → Skill definition (read by Claude Code at runtime)
```

## Commands

- `npm run build` — one-shot compile + copy to `demo/lib/`
- `npm run dev` — watch mode: `tsc --watch` + auto-copy to `demo/lib/`
- `npm run link <repo> [repo ...]` — symlink target repos to `demo/` for live testing
- `npm run studio` — launch DemoFlow Studio at http://localhost:3274

## Testing in local repos

To test changes against a repo that already has `.demoflow/` initialized:

```bash
# 1. Build once (or start dev watcher)
npm run build

# 2. Link the target repo (one-time per repo)
npm run link ~/src/my-app

# 3. Start dev watcher for ongoing changes
npm run dev
```

After linking, edits to `src/` auto-compile to `demo/lib/`, and the target repo reads them via symlink. Edits to `demo/SKILL.md` are instant.

**Caveat:** `npx skills add` in the target repo overwrites symlinks with copies. Re-run `npm run link` after any `skills add`.
