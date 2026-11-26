import { CONTENT } from '../content';
import { SaveData } from './types';

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function dayDiff(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

export const canClaimDaily = (s: SaveData, now: Date) => s.lastDaily !== dateKey(now);

/** Updates streak + lastDaily; returns the bonus ink for this streak day (the best matching rule in game.json). */
export function claimDaily(s: SaveData, now: Date): number {
  const today = dateKey(now);
  s.streak = s.lastDaily && dayDiff(s.lastDaily, today) === 1 ? s.streak + 1 : 1;
  s.lastDaily = today;
  return CONTENT.config.streakBonuses.reduce((best, b) => (s.streak % b.every === 0 ? Math.max(best, b.ink) : best), 0);
}
