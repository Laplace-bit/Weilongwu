import type { EnvState, WeatherType } from '../types';

export interface WorldClockOptions {
  timeOfDay?: number;
  timeScale?: number;
  weather?: WeatherType;
  isPlaying?: boolean;
  doumenOpen?: boolean;
}

/**
 * Single Source of Truth for simulation time, playback speed, weather state,
 * and timeline scrubbing (`isScrubbing`).
 */
export class WorldClock {
  private _timeOfDay: number;
  private _timeScale: number;
  private _weather: WeatherType;
  private _isPlaying: boolean;
  private _isScrubbing = false;
  private _doumenOpen: boolean;
  private _elapsedTime = 0;
  private _weatherChangedFlag = false;
  private _previousWeather: WeatherType;
  private _scrubJumpFlag = false;

  constructor(opts: WorldClockOptions = {}) {
    this._timeOfDay = this.wrapHour(opts.timeOfDay ?? 10.5);
    this._timeScale = opts.timeScale ?? 1.0;
    this._weather = opts.weather ?? 'sunny';
    this._previousWeather = this._weather;
    this._isPlaying = opts.isPlaying ?? true;
    this._doumenOpen = opts.doumenOpen ?? true;
  }

  private wrapHour(hour: number): number {
    if (!Number.isFinite(hour)) return 10.5;
    const h = hour % 24;
    return h < 0 ? h + 24 : h;
  }

  public getState(): EnvState {
    return {
      timeOfDay: this._timeOfDay,
      timeScale: this._timeScale,
      weather: this._weather,
      isPlaying: this._isPlaying,
      isScrubbing: this._isScrubbing,
      doumenOpen: this._doumenOpen,
      elapsedTime: this._elapsedTime,
    };
  }

  public get timeOfDay(): number {
    return this._timeOfDay;
  }

  public get weather(): WeatherType {
    return this._weather;
  }

  public get isScrubbing(): boolean {
    return this._isScrubbing;
  }

  public get isPlaying(): boolean {
    return this._isPlaying;
  }

  public get timeScale(): number {
    return this._timeScale;
  }

  public get doumenOpen(): boolean {
    return this._doumenOpen;
  }

  public get elapsedTime(): number {
    return this._elapsedTime;
  }

  public setScrubbing(active: boolean): void {
    this._isScrubbing = active;
  }

  public setPlaying(playing: boolean): void {
    this._isPlaying = playing;
  }

  public setTimeScale(scale: number): void {
    this._timeScale = Math.max(0, Math.min(20, scale));
  }

  public setDoumenOpen(open: boolean): void {
    this._doumenOpen = open;
  }

  /**
   * Synchronize external timeOfDay (e.g. from React HUD or WeilongScene) and
   * detect large non-continuous timeline jumps automatically.
   */
  public syncExternalTime(hour: number, explicitScrub = false): boolean {
    const next = this.wrapHour(hour);
    const delta = Math.abs(next - this._timeOfDay);
    const wrappedDelta = Math.min(delta, 24 - delta);
    const isJump = explicitScrub || this._isScrubbing || wrappedDelta > 0.3;
    this._timeOfDay = next;
    if (isJump) {
      this._scrubJumpFlag = true;
    }
    return isJump;
  }

  public seekTo(hour: number, weather?: WeatherType): EnvState {
    this._timeOfDay = this.wrapHour(hour);
    this._scrubJumpFlag = true;
    if (weather && weather !== this._weather) {
      this._previousWeather = this._weather;
      this._weather = weather;
      this._weatherChangedFlag = true;
    }
    return this.getState();
  }

  public setWeather(weather: WeatherType): boolean {
    if (weather === this._weather) return false;
    this._previousWeather = this._weather;
    this._weather = weather;
    this._weatherChangedFlag = true;
    return true;
  }

  public advance(dt: number, hoursPerRealSec = 0): EnvState {
    const clampedDt = Math.max(0, Math.min(0.05, dt));
    this._elapsedTime += clampedDt;
    if (this._isPlaying && !this._isScrubbing && hoursPerRealSec > 0) {
      this._timeOfDay = this.wrapHour(
        this._timeOfDay + clampedDt * hoursPerRealSec * this._timeScale
      );
    }
    return this.getState();
  }

  public consumeWeatherChange(): { changed: boolean; from: WeatherType; to: WeatherType } {
    const changed = this._weatherChangedFlag;
    this._weatherChangedFlag = false;
    return { changed, from: this._previousWeather, to: this._weather };
  }

  public consumeScrubJump(): boolean {
    const jumped = this._scrubJumpFlag;
    this._scrubJumpFlag = false;
    return jumped;
  }

  public isNight(): boolean {
    return this._timeOfDay < 5.8 || this._timeOfDay >= 19.2;
  }

  public isClearNight(): boolean {
    return this._weather === 'sunny' && (this._timeOfDay < 5.5 || this._timeOfDay >= 19.4);
  }
}
