import type { AuthService } from './auth.service.js';

export type RequestPrincipal = {
  userId: string;
  tenantId: string;
  roles: string[];
};

type SessionRequest = {
  cookies?: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  principal?: RequestPrincipal;
};

type SessionResponse = {
  status(statusCode: number): { json(body: unknown): unknown };
};

function tokenFrom(req: SessionRequest) {
  const cookieToken = req.cookies?.shore_session;
  const auth = req.headers.authorization;
  const authValue = Array.isArray(auth) ? auth[0] : auth;
  return cookieToken ?? (authValue?.startsWith('Bearer ') ? authValue.slice(7) : undefined);
}

function principalFrom(user: unknown): RequestPrincipal | null {
  if (!user || typeof user !== 'object') return null;
  const candidate = user as { id?: unknown; tenant_id?: unknown; roles?: unknown };
  if (typeof candidate.id !== 'string' || !candidate.id || typeof candidate.tenant_id !== 'string' || !candidate.tenant_id) return null;
  if (!Array.isArray(candidate.roles) || candidate.roles.some((role) => typeof role !== 'string')) return null;
  return { userId: candidate.id, tenantId: candidate.tenant_id, roles: candidate.roles };
}

/** Validates the server-side session before attaching a request-local tenant binding. */
export async function attachSessionPrincipal(auth: Pick<AuthService, 'me'>, req: SessionRequest, res: SessionResponse, next: () => unknown) {
  try {
    const principal = principalFrom(await auth.me(tokenFrom(req)));
    if (!principal) throw new Error('invalid session principal');
    req.principal = principal;
    return next();
  } catch {
    return res.status(401).json({ statusCode: 401, message: 'Authentication required', error: 'Unauthorized' });
  }
}
