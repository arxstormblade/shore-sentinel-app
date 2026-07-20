type LaunchInput = {
  target?: Record<string, unknown> | null;
  hostKeyPin?: Record<string, unknown> | null;
  egressPolicy?: Record<string, unknown> | null;
  rootPolicy?: Record<string, unknown> | null;
  workerGrant?: Record<string, unknown> | null;
};

function deny(reason: string): never {
  throw new Error(`SSH launch denied: ${reason}`);
}

function validIpv4(value: string) {
  const octets = value.split('.');
  return octets.length === 4 && octets.every((octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255);
}

function canonicalHost(value: unknown) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 253) deny('invalid target hostname');
  if (/[\s\u0000-\u001f\u007f/@:?#[\]\\]/.test(value) || value !== value.toLowerCase()) deny('invalid target hostname');
  if (validIpv4(value)) return value;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) deny('invalid target hostname');
  return value;
}

function validCidr(value: unknown) {
  if (typeof value !== 'string') return false;
  const [ip, prefix, ...rest] = value.split('/');
  return rest.length === 0 && validIpv4(ip) && /^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix ?? '');
}

function validRoot(value: unknown) {
  return typeof value === 'string' && /^\/(?:[^\u0000-\u001f\u007f\\]+\/)*[^\u0000-\u001f\u007f\\/]+$/.test(value) && !value.split('/').includes('..');
}

export function assertSshLaunchRequirements(input: LaunchInput) {
  const target = input?.target;
  if (!target) deny('missing target');
  const host = canonicalHost(target.hostname);
  const port = Number(target.ssh_port);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !target.ssh_credential_id || target.credential_disabled_at) deny('invalid target credentials or port');

  const hostKeyPin = input.hostKeyPin;
  if (!hostKeyPin) deny('missing host key pin');
  if (hostKeyPin.algorithm !== 'ssh-ed25519' || typeof hostKeyPin.fingerprint !== 'string' || !hostKeyPin.fingerprint.startsWith('SHA256:') || hostKeyPin.revoked_at) {
    deny('invalid host key pin');
  }

  const egressPolicy = input.egressPolicy;
  if (!egressPolicy) deny('missing egress policy');
  if (egressPolicy.enabled !== true || egressPolicy.ssh_port !== port || !validCidr(egressPolicy.cidr)) deny('invalid egress policy');

  const rootPolicy = input.rootPolicy;
  if (!rootPolicy) deny('missing root policy');
  if (rootPolicy.enabled !== true || !validRoot(rootPolicy.root_path)) deny('invalid root policy');

  const workerGrant = input.workerGrant;
  if (!workerGrant) deny('missing worker grant');
  if (typeof workerGrant.id !== 'string' || workerGrant.consumed_at || Number.isNaN(Date.parse(String(workerGrant.expires_at))) || Date.parse(String(workerGrant.expires_at)) <= Date.now()) {
    deny('invalid worker grant');
  }

  return {
    host,
    port,
    hostKeyPin: hostKeyPin.fingerprint,
    permittedCidrs: [String(egressPolicy.cidr)],
    enrolledRoot: String(rootPolicy.root_path),
    grantId: workerGrant.id,
  };
}
