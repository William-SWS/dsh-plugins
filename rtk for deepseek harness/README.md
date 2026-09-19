# dsh-tool-rtk

A single [Cordis](https://github.com/deepseek-ai/deepseek-harness) row that gives
a dsh agent the **`rtk`** tool — a proxy for the
[RTK](https://github.com/rtk-ai/rtk) CLI that filters and summarizes command
output **before** it enters the model context.

That is where the saving comes from: the agent runs `git status`, `cargo test`,
`rg`, `ls -la` and so on through RTK, and what reaches the context is the
compacted version — typically 60–90% fewer tool-output tokens on everyday
commands.

This plugin ships that as an **agent preset** called `standard-rtk` (the
`standard` preset + the `rtk` tool).

## Prerequisites

1. **dsh** installed.
2. **`rtk` on PATH** — install it first, otherwise the tool appears but every
   call fails with `[exit code: 127]`:

   ```sh
   curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh
   ```

   > **Mind the name.** Two projects are called `rtk`: **Rust Token Killer**
   > (`rtk-ai/rtk`, this one) and **Rust Type Kit** (`reachingforthejack/rtk`,
   > another one). If `rtk --version` works but `rtk gain` does not show the
   > savings panel, you installed the wrong one — `cargo install rtk` lands on
   > the other. Confirm with `rtk gain`.

## Install

```sh
git clone https://github.com/William-SWS/dsh-plugins ~/tools/dsh-plugins
cd ~/tools/dsh-plugins/"rtk for deepseek harness"
./install.sh
```

The installer **never touches your dsh installation or the shipped presets**.
It:

1. copies **your own** `standard` preset into `~/.dsh/.agent-presets/standard-rtk/`;
2. appends the row `- id: tool-rtk` to the end of the composition;
3. copies `rtk.js` into the preset;
4. creates the `node_modules` resolution shim (see below);
5. loads the plugin in a fresh Node process to prove that it resolves.

If a preset with that id already exists and was **not** created by this script,
it is moved to a `.bak-<timestamp>` instead of being deleted.

Options: `PRESET_ID`, `PRESET_NAME`, `SOURCE_PRESET`, `DSH_HOME`.

## Usage

1. In dsh, open **Settings → Agent preset**.
2. Start a session on the **“Coding + RTK”** preset.
3. Confirm that the `rtk` tool shows up, and ask for `rtk gain` to see the panel.

The plugin is **Host-only**: it registers the tool in the host registry and has
no browser half, so it asks for no approval at all — install it and use it.

## Uninstall

```sh
./install.sh --uninstall
```

Removes only `~/.dsh/.agent-presets/standard-rtk`. The `rtk` binary stays.

## How it works (the two non-obvious parts)

**1. The row lives in the preset, not in the host composition.**
The `tools` registry belongs to the host, but what a preset *contributes* to it
are its tools — which is exactly where `tool-bash` and `tool-fs` live in
`standard` itself. The plugin only **consumes** services (`tools`, `shell`, and
optionally `shellEnv`/`sandboxPolicy`), so it publishes no service and needs no
`isolate` realm. If it published one, the mount would be rejected.

**2. The `node_modules` inside the preset is a resolution shim.**
`rtk.js` imports `@deepseek-ai/dsh-tools` (for `defineTool`). A file under
`~/.dsh/.agent-presets/` **cannot reach** the harness packages: Node's walk goes
up through `~/.dsh/`, `~/` and `/`, and none of them has `@deepseek-ai/*`. dsh
solves this for *package names* (it rewrites the base of those rows to the
installation), but not for the internal imports of a file that it loads.

That is why the preset carries a `node_modules` with a symlink to
`<DSH_HOME>/profiles/node_modules/@deepseek-ai/dsh-tools`. Pointing at the
profile's farm (rather than directly at the version directory) keeps the symlink
alive across upgrades. Node resolves the realpath, so the plugin shares the
**same module instance** as the harness.

That symlink is machine-specific — which is precisely why there is an installer
instead of a versioned preset directory. If you add a new import to `rtk.js`,
create the matching symlink (the installer prints the pattern).

> **A detail that costs an hour:** a running dsh caches the *module job* that
> failed for a given file URL. After you fix resolution, it keeps reporting the
> old error for the same path. A fresh Node process resolves immediately — that
> is how this plugin was debugged.

## Honest caveats

- **The preset is a snapshot.** It is built from your installation's `standard`
  at install time. A preset does not inherit from another, so after upgrading
  dsh run `./install.sh` again to pick up the new `standard`.
- **Not tested on Windows.** In `standard`, the `tool-bash` row is disabled on
  Windows and `tool-pwsh` takes over; the tool works through `ctx.shell` either
  way, but RTK is a POSIX-first CLI.
- **Recurring cost.** The tool description enters the context on every step
  (~200 tokens). It pays for itself on the commands you stop running raw, but it
  is not free.
- **Recovering elided output.** When an RTK filter cuts content, it prints a
  hash; the agent recovers the excerpt with `rtk recall <hash>`. That is
  described in the tool description itself.

## Distribution as an npm package (alternative)

Instead of the preset-local file, the plugin can become an npm package and the
row a package name:

```yaml
- id: tool-rtk
  name: 'dsh-tool-rtk'
```

Rows with a package name are resolved from the installation, so the file needs
no shim. The cost is that this requires `pnpm` and
`dsh plugin --profile <profile> add dsh-tool-rtk`, plus publishing to the
registry (or installing from git). The preset-local file path was chosen because
it works without any of that.

## License

[MIT](../LICENSE) © 2026 William-SWS — see the repository root.

The generated preset is derived from the `standard` that ships with dsh, which
belongs to your installation; that is why the installer copies it from the
installing machine instead of redistributing it. The `rtk` CLI itself is
Apache-2.0 and is **not** bundled here — you install it yourself, so no upstream
license obligation attaches to this plugin.
