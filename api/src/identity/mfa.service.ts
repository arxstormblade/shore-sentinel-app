import { BadRequestException, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../database.service.js';
import { generateTotpSecret, verifyTotp } from '../session/totp.js';

function key() { return createHash('sha256').update(process.env.SHORE_SENTINEL_SECRET_KEY ?? 'development-only-key').digest(); }
function seal(value: string) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv); const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`; }
function unseal(value: string) { const [iv, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part, 'base64url')); const decipher = createDecipheriv('aes-256-gcm', key(), iv); decipher.setAuthTag(tag); return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'); }

@Injectable()
export class MfaService {
  constructor(private readonly db: DatabaseService) {}

  async enrollTotp(tenantId: string, userId: string) {
    const secret = generateTotpSecret();
    await this.db.query('INSERT INTO mfa_factors (tenant_id,user_id,factor_type,secret_ciphertext,secret_key_version) VALUES ($1,$2,\'totp\',$3,$4) ON CONFLICT (tenant_id,user_id,factor_type) DO UPDATE SET secret_ciphertext=EXCLUDED.secret_ciphertext,secret_key_version=EXCLUDED.secret_key_version,revoked_at=NULL', [tenantId, userId, seal(secret), 'v1']);
    return { secret };
  }

  async verifyTotp(tenantId: string, userId: string, code: string) {
    const result = await this.db.query<{ secret_ciphertext: string }>('SELECT secret_ciphertext FROM mfa_factors WHERE tenant_id=$1 AND user_id=$2 AND factor_type=\'totp\' AND revoked_at IS NULL', [tenantId, userId]);
    if (!result.rows[0]) throw new BadRequestException('MFA factor is not enrolled');
    const valid = verifyTotp(unseal(result.rows[0].secret_ciphertext), code);
    if (valid) await this.db.query('UPDATE mfa_factors SET last_used_at=now() WHERE tenant_id=$1 AND user_id=$2 AND factor_type=\'totp\'', [tenantId, userId]);
    return valid;
  }
}
