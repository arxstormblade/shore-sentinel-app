import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const form = readFileSync(join(process.cwd(), 'components/new-machine-form.jsx'), 'utf8');

test('new managed-machine SSH enrollment submits explicit host pin, egress CIDR, and enrolled root controls', () => {
  assert.match(form, /<label>Host key algorithm<select name="ssh_host_key_algorithm"/);
  assert.match(form, /<option value="ssh-ed25519">ssh-ed25519<\/option>/);
  assert.match(form, /<label>Host key SHA256 fingerprint<input name="ssh_host_key_fingerprint"/);
  assert.match(form, /<label>Allowed IPv4 CIDR<input name="ssh_allowed_cidr"/);
  assert.match(form, /<label>Enrolled scan root<input name="ssh_root_path"/);
  assert.match(form, /SHA256: followed by the unpadded 43-character OpenSSH fingerprint/);
  assert.match(form, /required=\{usesSsh\}/);
});
