import { setTimeout as nativeSchedule, clearTimeout as nativeCancel } from 'node:timers';
import { hrtime } from 'node:process';
import { createServiceCreditApplicationDeadlineOwnerCore } from './service-credit-application-deadline-owner-core.js';
import { types as utilTypes } from 'node:util';

const SCHEDULE = nativeSchedule, CANCEL = nativeCancel, NOW = hrtime.bigint;
const CORE = createServiceCreditApplicationDeadlineOwnerCore, APPLY = Reflect.apply, FREEZE = Object.freeze;
const DESC = Object.getOwnPropertyDescriptor, KEYS = Reflect.ownKeys, IS_PROXY = utilTypes.isProxy;

/**
 * Default-off real deadline binding for the actual HTTPS application host.
 * No injected timer/clock. Construction schedules nothing. Native arm/cancel/
 * monotonic capabilities are captured here and passed privately to the core.
 * Pure-core results do NOT qualify these native bindings or the host.
 * Service cancel remains void; ingress cancel remains boolean.
 */
export function createServiceCreditNativeApplicationDeadlineOwner(configuration) {
  if (arguments.length !== 1 || configuration === null || typeof configuration !== 'object'
      || IS_PROXY(configuration) || Object.getPrototypeOf(configuration) !== Object.prototype
      || KEYS(configuration).length !== 3) fail();
  const captured = {};
  for (const key of ['maxScheduleStarts','maxConcurrentTimers','maxDelayMs']) {
    const d = DESC(configuration, key);
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) fail();
    Object.defineProperty(captured, key, { value: d.value, enumerable: true });
  }
  const owner = CORE({ ...captured,
    armTimer: FREEZE((callback, milliseconds) => APPLY(SCHEDULE, undefined, [callback, milliseconds])),
    cancelTimer: FREEZE(handle => APPLY(CANCEL, undefined, [handle])),
    readMonotonicTime: FREEZE(() => APPLY(NOW, hrtime, [])),
  });
  configuration = null;
  return FREEZE({ ingressRuntime: owner.ingressRuntime, serviceRuntime: owner.serviceRuntime, close: owner.close,
    snapshot: FREEZE(function snapshot() {
      if (arguments.length !== 0) fail();
      const core = owner.snapshot();
      return FREEZE({ ...core, core, nativeBinding: true, runtimeQualified: false,
        nativeIoPerformed: core.armCalls !== 0 || core.cancelCalls !== 0 || core.clockReadAttempts !== 0,
        cancellationFailed: core.controlUncertain });
    }) });
}
function fail() {
  const code = 'SERVICE_CREDIT_NATIVE_APPLICATION_DEADLINE_INPUT_REJECTED', e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); throw FREEZE(e);
}

