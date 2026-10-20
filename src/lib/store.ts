import { useEffect, useState } from "react";
import type { SessionData } from "./types";

const KEY = "stridelab.session.v1";
const PREFS = "stridelab.prefs.v1";

/** Browser storage can be unavailable (private mode, blocked site data). */
function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the app still works for this visit */
  }
}

export function usePersistentSession() {
  const [session, setSession] = useState<SessionData | undefined>(() => read<SessionData>(KEY));
  useEffect(() => write(KEY, session), [session]);
  return [session, setSession] as const;
}

export interface Prefs {
  theme: "auto" | "light" | "dark";
  material: "liquid" | "frosted" | "solid";
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => ({ theme: "auto", material: "liquid", ...read<Prefs>(PREFS) }));
  useEffect(() => write(PREFS, prefs), [prefs]);
  return [prefs, setPrefs] as const;
}

export function sessionValue(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
export function setSessionValue(key: string, v: string) {
  try {
    if (v) sessionStorage.setItem(key, v);
    else sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
