import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isSeededCharacter } from "@/lib/new-user";

// Deterministic base count derived from character id, so it never changes
// between refreshes. Increments only when the user actually chats.
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

async function fetchCount(table: string, charId: string): Promise<number> {
  const { count } = await (supabase as any)
    .from(table)
    .select("user_id", { count: "exact", head: true })
    .eq("character_id", charId);
  return count ?? 0;
}

export function useLikeCount(charId: string): number {
  const [own, setOwn] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchCount("user_likes", charId).then((n) => !cancelled && setOwn(n));
    return () => { cancelled = true; };
  }, [charId]);
  return baseLikeCount(charId) + own;
}

export function useSaveCount(charId: string): number {
  const [own, setOwn] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchCount("user_saves", charId).then((n) => !cancelled && setOwn(n));
    return () => { cancelled = true; };
  }, [charId]);
  return baseSaveCount(charId) + own;
}

const cache = new Map<string, number>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

async function fetchOwn(charId: string): Promise<number> {
  const { count } = await (supabase as any)
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("character_id", charId);
  return count ?? 0;
}

export async function refreshChatCount(charId: string) {
  const n = await fetchOwn(charId);
  cache.set(charId, n);
  notify();
  return n;
}

export function useChatCount(charId: string): number {
  const [own, setOwn] = useState<number>(() => cache.get(charId) ?? 0);

  useEffect(() => {
    let cancelled = false;
    const listener = () => {
      if (!cancelled) setOwn(cache.get(charId) ?? 0);
    };
    listeners.add(listener);
    if (!cache.has(charId)) {
      fetchOwn(charId).then((n) => {
        if (cancelled) return;
        cache.set(charId, n);
        setOwn(n);
      });
    }
    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, [charId]);

  return baseChatCount(charId) + own;
}
