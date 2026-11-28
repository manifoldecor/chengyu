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
  sprite?: string;         // name of a cut-out sprite from content/sprites used as the picture
  artFit?: 'cover' | 'contain';   // 'contain' = show the whole picture (sprites); default fills the panel
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
  pending?: { cardId: string; isNew: boolean; inkGained: number; bonus: number; packId?: string } | null;
}
export interface PackDef {
  id: string; name: string; cost: number; weights: Record<Rarity, number>;
  tags?: string[];          // draw only from cards with one of these tags
  cards?: string[];         // or draw only from these hand-picked cards (ids)
  icon?: string;            // emoji shown on the pack
  color?: string;           // "#rrggbb" pack colour
  description?: string;     // one line shown in the shop
  sprite?: string;          // name of a sprite from content/sprites used as the pack's picture
  image?: string;           // resolved picture URL (the pack's own file in content/packs, or its sprite)
}
export interface PullResult { card: Card; isNew: boolean; inkGained: number; }
