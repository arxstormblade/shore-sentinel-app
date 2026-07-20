# Worker-node egress ACL contract (operator evidence)

> **Non-executed release-evidence artifact.** This contract is a reviewable deployment requirement, not a firewall implementation. **Do not run locally.** Nothing in this repository applies rules, discovers production hosts, queries a control plane, or proves that a live firewall enforces this contract.

## Required traffic identity and default-deny boundary

The only identity eligible for this policy is the active Docker Compose service `worker-node` in Compose project `shore-sentinel`, attached to `worker-egress`. The enforcement implementation must resolve that exact container identity from all three values (project label, service label, and `worker-egress` attachment) under its update lock. It must not substitute a service subnet, a container name prefix, an arbitrary source address, or another container on the same network.

For that exact identity, the `worker-egress` forwarding path is **default-deny**. The policy permits only the atomically installed allow entries from a separately authenticated deployment export. A missing, unreadable, stale, malformed, empty, or rejected export leaves the identity with no external destination allowance. Established replies may be allowed only for connections created by a currently installed allow entry. This policy does not widen the internal `backend` or `worker-private` paths already represented in Compose.

## Local schema input is not provenance evidence

The checked-in JSON and `scripts/check_worker_node_egress_policy.py` use the exact `source` value `unverified-local-schema-input`. This label is intentionally visible: it is only an **unverified local schema input** classification. The checker does not authenticate or verify provenance, a signer, an export digest, freshness, or any control-plane claim; a copied or forged JSON file therefore cannot produce an authoritative result or live-policy claim.

The checker accepts IPv4 target CIDRs only, from **IPv4 /24 through /32** inclusive. It rejects IPv6 and every prefix broader than `/24`, including `0.0.0.0/1` and `::/1`. Optional DNS/HTTPS entries are narrower still: IPv4 `/32` hosts only. Every SSH target entry binds an enrollment UUID to one permitted IPv4 CIDR, TCP, and enrolled SSH port. There is **no caller-supplied CIDR** interface, command-line destination option, environment override, or generic firewall command in this release artifact.

An approved deployment updater—not this checker—must consume a signed or otherwise integrity-protected server-authoritative enrollment export, verify its trusted key/digest and freshness, and reject catch-all CIDRs, duplicate records, unknown keys, non-TCP transport, invalid ports, and stale data. The checked-in TEST-NET example is not deployment input. The checker reads local JSON and optionally renders a deterministic intent plan; it does not invoke a firewall tool or network client.

## DNS and HTTPS

Direct SSH needs neither a broad DNS allowance nor a broad HTTPS allowance by default. `optional_resolvers` is empty unless approved deployment evidence identifies fixed resolver IPv4 addresses required to resolve enrolled target hostnames. If used, each resolver is a single IPv4 `/32` host limited to UDP/TCP port 53. `optional_https` is empty unless an approved artifact source is truly required; each entry is a single IPv4 `/32` host, TCP 443, and carries the recorded reason. No domain wildcard, arbitrary public resolver, proxy, package repository, `0.0.0.0/0`, or IPv6 entry is allowed.

## Atomic update and rollback contract

An approved deployment implementation must build and validate a complete candidate ruleset off-path, resolve the exact worker identity while holding a per-host update lock, and atomically replace the dedicated egress chain/set reference in one firewall transaction. It must retain the prior validated generation and its authenticated export digest. If validation, identity resolution, transaction commit, or post-commit verification fails, it must retain or atomically restore the prior generation; it must never flush to a permissive fallback. Expired authenticated records must be removed in the same replacement transaction.

The operator records: deployment environment, timestamp, worker container ID and label tuple, authenticated policy/export digest, candidate and prior generation IDs, allow-entry count, transaction result, rollback result when used, and verifier output. Those records are release evidence; no values in this document assert that they already exist.

## Safe local checks and approved external evidence

Local review may run only the check-only commands below; they never apply rules or contact a service:

```bash
python3 scripts/check_worker_node_egress_policy.py \
  --policy infra/egress-acl/server-authoritative-policy.example.json
python3 scripts/check_worker_node_egress_policy.py \
  --policy infra/egress-acl/server-authoritative-policy.example.json --render
```

Expected local result: `CHECK OK: UNVERIFIED LOCAL SCHEMA INPUT` and, for `--render`, deterministic intent JSON. This is not a live firewall enforcement proof or provenance verification.

**External evidence commands — do not execute from this checkout without a separately approved, named non-production environment:**

```text
approved-egress-updater --environment fixture-<name> --export /approved/server-authoritative-export.json --verify-only
approved-egress-updater --environment fixture-<name> --export /approved/server-authoritative-export.json --apply-atomic
approved-egress-verifier --environment fixture-<name> --expect-default-deny --expect-worker-label shore-sentinel/worker-node/worker-egress
approved-egress-updater --environment fixture-<name> --rollback <prior-generation-id> --verify-only
```

Expected external evidence: only the labelled worker can open TCP to each authenticated enrolled target CIDR and enrolled port; an unlisted address, another container on `worker-egress`, broad DNS/HTTPS, IPv6, and a malformed export are denied. A failed update reports a preserved or restored prior generation, never an implicit allow-all.

## Evidence gap

This contract and checker provide no live enforcement, packet trace, container-label resolution, authenticated server export, firewall transaction, rollback, or production query. Those items remain externally blocked pending explicit environment approval.
