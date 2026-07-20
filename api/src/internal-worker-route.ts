const WORKER_SERVICE_ROUTES: ReadonlyArray<readonly [string, RegExp]> = [
  ['POST', /^\/runs\/[^/]+\/events$/],
  ['POST', /^\/artifacts$/],
  ['POST', /^\/internal\/worker\/runs\/[^/]+\/ssh-grant$/],
  ['POST', /^\/internal\/worker\/artifact-cleanup\/reconcile$/],
  ['GET', /^\/internal\/worker\/runs\/[^/]+\/control$/],
];

/**
 * Routes that use the worker service credential rather than an end-user
 * session. Each controller still verifies INTERNAL_WORKER_TOKEN before work.
 */
export function isInternalWorkerServiceRoute(method: string, path: string) {
  return WORKER_SERVICE_ROUTES.some(([allowedMethod, pattern]) => allowedMethod === method && pattern.test(path));
}
