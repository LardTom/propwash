import { javaEnum } from './Enum.js?v=d8aa4520';

// Port of de.lardtom.propwash.sim.PidLoopRate (enum). divider() and hz() stay methods.
// DroneSim is not part of this port batch; only its PHYSICS_HZ constant is needed here (Java: DroneSim.PHYSICS_HZ = 2000).
const DroneSim = { PHYSICS_HZ: 2000 };

const DIVIDER = { HZ_2000: 1, HZ_1000: 2, HZ_500: 4 };

export const PidLoopRate = javaEnum(['HZ_2000', 'HZ_1000', 'HZ_500'], (c) => ({
  divider: () => DIVIDER[c.name],
  hz: () => DroneSim.PHYSICS_HZ / DIVIDER[c.name],
}));
