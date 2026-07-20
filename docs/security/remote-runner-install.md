# Managed SSH remote-runner installation contract

This is a **deployment artifact and contract only**. Installing it changes a managed target and must be performed during an approved target rollout; this repository does not deploy it.

## Fixed protocol

The SSH login account may send only these three exact SSH client command forms:

```text
/usr/local/lib/shore-sentinel/run-scan --request <canonical-uuid>
/usr/local/lib/shore-sentinel/run-scan --cancel-request <canonical-uuid>
/usr/local/lib/shore-sentinel/run-scan --stage-request <canonical-uuid>
```

`<canonical-uuid>` is the five-segment UUID form. The runner derives the sole request path itself:

```text
/var/lib/shore-sentinel/requests/<canonical-uuid>/request.json
```

`--stage-request` reads only a fixed stdin stream of at most 8192 bytes, with an absolute 5-second read deadline, and derives the same UUID request path itself. A byte ceiling requested by the Node worker may be lower for a test but may never exceed this immutable 8192-byte protocol ceiling. A deadline, empty/oversized input, duplicate UUID, symlink, or canonical-path escape returns only `REJECTED` and removes the partial UUID request state. The runner creates the UUID directory and `request.json` as a root-owned atomic rename only after that validation. It is not a generic stdin command or arbitrary file-write interface. The runner never accepts a caller-provided path, PID, process group, signal, command, shell fragment, or scanner arguments. Invalid protocol requests return `REJECTED`; cancellation returns only `CANCELLED`, `NOT_RUNNING`, or the fixed failure status `CLEANUP_FAILED`. These statuses intentionally omit host, path, PID, command, and scanner details. A successful request streams only the fixed scanner implementation's scanner payload.

OpenSSH ForceCommand does not execute the client command directly. Configure it exactly, with no adapter arguments:

```text
ForceCommand /usr/local/lib/shore-sentinel/force-command-dispatch
```

`force-command-dispatch` reads `SSH_ORIGINAL_COMMAND` and compares it as data against the three exact forms above. It rejects an empty command, a runner command with no arguments, altered runner paths, extra tokens, shell syntax, and non-UUID values before any sudo call. For an accepted request it invokes only one fixed absolute vector: `/usr/bin/sudo -n /usr/local/lib/shore-sentinel/run-scan --request <validated-uuid>`, `--cancel-request <validated-uuid>`, or `--stage-request <validated-uuid>`. The third form passes only the SSH exec stream's bounded stdin to the fixed runner; it does not expose a generic stdin command or file path. The adapter does not use `eval`, `sh -c`, dynamic paths, caller-provided command text, or an adapter test mode.

## Required target layout and ownership

A privileged target installer must place the tracked wrapper, fixed lifetime supervisor, and separately reviewed fixed scanner implementation as root-owned, non-writable executable files. The implementation is intentionally not supplied by request arguments.

```bash
install -d -o root -g root -m 0755 /usr/local/lib/shore-sentinel
install -d -o root -g root -m 0755 /var/lib/shore-sentinel
install -d -o root -g root -m 0700 /var/lib/shore-sentinel/runner-state
install -d -o root -g root -m 0700 /var/lib/shore-sentinel/requests
install -o root -g root -m 0755 infra/ssh-fixture/force-command-dispatch /usr/local/lib/shore-sentinel/force-command-dispatch
install -o root -g root -m 0750 infra/remote-runner/run-scan /usr/local/lib/shore-sentinel/run-scan
install -o root -g root -m 0750 infra/remote-runner/run-scan-supervisor /usr/local/lib/shore-sentinel/run-scan-supervisor
install -o root -g root -m 0750 /approved/staging/run-scan-impl /usr/local/lib/shore-sentinel/run-scan-impl
install -o root -g root -m 0440 infra/ssh-fixture/shore-sentinel-scanner-runner.sudoers /etc/sudoers.d/shore-sentinel-scanner-runner
visudo -cf /etc/sudoers.d/shore-sentinel-scanner-runner
```

`/usr/local/lib/shore-sentinel/force-command-dispatch`, `/usr/local/lib/shore-sentinel/run-scan`, `/usr/local/lib/shore-sentinel/run-scan-supervisor`, `/usr/local/lib/shore-sentinel/run-scan-impl`, `/var/lib/shore-sentinel/runner-state`, and `/var/lib/shore-sentinel/requests` must not be writable by the SSH login account. Only the root runner may create the UUID-named request directory and regular `request.json` beneath the request root through the exact `--stage-request <uuid>` action; neither the request root, UUID directory, nor request file may be a symlink. The wrapper resolves the canonical request root, directory, and file and rejects any symlink or canonical-path escape before atomically publishing the staged request or invoking the fixed implementation. The account must not have write access to any parent of the adapter, runner state, request root, or any executable. The target account restriction must use the exact no-argument `ForceCommand` above and no interactive shell or arbitrary command execution.

The `scanner` login account must not belong to the `root` group. Its only elevation is the exact `NOSETENV` sudo runner protocol below; making it a root-group member would bypass the fixture's ownership and request-staging boundary.

Install the tracked sudoers asset only on a target with native sudo 1.9.10+ command-argument regular-expression support (not a sudo-compatible parser that rejects this feature). It declares `Defaults:scanner env_reset` and `NOSETENV: NOPASSWD:` for exactly `/usr/local/lib/shore-sentinel/run-scan ^(--request|--cancel-request|--stage-request) <uuid-regex>$`; it must not be replaced with a wildcard, a directory grant, a command alias with broader members, `SETENV`, a generic stdin command, or a caller-supplied path/argument rule.

The implementation at `/usr/local/lib/shore-sentinel/run-scan-impl` must independently validate the staged JSON against the enrolled root/scope policy before scanning. It is invoked only as the fixed argument vector `run-scan-impl --request <derived-request-path>`.

## Runtime cancellation and deadline behavior

For every accepted request, the wrapper starts only the fixed root-owned supervisor in a new session/process group with `setsid`. Before the supervisor may invoke the fixed implementation, it independently verifies the runner-published five-field lifetime record (`PID`, Linux start ticks, process-group ID, session ID, deadline) against its own `/proc/<pid>/stat` identity. The supervisor remains the verifiable session/group leader while implementation descendants survive. If the runner cannot observe that leader before publishing state, the supervisor's fixed one-second startup wait expires without scanning and the runner reaps it before returning `CLEANUP_FAILED`; it never abandons an untracked scanner. Cancellation can therefore act only on that matching UUID lifetime.

Cancellation and the hard remote deadline use the same idempotent sequence:

1. Send `TERM` to the recorded process group.
2. Wait no more than **8 seconds**.
3. Send `KILL` to the still-running group.
4. Wait no more than a further fixed **2 seconds**. If the group still exists, preserve the root-owned state for a later retry, record only the fixed `CLEANUP_FAILED` marker in its root-owned `status` file, and return only `CLEANUP_FAILED` (exit 70); never wait indefinitely.

The runner retains that state and fixed marker if deadline cleanup fails even when the recorded session leader has exited; it must not delete the UUID state or report successful cancellation while the recorded group remains. A legacy, malformed, mismatched, recycled, or expired record is marked `STALE_AUTHORITY` and may not issue a numeric signal. The retained UUID state prevents another request with that UUID from colliding with the unresolved group. The runner's fixed execution deadline begins cleanup after 100 seconds, leaving the bounded 10 seconds of cleanup inside the worker's 120-second SSH budget. The deadline guard remains responsible for cleanup if the SSH client disconnects or a cancellation acknowledgement cannot be obtained. An operator must confirm the target's clock, `setsid`, and process-group behavior during an approved disposable-fixture rollout.

## Rollout verification (not performed locally)

Before enabling a target, verify with non-production fixture credentials that:

- malformed UUIDs and extra arguments return only `REJECTED`;
- the normal request command cannot escape its derived request path;
- a child process survives long enough to prove group-level TERM then KILL cleanup;
- cancelling twice yields an idempotent fixed status;
- deadline cleanup also works after the SSH client disconnects; and
- the restricted account, host-key pin, CIDR authorization, enrolled scope, opaque queue payload, and worker capability controls remain enforced.

This local artifact cannot prove a real fixture, target account restriction, or firewall/egress ACL.
