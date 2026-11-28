import type { Stimulus, StimulusEmitInput, StimulusType } from '../types';

/**
 * Decoupled Global Spatial Stimulus & Event Bus.
 * Props, weather changes, player movement, and animals emit typed spatial
 * stimuli; actors subscribe & react based on radius and priority rules without
 * holding hard references to each other.
 */
export class StimulusBus {
  private nextId = 1;
  private active: Stimulus[] = [];
  private readonly queryScratch: Stimulus[] = [];

  public emit(input: StimulusEmitInput): Stimulus {
    const ttl = input.ttl ?? 2.5;
    const stimulus: Stimulus = {
      id: this.nextId++,
      type: input.type,
      position: {
        x: input.position.x,
        y: input.position.y,
        z: input.position.z,
      },
      radius: Math.max(0, input.radius),
      intensity: input.intensity ?? 1.0,
      sourceId: input.sourceId,
      ttl,
      remaining: ttl,
      payload: input.payload,
    };

    // Coalesce frequent identical continuous stimuli from the same source (e.g. PLAYER_NEAR / FOOTSTEP_FAST)
    for (let i = 0; i < this.active.length; i++) {
      const existing = this.active[i];
      if (existing.type === stimulus.type && existing.sourceId === stimulus.sourceId) {
        existing.position.x = stimulus.position.x;
        existing.position.y = stimulus.position.y;
        existing.position.z = stimulus.position.z;
        existing.radius = stimulus.radius;
        existing.intensity = Math.max(existing.intensity, stimulus.intensity);
        existing.ttl = stimulus.ttl;
        existing.remaining = stimulus.ttl;
        existing.payload = stimulus.payload;
        return existing;
      }
    }

    this.active.push(stimulus);
    return stimulus;
  }

  public tick(dt: number): void {
    const safeDt = Math.max(0, Math.min(0.1, dt));
    for (let i = this.active.length - 1; i >= 0; i--) {
      this.active[i].remaining -= safeDt;
      if (this.active[i].remaining <= 0) {
        this.active.splice(i, 1);
      }
    }
  }

  public clear(): void {
    this.active.length = 0;
  }

  public getAll(): readonly Stimulus[] {
    return this.active;
  }

  /**
   * Find stimuli affecting a point `(x, y, z)`.
   * Global stimuli (`radius <= 0` or `radius >= 900`) always match.
   */
  public queryNear(
    x: number,
    y: number,
    z: number,
    types?: readonly StimulusType[]
  ): readonly Stimulus[] {
    this.queryScratch.length = 0;
    for (let i = 0; i < this.active.length; i++) {
      const s = this.active[i];
      if (types && !types.includes(s.type)) continue;
      if (s.radius <= 0 || s.radius >= 900) {
        this.queryScratch.push(s);
        continue;
      }
      const dx = x - s.position.x;
      const dy = y - s.position.y;
      const dz = z - s.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq <= s.radius * s.radius) {
        this.queryScratch.push(s);
      }
    }
    return this.queryScratch;
  }

  public findStrongestNear(
    x: number,
    y: number,
    z: number,
    type: StimulusType,
    radiusOverride?: number
  ): Stimulus | null {
    let best: Stimulus | null = null;
    let bestScore = -1;
    for (let i = 0; i < this.active.length; i++) {
      const s = this.active[i];
      if (s.type !== type) continue;
      const effectiveR = radiusOverride ?? s.radius;
      if (effectiveR > 0 && effectiveR < 900) {
        const dx = x - s.position.x;
        const dy = y - s.position.y;
        const dz = z - s.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > effectiveR * effectiveR) continue;
        const falloff = 1 - Math.sqrt(distSq) / Math.max(0.001, effectiveR);
        const score = s.intensity * (0.4 + 0.6 * falloff);
        if (score > bestScore) {
          bestScore = score;
          best = s;
        }
      } else {
        if (s.intensity > bestScore) {
          bestScore = s.intensity;
          best = s;
        }
      }
    }
    return best;
  }
}
