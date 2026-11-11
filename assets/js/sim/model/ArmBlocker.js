import { javaEnum } from './Enum.js?v=d8aa4520';

// Java: bit() and isSet(mask) are methods; kept as methods here.
export const ArmBlocker = javaEnum(['ARM_SWITCH_NOT_RESET', 'THROTTLE_NOT_LOW', 'TILTED', 'PACK_DEPLETED', 'BUILD_INVALID',
  'CRASH_COOLDOWN', 'FAILSAFE', 'REBOOTING', 'IN_FLUID', 'HARDWARE_FAULT', 'THROTTLE_NOT_CENTERED', 'TURTLE_AIRBORNE'], (c) => ({
  bit: () => 1 << c.ordinal,
  isSet: (mask) => (mask & (1 << c.ordinal)) !== 0,
}));
