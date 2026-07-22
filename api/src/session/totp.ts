import { createHmac, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20): string {
  const input = randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(secret: string): Buffer | null {
  const normalized = secret.replace(/[\s=-]/g, '').toUpperCase();
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) return null;
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of normalized) {
    value = (value << 5) | ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function codeFor(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secretText: string, code: string, at = new Date(), window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const secret = decodeBase32(secretText);
  if (!secret) return false;
  const counter = Math.floor(at.getTime() / 1000 / 30);
  return Array.from({ length: window * 2 + 1 }, (_, index) => index - window).some((offset) => codeFor(secret, counter + offset) === code);
}

export function totpCodeForTest(secretText: string, at = new Date()): string {
  const secret = decodeBase32(secretText);
  if (!secret) throw new Error('invalid TOTP secret');
  return codeFor(secret, Math.floor(at.getTime() / 1000 / 30));
}
