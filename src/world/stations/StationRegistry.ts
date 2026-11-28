import stationsConfig from '../configs/stations.json';
import type {
  StationDef,
  StationSlotDef,
  Stimulus,
  Vec3,
} from '../types';
import type { StimulusBus } from '../core/StimulusBus';

export interface StationSlotReservation {
  stationId: string;
  slot: StationSlotDef;
  actorId: string;
}

/**
 * Unified Station & Smart-Object Registry.
 * Manages all work spots, benches, rooms, animal coops/pens, containers, and
 * `[E]` interactable objects with atomic slot-locking and decoupled StimulusBus
 * emission (props never hold direct references to fish, birds, or villagers).
 */
export class StationRegistry {
  private readonly stations = new Map<string, StationDef>();
  private readonly interactableToStation = new Map<string, StationDef>();
  private readonly slotOwners = new Map<string, string>(); // slotKey -> actorId
  private readonly actorSlot = new Map<string, { stationId: string; slotId: string }>();
  private readonly stationProgress = new Map<string, number>();

  constructor(defs?: readonly StationDef[]) {
    const source = defs ?? (stationsConfig.stations as unknown as StationDef[]);
    for (let i = 0; i < source.length; i++) {
      this.registerStation(source[i]);
    }
  }

  public registerStation(def: StationDef): void {
    this.stations.set(def.id, def);
    if (def.interactableId) {
      this.interactableToStation.set(def.interactableId, def);
    }
    if (!this.stationProgress.has(def.id)) {
      this.stationProgress.set(def.id, 0);
    }
  }

  public getStation(id: string): StationDef | undefined {
    return this.stations.get(id);
  }

  public getAllStations(): readonly StationDef[] {
    return Array.from(this.stations.values());
  }

  public getByInteractableId(interactableId: string): StationDef | undefined {
    return this.interactableToStation.get(interactableId);
  }

  public setProgress(stationId: string, progress: number): void {
    this.stationProgress.set(stationId, Math.max(0, Math.min(1, progress)));
  }

  public getProgress(stationId: string): number {
    return this.stationProgress.get(stationId) ?? 0;
  }

  /**
   * Atomically reserve a free slot at a station for `actorId`.
   * Prevents two actors from sitting on the same bench/table seat or roost slot.
   */
  public acquireSlot(
    stationId: string,
    actorId: string,
    preferredSlotId?: string
  ): StationSlotDef | null {
    const station = this.stations.get(stationId);
    if (!station || station.slots.length === 0) return null;

    // Already holds a slot at this station? Return it idempotently.
    const existing = this.actorSlot.get(actorId);
    if (existing && existing.stationId === stationId) {
      const held = station.slots.find((s) => s.slotId === existing.slotId);
      if (held) return held;
    }

    // Release any slot held at another station first
    if (existing) {
      this.releaseSlot(actorId);
    }

    if (preferredSlotId) {
      const pref = station.slots.find((s) => s.slotId === preferredSlotId);
      if (pref) {
        const key = `${stationId}:${pref.slotId}`;
        const owner = this.slotOwners.get(key);
        if (!owner || owner === actorId) {
          this.slotOwners.set(key, actorId);
          this.actorSlot.set(actorId, { stationId, slotId: pref.slotId });
          return pref;
        }
      }
    }

    for (let i = 0; i < station.slots.length; i++) {
      const slot = station.slots[i];
      const key = `${stationId}:${slot.slotId}`;
      const owner = this.slotOwners.get(key);
      if (!owner || owner === actorId) {
        this.slotOwners.set(key, actorId);
        this.actorSlot.set(actorId, { stationId, slotId: slot.slotId });
        return slot;
      }
    }
    return null;
  }

  public releaseSlot(actorId: string): void {
    const existing = this.actorSlot.get(actorId);
    if (!existing) return;
    const key = `${existing.stationId}:${existing.slotId}`;
    if (this.slotOwners.get(key) === actorId) {
      this.slotOwners.delete(key);
    }
    this.actorSlot.delete(actorId);
  }

  public getSlotOwner(stationId: string, slotId: string): string | undefined {
    return this.slotOwners.get(`${stationId}:${slotId}`);
  }

  public getActorReservation(actorId: string): StationSlotReservation | null {
    const entry = this.actorSlot.get(actorId);
    if (!entry) return null;
    const station = this.stations.get(entry.stationId);
    if (!station) return null;
    const slot = station.slots.find((s) => s.slotId === entry.slotId);
    if (!slot) return null;
    return { stationId: entry.stationId, slot, actorId };
  }

  public releaseAllSlots(): void {
    this.slotOwners.clear();
    this.actorSlot.clear();
  }

  /**
   * Decoupled `[E]` interaction hook: emits the configured spatial stimulus
   * onto `StimulusBus` so affected animals/villagers react automatically.
   */
  public triggerInteraction(
    interactableId: string,
    stimulusBus: StimulusBus,
    overridePos?: Vec3
  ): Stimulus | null {
    const station = this.interactableToStation.get(interactableId);
    if (!station || !station.emitStimulusOnInteract) {
      return null;
    }
    const cfg = station.emitStimulusOnInteract;
    const pos = overridePos ?? station.position;
    return stimulusBus.emit({
      type: cfg.type,
      position: pos,
      radius: cfg.radius,
      intensity: cfg.intensity,
      sourceId: station.id,
      ttl: cfg.ttl,
      payload: { interactableId },
    });
  }
}
