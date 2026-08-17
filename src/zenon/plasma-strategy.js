/**
 * Planning policy for obtaining and applying Plasma information.
 *
 * A quote is internal planning evidence. apply() returns the block state that
 * the transaction planner will prepare further; neither method signs or
 * publishes a block.
 */
export class PlasmaStrategy {
  async quote(_context) {
    return notImplemented('PlasmaStrategy', 'quote()');
  }

  async apply(_context, _quote) {
    return notImplemented('PlasmaStrategy', 'apply()');
  }
}

export function assertPlasmaStrategy(value) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    throw new TypeError('PlasmaStrategy must be an object');
  }
  for (const method of ['quote', 'apply']) {
    if (typeof value[method] !== 'function') {
      throw new TypeError(`PlasmaStrategy.${method}() must be implemented`);
    }
  }
  return value;
}

function notImplemented(contract, method) {
  throw new TypeError(`${contract}.${method} must be implemented`);
}
