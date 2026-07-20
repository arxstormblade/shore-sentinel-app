import { emitManagedSshFailure, withTimeout } from './managedSshProcessor.js';

export const LIFECYCLE_DELIVERY_ATTEMPTS = 3;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function handleManagedSshFailure({
  job, error, api, maxAttempts, lifecycleEventTimeoutMs,
  deliveryAttempts = LIFECYCLE_DELIVERY_ATTEMPTS, sleep = delay,
  failureState = error?.managedSshFailure,
}) {
  // A cancelled run revokes its grant. Never attempt a late retry/failed event:
  // it cannot transition a terminal run and must not keep the Bull job alive.
  try {
    const control = await withTimeout(api.getRunControl(job.data?.runId), lifecycleEventTimeoutMs, 'worker run control');
    if (control?.cancelled) return { cancelled: true, delivered: false };
  } catch {
    // Control is indeterminate, not cancellation. Preserve finite lifecycle
    // delivery and then let BullMQ handle its persisted retry policy.
  }

  for (let deliveryAttempt = 1; deliveryAttempt <= deliveryAttempts; deliveryAttempt += 1) {
    try {
      const delivered = await emitManagedSshFailure(job, api, {
        maxAttempts,
        error,
        lifecycleEventTimeoutMs,
        failureState,
      });
      return { cancelled: false, delivered };
    } catch (emitError) {
      if (deliveryAttempt === deliveryAttempts) return { cancelled: false, delivered: false };
      await sleep(1000);
    }
  }
  return { cancelled: false, delivered: false };
}