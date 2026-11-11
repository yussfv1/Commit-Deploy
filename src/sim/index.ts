/**
 * Вход в симуляцию для остального кода.
 *
 *   import { Simulation } from './sim';
 *   const sim = new Simulation();
 *   sim.loadLevel(level, defs);
 *
 * Дальше — только методы ISimulation из src/types.ts.
 */
export { Simulation } from './simulation';
export { LevelError, validateLevel } from './level';
export { MAX_WAIT, blockSteps, hasSensor, isActionOp, isMoveOp, normalizeProgram } from './program';
