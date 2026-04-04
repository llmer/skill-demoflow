#!/bin/bash
# Link target repos to this skill's demo/ directory for live development.
#
# Usage:
#   ./scripts/link.sh ~/src/my-app [~/src/other-app ...]
#
# Replaces the copied .agents/skills/demo/ in each target repo with a symlink
# back to this repo's demo/ directory. After linking, edits to demo/SKILL.md
# and demo/lib/ are immediately visible in the target repo.
#
# Note: Running `npx skills add` in the target repo will overwrite the symlink
# with a copy. Re-run this script after any `skills add`.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)/demo"

if [ $# -eq 0 ]; then
  echo "Usage: $0 <target-repo> [target-repo ...]"
  echo ""
  echo "Links target repos' .agents/skills/demo/ to: $SKILL_DIR"
  echo "This enables live editing without re-running 'npx skills add'."
  exit 1
fi

for TARGET in "$@"; do
  TARGET="$(cd "$TARGET" && pwd)"
  AGENTS_DIR="$TARGET/.agents/skills"
  CLAUDE_DIR="$TARGET/.claude/skills"

  # Ensure the target has a skills directory
  if [ ! -d "$AGENTS_DIR" ] && [ ! -d "$CLAUDE_DIR" ]; then
    echo "SKIP: $TARGET -- no .agents/skills/ or .claude/skills/ found"
    echo "      Run 'npx skills add llmer/skill-demoflow' in that repo first."
    continue
  fi

  # Handle .agents/skills/demo (universal install location)
  if [ -d "$AGENTS_DIR" ]; then
    rm -rf "$AGENTS_DIR/demo"
    ln -sf "$SKILL_DIR" "$AGENTS_DIR/demo"
    echo "LINK: $AGENTS_DIR/demo -> $SKILL_DIR"
  fi

  # If .claude/skills/demo exists but isn't already a symlink chain to .agents/,
  # replace it with a direct symlink too
  if [ -d "$CLAUDE_DIR" ] && [ ! -L "$CLAUDE_DIR/demo" ]; then
    rm -rf "$CLAUDE_DIR/demo"
    ln -sf "$SKILL_DIR" "$CLAUDE_DIR/demo"
    echo "LINK: $CLAUDE_DIR/demo -> $SKILL_DIR"
  elif [ -L "$CLAUDE_DIR/demo" ]; then
    echo "  OK: $CLAUDE_DIR/demo already symlinked (resolves via .agents/)"
  fi

  # Remove stale generated scripts so /demo regenerates with new lib API
  STALE=$(find "$TARGET/scripts" -name 'demo-*.ts' -o -name 'demo-run.ts' 2>/dev/null)
  if [ -n "$STALE" ]; then
    echo "$STALE" | xargs rm -f
    echo "CLEAN: removed stale demo scripts from $TARGET/scripts/"
  fi
done

echo ""
echo "Done. Changes to $SKILL_DIR are now live in linked repos."
