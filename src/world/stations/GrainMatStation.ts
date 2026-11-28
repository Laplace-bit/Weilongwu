import { evaluateLivingBehavior } from '../../engine/livingBehavior';
import type { EnvState, GrainMatState, WeatherType } from '../types';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/**
 * Progressive Grain-Drying & Urgent Rain-Gathering Station State Machine.
 * Supports both continuous real-time farmer labor (`tick`) and deterministic
 * instant timeline scrubbing (`seekTo`).
 */
export class GrainMatStation {
  public spreadProgress = 1.0;
  public basketFill = 0.08;
  public matDeployed = 1.0;
  public farmerHomeBlend = 0.0;
  public isGathering = false;
  public phase: GrainMatState['phase'] = 'drying';

  public seekTo(timeOfDay: number, weather: WeatherType): GrainMatState {
    const b = evaluateLivingBehavior(timeOfDay, weather);
    this.spreadProgress = b.grainSpreadProgress;
    this.basketFill = b.grainBasketFill;
    this.matDeployed = b.grainMatDeployed;
    this.farmerHomeBlend = b.farmerHomeBlend;
    this.isGathering = b.farmerPhase === 'gathering';
    this.phase = b.farmerPhase;
    return this.getState();
  }

  public tick(dt: number, env: EnvState): GrainMatState {
    if (env.isScrubbing) {
      return this.seekTo(env.timeOfDay, env.weather);
    }

    const b = evaluateLivingBehavior(env.timeOfDay, env.weather);
    const targetSpread = b.grainSpreadProgress;
    const targetMat = b.grainMatDeployed;
    const spreadDiff = targetSpread - this.spreadProgress;

    // Smooth ~4.2s full grain sweep on rain onset so players witness urgent gathering
    const sweepRate = env.weather === 'rain' ? 0.25 : 0.19;
    if (Math.abs(spreadDiff) > 0.004) {
      this.spreadProgress +=
        Math.sign(spreadDiff) * Math.min(Math.abs(spreadDiff), dt * sweepRate);
    } else {
      this.spreadProgress = targetSpread;
    }

    // Bamboo mats roll up only after grain is swept (< 0.08), and unroll before grain spreads
    if (targetMat < 0.5 && this.spreadProgress < 0.08) {
      this.matDeployed = Math.max(targetMat, this.matDeployed - dt * 0.48);
    } else if (targetMat > 0.5) {
      this.matDeployed = Math.min(targetMat, this.matDeployed + dt * 0.55);
    } else {
      this.matDeployed = damp(this.matDeployed, targetMat, 2.2, dt);
    }

    const targetBasket =
      this.matDeployed < 0.15 && b.farmerHomeBlend > 0.6
        ? 0.06
        : clamp(0.08 + (1 - this.spreadProgress) * 0.92, 0.06, 1.0);
    this.basketFill = damp(this.basketFill, targetBasket, 3.0, dt);

    // Farmers remain at the mats actively raking until grain is gathered & mats rolled up
    const effectiveFarmerHomeTarget =
      this.spreadProgress > 0.06 || (targetMat < 0.5 && this.matDeployed > 0.12)
        ? 0
        : b.farmerHomeBlend;
    this.farmerHomeBlend = damp(this.farmerHomeBlend, effectiveFarmerHomeTarget, 1.4, dt);

    this.isGathering =
      (env.weather === 'rain' && this.spreadProgress > 0.02) ||
      (spreadDiff < -0.01 && this.spreadProgress > 0.02);

    if (this.isGathering) {
      this.phase = 'gathering';
    } else if (spreadDiff > 0.01 && this.spreadProgress < 0.96) {
      this.phase = 'spreading';
    } else if (this.spreadProgress > 0.15) {
      this.phase = 'drying';
    } else {
      this.phase = 'stowed';
    }

    return this.getState();
  }

  public getState(): GrainMatState {
    return {
      spreadProgress: this.spreadProgress,
      basketFill: this.basketFill,
      matDeployed: this.matDeployed,
      isGathering: this.isGathering,
      farmerHomeBlend: this.farmerHomeBlend,
      phase: this.phase,
    };
  }
}
