# Disposable SSH fixture contract and evidence harness

> **Non-executed release-evidence artifact. Do not run locally.** The checked-in harness validates only the declarative fixture contract. It starts no container or service, creates no account, opens no SSH connection, and contains no credential. External fixture execution needs separately recorded approval for a named, non-production environment.

## Scope and fixed trust boundary

Use a disposable, isolated target whose name and network are marked as a fixture. It must have a fresh, dedicated SSH host key. Before any scan command, an operator records that key's OpenSSH `SHA256:` fingerprint out of band and writes only that exact fixed fingerprint to the approved fixture configuration. The client uses a dedicated ephemeral `known_hosts` file and strict host key checking (`StrictHostKeyChecking=yes`); TOFU (`accept-new`), `off`, and `ask` are forbidden. A host-key mismatch is a required negative test and must fail before the runner receives a request.

The account is named `scanner` and must not be a member of the `root` group. SSH configuration fixes `ForceCommand /usr/local/lib/shore-sentinel/force-command-dispatch` **without arguments**; its interactive shell, agent forwarding, TCP forwarding, and X11 forwarding are disabled. OpenSSH preserves the client request in `SSH_ORIGINAL_COMMAND`, so the root-owned adapter reads that one value and accepts only these exact strings: `/usr/local/lib/shore-sentinel/run-scan --request <uuid>`, `/usr/local/lib/shore-sentinel/run-scan --cancel-request <uuid>`, and `/usr/local/lib/shore-sentinel/run-scan --stage-request <uuid>`. The third action reads only its fixed 8192-byte stdin stream within an absolute 5-second deadline; a deadline returns only `REJECTED` and removes partial request state. It exposes no caller path, generic command, or arbitrary file write. The adapter rejects no command, adapter arguments, altered paths, extra tokens, shell syntax, and non-UUID input before sudo is invoked.

The adapter calls the absolute `/usr/bin/sudo -n` with a fixed runner vector and its validated action/UUID; it never evaluates, shells, or reuses caller command text. Its root-owned sudoers asset enables `env_reset`, uses `NOSETENV`, and permits only `/usr/local/lib/shore-sentinel/run-scan` followed by the three anchored UUID-only argument forms—no wildcard command, generic stdin command, or argument grant. It provides no shell, path, PID, signal, or scanner-command interface. The root runner preserves request/cancel behavior and adds only `--stage-request <uuid>`, which writes bounded JSON stdin through a root-owned atomic rename after UUID/canonical-path/no-symlink validation.

## Required immutable fixture layout

The fixture declaration requires these leaf ownership/mode values after privileged setup:

| Path / role | Required owner and mode | Scanner-account access |
|---|---|---|
| `/usr/local/lib/shore-sentinel/force-command-dispatch` ForceCommand adapter | `root:root:0755` | SSHD-only entry point; no adapter arguments; not writable |
| `/usr/local/lib/shore-sentinel/run-scan` fixed runner | `root:root:0750` | only through the fixed `sudo -n` protocol; not writable |
| `/usr/local/lib/shore-sentinel/run-scan-supervisor` fixed lifetime supervisor | `root:root:0750` | no direct access; not writable; verifies its own runner-published lifetime record before scanning |
| `/usr/local/lib/shore-sentinel/run-scan-impl` fixed implementation | `root:root:0750` | not writable |
| `/var/lib/shore-sentinel/runner-state` | `root:root:0700` | no access |
| `/var/lib/shore-sentinel/requests` request root | `root:root:0700` | no direct access; root runner alone stages UUID request directories/request JSON atomically |
| `/etc/sudoers.d/shore-sentinel-scanner-runner` | `root:root:0440` | no access; exact root adapter rule only |

Every parent traversal directory for the sudoers file and root runner, supervisor, implementation, state, and request paths must be root-owned, non-scanner-writable, a directory, and **not-symlink**. The static contract requires `/etc`, `/etc/sudoers.d`, `/usr`, `/usr/local`, `/usr/local/lib`, `/usr/local/lib/shore-sentinel`, `/var`, `/var/lib`, and `/var/lib/shore-sentinel`; the root-owned `/var/lib/shore-sentinel/requests` leaf is not scanner-controlled.

The controlled implementation exposes only two fixture modes selected by pre-staged root-owned request data: `allowed-scope` scans one pre-created allowed root; `term-resistant-child` starts a child that ignores TERM and remains in the runner-created process group. It may not accept a caller-selected binary, command fragment, scope root, or symlink traversal.

## Required approved-fixture test matrix

The declarative test IDs are in `infra/ssh-fixture/fixture-contract.json`; `scripts/check_disposable_ssh_fixture.py` verifies their static presence only.

| Test | Expected external result |
|---|---|
| `allowed-scope` | Fixed implementation scans only the pre-staged enrolled root and emits the normal bounded fixture payload. |
| `disallowed-scope` | A root outside the enrolled policy is refused with the runner's fixed non-sensitive status. |
| `symlink-rejection` | A request or target containing a symlink is refused; no outside path is read. |
| `cancel-term-kill-deadline` | The TERM-resistant child receives TERM, survives only the bounded grace interval, then its process group receives KILL; deadline has the same result. |
| `duplicate-cancel` | Two cancellation requests yield the fixed idempotent terminal statuses and never signal an unrelated process. |
| `client-disconnect` | Disconnecting the SSH client does not prevent runner-owned deadline cleanup; no process remains after the deadline/grace window. |
| `host-key-mismatch` | A deliberately wrong fixed fingerprint fails before any request dispatch. |
| `cleanup` | Fixture request/state files, ephemeral known-hosts file, fixture key, and disposable target are removed/revoked; terminal statuses are recorded. |

## Check-only local command

```bash
python3 scripts/check_disposable_ssh_fixture.py \
  --spec infra/ssh-fixture/fixture-contract.json
```

Expected local result: `CHECK OK`. This is not a fixture test and provides no authentication, daemon, ForceCommand, ownership, cancellation, network, or cleanup proof.

## External evidence commands (do not execute here)

After explicit written approval names a non-production environment, the operator records the exact selected target and uses an approved runbook. The following are evidence-command templates, not runnable scripts from this repository:

```text
ssh-keygen -lf /approved/fixture/ssh_host_ed25519_key.pub -E sha256
stat -c '%U:%G:%a %F %n' -- /etc /etc/sudoers.d /usr /usr/local /usr/local/lib /usr/local/lib/shore-sentinel /var /var/lib /var/lib/shore-sentinel /usr/local/lib/shore-sentinel/force-command-dispatch /usr/local/lib/shore-sentinel/run-scan /usr/local/lib/shore-sentinel/run-scan-supervisor /usr/local/lib/shore-sentinel/run-scan-impl /var/lib/shore-sentinel/runner-state /var/lib/shore-sentinel/requests /etc/sudoers.d/shore-sentinel-scanner-runner
visudo -cf /etc/sudoers.d/shore-sentinel-scanner-runner
approved-ssh-fixture-harness --environment fixture-<name> --fixed-host-fingerprint SHA256:<43-char-value> --case allowed-scope
approved-ssh-fixture-harness --environment fixture-<name> --fixed-host-fingerprint SHA256:<43-char-value> --case term-resistant-child --cancel --deadline
approved-ssh-fixture-harness --environment fixture-<name> --wrong-host-fingerprint SHA256:<43-char-value> --case host-key-mismatch
approved-ssh-fixture-harness --environment fixture-<name> --case cleanup
```

Expected `stat -c` evidence: each protected parent is reported as `root:root:755 directory` (except `/etc/sudoers.d`, `root:root:750 directory`), never `symbolic link`, and no protected parent has scanner write permission. Leaf evidence must match the table, including `root:root:700 directory /var/lib/shore-sentinel/requests`. The approved sudoers file must validate and contain `Defaults:scanner env_reset` plus exactly the `NOSETENV: NOPASSWD:` grant for the fixed runner and anchored `--request|--cancel-request|--stage-request` UUID argument regular expression; it must contain no wildcard and no other command grant. Never put a private key, password, host address, or production identifier in this repository.

Expected evidence also includes the fingerprint comparison, account/ForceCommand configuration, root ownership/modes, request scope refusals, process-group TERM then KILL timestamps, duplicate-cancel statuses, post-disconnect cleanup, mismatch-before-dispatch log, and cleanup/revocation record.

## Evidence gap

No disposable host, service, account, host key, SSH client session, process, cancellation, or cleanup was created by this artifact. Live fixture proof remains externally blocked until an environment is explicitly approved.
