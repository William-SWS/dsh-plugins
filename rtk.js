/**
 * tool-rtk — expose the RTK CLI proxy (https://github.com/rtk-ai/rtk) as an
 * `rtk` model tool.
 *
 * RTK is a CLI proxy that filters and summarizes command output *before* it
 * reaches the model context, which is where the token saving comes from: this
 * plugin only contributes the tool row and the shell wiring.
 *
 * It is a preset-owned file, named by the relative specifier `./rtk-tool.js`
 * in `agent.cordis.yml`, so it travels with the preset.
 *
 * @module standard-rtk/rtk-tool
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { isAbsolute, resolve } from 'node:path'

/** Registry name of this plugin row. */
export const name = 'tool-rtk'

/**
 * A preset row may not publish a service, and this one publishes none: it
 * consumes the host's `tools` registry and `shell` executor, exactly like the
 * sibling `tool-bash` row, and resolves `shellEnv` / `sandboxPolicy`
 * optionally because not every composition mounts them.
 */
export const inject = ['tools', 'shell']

/** Tool description: the model sees this on every step, so it stays tight. */
const TOOL_DESCRIPTION = [
  'Run a dev command through RTK (Rust Token Killer, https://github.com/rtk-ai/rtk) — a CLI proxy that filters and summarizes command output before it reaches context, cutting tool-output tokens 60-90%.',
  'Prefer this over `bash` for dev work: RTK selects the filter from the command itself and falls back to raw output (still usage-tracked) for unknown commands, so anything bash can run still works.',
  'Good fits: git, gh/glab, tests (cargo|pytest|vitest|jest|rspec|rake|phpunit|ctest), builds (cargo|npm|pnpm|bun|dotnet|tsc|next|prisma), linters/formatters (eslint|ruff|mypy|rubocop|phpstan|pint|prettier|sqlfluff), search and listing (grep|rg|find|tree|ls|wc|env|deps), file reads (`read <path> -l aggressive`), logs, diff, docker|kubectl|oc, aws, psql, curl.',
  'RTK meta-commands work too: `gain` (token savings report), `gain -f json`, `recall <hash>` (recover output a filter elided), `discover`, `session`, `verify`.',
  'Filter arbitrary stdin with a shell pipe, e.g. `my-tool 2>&1 | rtk pipe -f grep`. Pass the command exactly as it would follow `rtk`; pipelines, quotes and redirection work.',
  'Output is already compacted by RTK and then tail-truncated by the executor; non-zero exits are reported as `[exit code: N]`.',
].join(' ')

/**
 * Read only the leaf this tool needs from the live execution context.
 * @param exec - the tool execution identity.
 * @returns the session cwd, or undefined when the caller has none.
 */
function readSessionCwd(exec) {
  const cwd = exec.agent?.session.header.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
}

/**
 * Resolve the working directory the same way `tool-bash` does: a resolved
 * sandbox-policy root wins, then the session cwd, and a relative request is
 * resolved against that base.
 * @param requested - the model-supplied workdir, if any.
 * @param exec - the tool execution identity.
 * @param policyRoot - the sandbox policy's workspace root, when one exists.
 * @returns an absolute workdir, or undefined to accept the executor default.
 */
function resolveWorkdir(requested, exec, policyRoot) {
  const base = policyRoot ?? readSessionCwd(exec)
  if (requested === undefined || requested.length === 0) return base
  if (isAbsolute(requested)) return requested
  return base === undefined ? requested : resolve(base, requested)
}

/** Append one marker line without doubling a trailing newline. */
function appendMarker(body, marker) {
  if (body.length === 0) return marker
  return body.endsWith('\n') ? body + marker : `${body}\n${marker}`
}

/**
 * Shape one finished run into the compact text the model sees: RTK's own
 * filtered output, an `[stderr]` section when there is one, then the status
 * markers `tool-bash` established so failure handling stays familiar.
 * @param args - the validated call arguments.
 * @param value - this tool's canonical result.
 * @returns the model-facing content blocks.
 */
function renderRtk(args, value) {
  let body = value.stdout
  if (value.stderr.length > 0) body = appendMarker(body, `[stderr]\n${value.stderr}`)
  if (value.truncated) {
    body = appendMarker(
      body,
      `[output tail-truncated by the executor${value.spillPath === null ? '' : `; full output: ${value.spillPath}`}]`,
    )
  }
  if (body.length === 0) body = '(no output)'
  if (value.aborted) return [{ type: 'text', text: appendMarker(body, '[aborted]') }]
  if (value.timedOut) return [{ type: 'text', text: appendMarker(body, '[timed out]') }]
  if (value.signal !== null) return [{ type: 'text', text: appendMarker(body, `[killed by signal: ${value.signal}]`) }]
  if (value.exitCode !== null && value.exitCode !== 0) {
    let marker = `[exit code: ${value.exitCode}]`
    if (value.exitCode === 127) {
      marker += ' — the wrapped command was not found; if `rtk` itself is missing, install it from https://github.com/rtk-ai/rtk'
    }
    return [{ type: 'text', text: appendMarker(body, marker) }]
  }
  return [{ type: 'text', text: body }]
}

/**
 * Register the `rtk` tool on the agent-scoped `tools` registry.
 * @param ctx - this plugin row's context.
 */
export function apply(ctx) {
  // Fail closed: a confining executor without its policy service would
  // otherwise let this tool run commands with no confinement at all.
  const defaultMode = ctx.shell.sandboxMode
  const sandboxPolicy = defaultMode === undefined ? undefined : ctx.get('sandboxPolicy')
  if (defaultMode !== undefined && sandboxPolicy === undefined) {
    throw new Error('tool-rtk: the mounted shell executor confines but ctx.sandboxPolicy is missing')
  }
  const shellEnv = ctx.get('shellEnv')

  ctx.tools.register(defineTool({
    name: 'rtk',
    description: TOOL_DESCRIPTION,
    parameters: {
      command: {
        type: 'string',
        required: true,
        description: 'Command line to run through RTK, exactly as it would follow `rtk` — e.g. "git status", "rg -n TODO src", "cargo test", "read src/main.rs -l aggressive", "gain". Pipelines, quotes and redirection are allowed.',
      },
      workdir: {
        type: 'string',
        description: 'Working directory for this command. Defaults to the session workspace; a relative path is resolved against it.',
      },
      timeoutMs: {
        type: 'number',
        description: 'Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          stdout: { type: 'string', required: true },
          stderr: { type: 'string', required: true },
          exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }], required: true },
          signal: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
          timedOut: { type: 'boolean', required: true },
          aborted: { type: 'boolean', required: true },
          truncated: { type: 'boolean', required: true },
          spillPath: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
        },
      },
      render: renderRtk,
    },
    async execute(args, exec) {
      // Tolerate a caller that repeats the prefix it is told to omit.
      let command = args.command.trim()
      if (command.startsWith('rtk ')) command = command.slice(4).trim()
      if (command.length === 0 || command === 'rtk') {
        throw new Error('invalid command: expected a non-empty command line to run after `rtk`')
      }

      const policy = sandboxPolicy?.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
      const workdir = resolveWorkdir(args.workdir, exec, policy?.workspaceRoot)

      const result = await ctx.shell.run(ctx.shell.resolve({
        command: `rtk ${command}`,
        ...workdir === undefined ? {} : { workdir },
        ...args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs },
        ...policy === undefined ? {} : { sandboxPolicy: policy },
        ...shellEnv === undefined ? {} : { dshEnv: shellEnv.collect(exec) },
        signal: exec.signal,
      }))

      const spillPath = result.stdout.spillPath ?? result.stderr.spillPath ?? null
      return {
        stdout: result.stdout.text,
        stderr: result.stderr.text,
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        aborted: result.aborted,
        truncated: result.stdout.truncated || result.stderr.truncated,
        spillPath,
      }
    },
  }))
}
