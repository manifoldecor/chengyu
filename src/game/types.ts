export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export interface Card {
  id: string; text: string; pinyin: string; meaning: string;
  rarity: Rarity; monster: string; name: string;
  tags: string[];
  art?: string;            // URL of an illustration from content/art (the emoji is used when absent)
  story?: string;
  price?: number;          // buyable in the shop for this much ink
  exclusive?: boolean;     // never drops from packs
}
export interface SaveData {
  version: 1;
  owned: Record<string, number>;   // card id -> copies obtained
  ink: number;
  lastDaily: string;               // YYYY-MM-DD, '' if never
  streak: number;
  pity: number;                    // packs since last epic+
  lastIdle: number;                // epoch ms
  /** A pack that has been rolled but not yet shown to the player (survives reloads, prevents re-rolling). */
  pending?: { cardId: string; isNew: boolean; inkGained: number; bonus: number } | null;
}
export interface PackDef { id: string; name: string; cost: number; weights: Record<Rarity, number>; tags?: string[]; }
export interface PullResult { card: Card; isNew: boolean; inkGained: number; }
