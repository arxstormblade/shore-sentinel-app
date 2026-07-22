import { createHash } from 'node:crypto';

export type OidcConfiguration = {
  issuer: string;
  audience: string;
  jwksUri?: string;
};

export type OidcValidationInput = {
  issuer?: string;
  audience?: string;
  nonce: string;
  state: string;
  returnedState: string;
  idToken: string | Record<string, unknown>;
  codeVerifier: string;
  codeChallenge: string;
  signatureVerified?: boolean;
  now?: Date;
};

export class OidcValidationError extends Error {
  constructor(message: string) {
    super(`OIDC validation failed: ${message}`);
    this.name = 'OidcValidationError';
  }
}

export function buildPkceChallenge(codeVerifier: string): string {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) throw new OidcValidationError('invalid PKCE verifier');
  return createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');
}

function decodeToken(token: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof token !== 'string') return token;
  const parts = token.split('.');
  if (parts.length !== 3) throw new OidcValidationError('malformed ID token');
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payload');
    return payload as Record<string, unknown>;
  } catch {
    throw new OidcValidationError('malformed ID token payload');
  }
}

export class OidcValidator {
  constructor(private readonly configuration: OidcConfiguration) {}

  async validate(input: OidcValidationInput): Promise<Record<string, unknown>> {
    const claims = decodeToken(input.idToken);
    const issuer = input.issuer ?? this.configuration.issuer;
    const audience = input.audience ?? this.configuration.audience;
    const now = input.now ?? new Date();
    if (claims.iss !== issuer) throw new OidcValidationError('issuer mismatch');
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(audience)) throw new OidcValidationError('audience mismatch');
    if (claims.nonce !== input.nonce) throw new OidcValidationError('nonce mismatch');
    if (input.returnedState !== input.state) throw new OidcValidationError('state mismatch');
    if (buildPkceChallenge(input.codeVerifier) !== input.codeChallenge) throw new OidcValidationError('PKCE mismatch');
    const expiresAt = Number(claims.exp);
    if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= now.getTime()) throw new OidcValidationError('token expired');
    if (input.signatureVerified === false) throw new OidcValidationError('signature rejected');
    return claims;
  }

  assertStepUp(claims: Record<string, unknown>, options: { maxAgeSeconds: number; requiredAcr?: string; requiredAmr?: string[]; now?: Date }) {
    const now = options.now ?? new Date();
    const authTime = Number(claims.auth_time);
    if (!Number.isFinite(authTime) || now.getTime() - authTime * 1000 > options.maxAgeSeconds * 1000) {
      throw new OidcValidationError('step-up authentication is stale');
    }
    if (options.requiredAcr && claims.acr !== options.requiredAcr) throw new OidcValidationError('ACR step-up requirement not met');
    const amr = Array.isArray(claims.amr) ? claims.amr.map(String) : [];
    for (const method of options.requiredAmr ?? []) if (!amr.includes(method)) throw new OidcValidationError('AMR step-up requirement not met');
    return true;
  }
}

export type SamlBoundaryConfiguration = { issuer: string; audience: string };

export function validateSamlBoundary(response: { issuer: string; audience: string; signed: boolean; notBefore?: Date; notOnOrAfter?: Date }, configuration: SamlBoundaryConfiguration, now = new Date()) {
  if (!response.signed || response.issuer !== configuration.issuer || response.audience !== configuration.audience) throw new OidcValidationError('SAML boundary assertion rejected');
  if (response.notBefore && response.notBefore > now) throw new OidcValidationError('SAML assertion is not active');
  if (response.notOnOrAfter && response.notOnOrAfter <= now) throw new OidcValidationError('SAML assertion expired');
  return true;
}
