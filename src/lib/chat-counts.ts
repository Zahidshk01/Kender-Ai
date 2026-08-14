import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isSeededCharacter } from "@/lib/new-user";

// Deterministic base count derived from character id, so it never changes
// between refreshes. Increments only when users actually chat.
export function baseChatCount(id: string): number {
  if (!isSeededCharacter(id)) return 0;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 1,000 – 150,999 range, stable per id
  return 1000 + (Math.abs(h) % 150000);
}

function hashSalt(id: string, salt: string): number {
  let h = 2166136261;
  const s = id + "|" + salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// Deterministic engagement baselines, stable per character id.
export function baseLikeCount(id: string): number {
  if (!isSeededCharacter(id)) return 0;
  return 5000 + (hashSalt(id, "likes") % 40000);
}
export function baseSaveCount(id: string): number {
  if (!isSeededCharacter(id)) return 0;
  return 200 + (hashSalt(id, "saves") % 3800);
}

// ---------------------------------------------------------------------------
// Global (all users) engagement stats, read through a security-definer RPC so
// every visitor sees the same live like / save / chat totals.
// ---------------------------------------------------------------------------

export type CharacterStats = { likes: number; saves: number; chats: number };

const EMPTY: CharacterStats = { likes: 0, saves: 0, chats: 0 };

const cache = new Map<string, CharacterStats>();
const inflight = new Map<string, Promise<CharacterStats>>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

async function fetchStats(ids: string[]): Promise<Map<string, CharacterStats>> {
  const out = new Map<string, CharacterStats>();
  if (ids.length === 0) return out;
  const { data } = await (supabase as any).rpc("character_stats", { _ids: ids });
  for (const row of (data ?? []) as any[]) {
    out.set(String(row.character_id), {
      likes: Number(row.likes ?? 0),
      saves: Number(row.saves ?? 0),
      chats: Number(row.chats ?? 0),
    });
  }
  for (const id of ids) if (!out.has(id)) out.set(id, EMPTY);
  return out;
}

function loadStats(id: string): Promise<CharacterStats> {
  const existing = inflight.get(id);
  if (existing) return existing;
  const p = fetchStats([id])
    .then((m) => {
      const stats = m.get(id) ?? EMPTY;
      cache.set(id, stats);
      notify();
      return stats;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

/** Re-read the global counters for a character (call after like/save/chat). */
export async function refreshStats(id: string) {
  if (!id) return EMPTY;
  inflight.delete(id);
  return loadStats(id);
}

/** Back-compat alias used after sending a chat message. */
export const refreshChatCount = refreshStats;

function useStats(id: string): CharacterStats {
  const [stats, setStats] = useState<CharacterStats>(() => cache.get(id) ?? EMPTY);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const listener = () => {
      if (!cancelled) setStats(cache.get(id) ?? EMPTY);
    };
    listeners.add(listener);
    setStats(cache.get(id) ?? EMPTY);
    if (!cache.has(id)) loadStats(id);
    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, [id]);

  return stats;
}

export function useLikeCount(charId: string): number {
  return baseLikeCount(charId) + useStats(charId).likes;
}

export function useSaveCount(charId: string): number {
  return baseSaveCount(charId) + useStats(charId).saves;
}

export function useChatCount(charId: string): number {
  return baseChatCount(charId) + useStats(charId).chats;
}

// Sum of the exact chat counts shown on each of the owner's character cards.
export function useOwnedCharactersChatSum(ownedIds: string[]): number {
  const key = ownedIds.join(",");
  const [live, setLive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setLive(0);
      return;
    }
    fetchStats(ids).then((m) => {
      if (cancelled) return;
      let sum = 0;
      m.forEach((s, id) => {
        cache.set(id, s);
        sum += s.chats;
      });
      notify();
      setLive(sum);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const base = (key ? key.split(",") : []).reduce((acc, id) => acc + baseChatCount(id), 0);
  return base + live;
}

// Total conversations (across all users) with the characters owned by `ownerId`,
// plus the deterministic baselines of any seeded characters they own.
export function useOwnerChatTotal(ownerId: string | null, ownedIds: string[]): number {
  const [live, setLive] = useState(0);
  useEffect(() => {
    if (!ownerId) {
      setLive(0);
      return;
    }
    let cancelled = false;
    (supabase as any)
      .rpc("owner_character_chat_total", { _owner: ownerId })
      .then(({ data }: any) => {
        if (!cancelled) setLive(Number(data ?? 0));
      });
    return () => {
      cancelled = true;
    };
  }, [ownerId, ownedIds.length]);

  const base = ownedIds.reduce((acc, id) => acc + baseChatCount(id), 0);
  return base + live;
}
