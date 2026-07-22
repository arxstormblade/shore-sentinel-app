import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import { validateSamlBoundary } from './oidc-validator.js';

export type IdentityProviderBoundary = {
  providerType: 'oidc' | 'saml';
  issuer: string;
  audience: string;
  jwksUri?: string;
  metadataUri?: string;
  enabled?: boolean;
};

@Injectable()
export class IdentityProviderService {
  constructor(private readonly db: DatabaseService) {}

  async save(tenantId: string, input: IdentityProviderBoundary) {
    if (!/^https:\/\//.test(input.issuer) || !input.audience.trim()) throw new BadRequestException('identity provider configuration is invalid');
    if (input.providerType === 'oidc' && (!input.jwksUri || !/^https:\/\//.test(input.jwksUri))) throw new BadRequestException('OIDC JWKS endpoint is required');
    if (input.providerType === 'saml' && (!input.metadataUri || !/^https:\/\//.test(input.metadataUri))) throw new BadRequestException('SAML metadata endpoint is required');
    const result = await this.db.query('INSERT INTO identity_provider_configs (tenant_id,provider_type,issuer,audience,jwks_uri,metadata_uri,enabled) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (tenant_id,provider_type) DO UPDATE SET issuer=EXCLUDED.issuer,audience=EXCLUDED.audience,jwks_uri=EXCLUDED.jwks_uri,metadata_uri=EXCLUDED.metadata_uri,enabled=EXCLUDED.enabled,updated_at=now() RETURNING id,provider_type,issuer,audience,jwks_uri,metadata_uri,enabled', [tenantId, input.providerType, input.issuer, input.audience, input.jwksUri ?? null, input.metadataUri ?? null, input.enabled ?? false]);
    return result.rows[0];
  }

  validateSaml(response: Parameters<typeof validateSamlBoundary>[0], config: { issuer: string; audience: string }) { return validateSamlBoundary(response, config); }
}
