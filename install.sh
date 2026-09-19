#!/usr/bin/env bash
#
# Install the "Coding + RTK" agent preset into the current user's dsh.
#
# The preset is built from YOUR OWN shipped `standard` preset (never a copy of
# somebody else's file), plus one extra plugin row and the plugin file.
#
#   ./install.sh              install or reinstall
#   ./install.sh --uninstall  remove it
#
# Overridable: PRESET_ID, PRESET_NAME, SOURCE_PRESET, DSH_HOME.
set -euo pipefail

PRESET_ID="${PRESET_ID:-standard-rtk}"
PRESET_NAME="${PRESET_NAME:-Coding + RTK}"
SOURCE_PRESET="${SOURCE_PRESET:-standard}"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$DSH_HOME_DIR/.agent-presets/$PRESET_ID"
MARKER="$DEST/.installed-by-rtk-preset"

die() { printf 'error: %s\n' "$1" >&2; exit 1; }
info() { printf '%s\n' "$1"; }

# ── locate the dsh installation ─────────────────────────────────────────────
DSH_BIN="$(command -v dsh || true)"
[ -n "$DSH_BIN" ] || die "dsh is not on PATH; install dsh first"
DSH_ROOT="$(cd "$(dirname "$(readlink -f "$DSH_BIN")")/.." && pwd)"
SHIPPED="$DSH_ROOT/node_modules/@deepseek-ai/dsh-agent-presets/presets/$SOURCE_PRESET"

# ── uninstall ───────────────────────────────────────────────────────────────
if [ "${1:-}" = "--uninstall" ]; then
  if [ ! -d "$DEST" ]; then
    info "nothing to do: $DEST does not exist"
    exit 0
  fi
  [ -f "$MARKER" ] || die "$DEST was not created by this installer; refusing to delete it"
  rm -rf "$DEST"
  info "removed $DEST"
  info "note: the rtk binary itself was left alone — see https://github.com/rtk-ai/rtk"
  exit 0
fi

[ -f "$SHIPPED/agent.cordis.yml" ] || die "cannot find the shipped '$SOURCE_PRESET' preset at $SHIPPED"
[ -f "$HERE/rtk.js" ] || die "rtk.js is missing next to this script"

# ── do not silently destroy a preset the user authored ──────────────────────
if [ -d "$DEST" ] && [ ! -f "$MARKER" ]; then
  BACKUP="$DEST.bak-$(date +%Y%m%d%H%M%S)"
  mv "$DEST" "$BACKUP"
  info "existing preset was not installed by this script — backed up to $BACKUP"
fi

# ── build the preset from the recipient's own shipped preset ────────────────
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SHIPPED/." "$DEST/"
info "built $DEST from $SHIPPED"

# Top-level YAML sequence: appending an entry is the robust way to add a row
# without depending on where a future `standard` keeps its shell section.
if ! grep -q '^- id: tool-rtk$' "$DEST/agent.cordis.yml"; then
  [ -z "$(tail -c 1 "$DEST/agent.cordis.yml")" ] || printf '\n' >> "$DEST/agent.cordis.yml"
  cat >> "$DEST/agent.cordis.yml" <<'YAML'

# ── RTK ─────────────────────────────────────────────────────────────────────
# `rtk` runs a dev command through the RTK CLI proxy, so the FILTERED output is
# what enters the model context — that is where the token saving happens.
# Like the sibling `tool-bash` row it registers into the host `tools` registry
# and consumes the host `shell` executor, so it provides no service and needs
# no isolate realm. The row names a preset-owned FILE (`./rtk.js`, resolved
# against this composition's directory); the `node_modules` directory beside
# it is only a resolution shim for the harness package that file imports.
- id: tool-rtk
  name: './rtk.js'
YAML
fi

cat > "$DEST/preset.yml" <<YAML
name: $PRESET_NAME
description: >-
  Coding agent with the rtk tool: runs dev commands through the RTK CLI proxy
  (https://github.com/rtk-ai/rtk), which filters and summarizes output BEFORE it
  enters the model context, cutting tool-output tokens 60-90% on common commands.
YAML

cp "$HERE/rtk.js" "$DEST/rtk.js"

# ── the resolution shim ─────────────────────────────────────────────────────
# A file under ~/.dsh/.agent-presets cannot reach the harness packages: Node's
# upward node_modules walk passes ~/.dsh, ~ and /, none of which hold
# @deepseek-ai/*. dsh fixes that for PACKAGE rows (it retargets their base to
# the installation) but not for the imports inside a file it loads, so the
# preset carries its own node_modules holding one symlink. Prefer the profile
# dependency farm, which dsh rebuilds on upgrade, over the version's directory.
TOOLS_TARGET=""
for candidate in \
  "$DSH_HOME_DIR/profiles/node_modules/@deepseek-ai/dsh-tools" \
  "$DSH_ROOT/node_modules/@deepseek-ai/dsh-tools"
do
  if [ -e "$candidate" ]; then TOOLS_TARGET="$candidate"; break; fi
done
[ -n "$TOOLS_TARGET" ] || die "cannot locate @deepseek-ai/dsh-tools (is dsh installed?)"

mkdir -p "$DEST/node_modules/@deepseek-ai"
ln -sfn "$TOOLS_TARGET" "$DEST/node_modules/@deepseek-ai/dsh-tools"
info "linked @deepseek-ai/dsh-tools -> $TOOLS_TARGET"

touch "$MARKER"

# ── verify: load the plugin in a fresh Node process ─────────────────────────
# This is the check that matters for portability, because a long-running dsh
# caches a failed module job for a given file URL and would keep reporting the
# old failure even after resolution is fixed.
info ""
info "verifying plugin resolution (cold Node process)..."
node -e '
const { pathToFileURL } = require("node:url");
import(pathToFileURL(process.argv[1]).href).then(
  (m) => { console.log("  ok: exports =", Object.keys(m).join(", ")); },
  (e) => { console.error("  FAILED:", e.message); process.exit(1); },
);
' "$DEST/rtk.js" || die "the plugin does not load; the preset would not mount"

if ! command -v rtk >/dev/null 2>&1; then
  info ""
  info "warning: the 'rtk' binary is not on PATH. The tool still appears, but every"
  info "         call will fail with [exit code: 127] until RTK is installed:"
  info "         curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh"
  info "         Careful: an unrelated project also ships a crate named 'rtk'. The"
  info "         right one is rtk-ai/rtk — verify with 'rtk gain'."
fi

info ""
info "Installed. Next steps:"
info "  1. In dsh, open Settings -> Agent preset."
info "  2. Start a session on \"$PRESET_NAME\"."
info "  3. Confirm the agent has the 'rtk' tool, then ask it to run 'rtk gain'."
info ""
info "The preset directory is: $DEST"
