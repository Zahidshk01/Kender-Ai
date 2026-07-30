import { characters as seededCharacters } from "@/lib/mock-data";

/**
 * Accounts created at or after this moment are treated as brand-new users:
 * they start with a completely empty app (0 followers, 0 following, 0 chats,
 * 0 likes/saves on anything they create). Older accounts keep the existing
 * seeded/baseline numbers so nothing changes for them.
 */
export const NEW_ACCOUNT_CUTOFF = Date.parse("2026-07-30T00:00:00Z");

export function isNewAccount(createdAt?: string | null): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t >= NEW_ACCOUNT_CUTOFF;
}

/** Ids of demo/seed characters that ship with the app. */
export const SEEDED_CHARACTER_IDS = new Set(seededCharacters.map((c) => c.id));

/** User-created characters have no synthetic engagement baseline. */
export function isSeededCharacter(id: string): boolean {
  return SEEDED_CHARACTER_IDS.has(id);
}
