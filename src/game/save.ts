import { SaveData } from './types';

const KEY = 'chengyu-monsters-save';

export const freshSave = (): SaveData => ({
  version: 1, owned: {}, ink: 0, lastDaily: '', streak: 0, pity: 0, lastIdle: Date.now(),
});

export function load(storage: Pick<Storage, 'getItem'> = localStorage): SaveData {
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d.version === 1) return { ...freshSave(), ...d };
    }
  } catch { /* corrupt save -> fresh */ }
  return freshSave();
}

export function save(d: SaveData, storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(KEY, JSON.stringify(d));
}
