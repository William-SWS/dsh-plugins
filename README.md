# dsh-plugins

My personal collection of plugins for the
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).

Each plugin lives in its own subfolder and is **self-contained**: it brings the
plugin code, an installer, and its own README with that plugin's details,
prerequisites and caveats. This README is just the map of the collection — the
source of truth for any plugin is its own README.

## Plugins

| Plugin | What it does | Install |
| --- | --- | --- |
| [`rtk for deepseek harness`](./rtk%20for%20deepseek%20harness/) | Adds the `rtk` tool — a proxy for the [RTK (Rust Token Killer)](https://github.com/rtk-ai/rtk) CLI that filters and summarizes command output **before** it enters the context (typically 60–90% fewer tool-output tokens). Ships the `standard-rtk` agent preset. | `cd "rtk for deepseek harness" && ./install.sh` |

## Layout

```
dsh-plugins/
├── LICENSE
└── rtk for deepseek harness/
    ├── README.md    # the plugin's instructions, prerequisites and caveats
    ├── install.sh   # installs (or --uninstall) the preset into your dsh
    └── rtk.js       # the plugin itself
```

## How to install a plugin

There is deliberately no root-level installer: each plugin decides what it
installs (a preset, a row in a composition, an npm package) and how it
uninstalls. Go into the folder and run its `install.sh` from there — it uses the
script's own path, so it works from anywhere.

One principle holds for all of them: **the installer never modifies your dsh
installation or the shipped presets**. It copies what it needs into `~/.dsh/`,
creates a new preset, and marks what it created, so that `--uninstall` deletes
only that. If something already exists at the destination that the script did
not create, the file is moved to a `.bak-<timestamp>` instead of being
overwritten or deleted.

## How to add a new plugin

Conventions I follow in this collection:

- **One folder per plugin**, with a `README.md`, the plugin code, and — when
  installing is more than "copy a file" — its own `install.sh` with a symmetric
  `--uninstall`.
- **No machine-specific files under version control.** Paths that exist only on
  my machine (`node_modules` symlinks, generated presets) are created at install
  time, not committed. That is why `rtk` has an installer instead of a
  ready-made preset directory.
- **Host-only when possible.** A plugin that only registers tools in the host
  registry needs no browser half and no approval. Only publish a service if you
  genuinely need to — publishing changes what a preset is allowed to mount.
- **Short tool descriptions.** They enter the context on every step, so they are
  a recurring cost: write for tokens, not for documentation.
- **An honest README.** Prerequisites, what breaks, what was not tested and the
  recurring cost all get written down. A plugin with no declared caveats is a
  plugin that has not really been used yet.

> **Naming note:** the existing folder uses spaces in its name, which is
> annoying to type and to link (`%20`). For new plugins I prefer `kebab-case`
> (`my-plugin`) — the old folder stays as it is, so links and instructions
> already written do not break.
>
> **Module resolution gotcha:** a file loaded from inside
> `~/.dsh/.agent-presets/` **cannot** reach `@deepseek-ai/*` through Node's
> normal walk. If your plugin imports a harness package, it needs the
> `node_modules` shim pointing at
> `<DSH_HOME>/profiles/node_modules/@deepseek-ai/…`. The `rtk` plugin's README
> explains the whole mechanism.

## License

[MIT](./LICENSE) © 2026 William-SWS. Every plugin in this collection is under the
same license unless its own folder says otherwise. The intent is that anyone can
copy a plugin into their own dsh setup without asking.
