"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { trpc } from "@/lib/trpc-client";
import { getUser } from "@/lib/client-auth";

type Prefs = Record<string, unknown>;

const LOCAL_STORAGE_MAP: Record<string, string> = {
  "theme": "theme",
  "cf-sidebar-mode": "sidebarMode",
  "cf-sidebar-modules-order": "sidebarModulesOrder",
  "cf-fab-mode": "fabMode",
  "ganttLeftPanelWidth": "ganttLeftPanelWidth",
  "gantt-fullscreen-preference": "ganttFullscreen",
  "calendar-type-preference": "calendarType",
};

const LOCAL_STORAGE_REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(LOCAL_STORAGE_MAP).map(([k, v]) => [v, k])
);

function hydrateFromLocalStorage(): Prefs {
  const prefs: Prefs = {
    calendarType: "BS",
  };
  for (const [localKey, prefKey] of Object.entries(LOCAL_STORAGE_MAP)) {
    const val = localStorage.getItem(localKey);
    if (val !== null) {
      try {
        prefs[prefKey] = JSON.parse(val);
      } catch {
        prefs[prefKey] = val;
      }
    }
  }
  return prefs;
}

function getDeep(obj: any, path: string): any {
  const keys = path.split(".");
  let current = obj;
  for (const key of keys) {
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }
  return current;
}

function setDeep(obj: any, path: string, value: any): any {
  const keys = path.split(".");
  const result = { ...obj };
  let current = result;
  for (let i = 0; i < keys.length - 1; i++) {
    current[keys[i]] = { ...(current[keys[i]] || {}) };
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
  return result;
}

type UserPreferencesContextType = {
  prefs: Prefs;
  getPref: <T>(key: string, defaultValue?: T) => T;
  setPref: (key: string, value: unknown) => void;
  ready: boolean;
};

const UserPreferencesContext = createContext<UserPreferencesContextType | null>(null);

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const prefsMutation = trpc.userPreferences.update.useMutation();

  const [prefs, setPrefs] = useState<Prefs>(() => {
    if (typeof window !== "undefined") {
      return hydrateFromLocalStorage();
    }
    return { calendarType: "BS" };
  });

  const [ready, setReady] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prefsRef = useRef<Prefs>(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  // Fetch server preferences on mount (once the app has an identity cache;
  // AppGuard only mounts children after /api/auth/me validated the cookie).
  const { data: serverPrefs } = trpc.userPreferences.get.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: typeof window !== "undefined" && !!getUser(),
  });

  useEffect(() => {
    if (serverPrefs) {
      setPrefs(prev => ({ calendarType: "BS", ...prev, ...serverPrefs }));
    }
    setReady(true);
  }, [serverPrefs]);

  const mutateRef = useRef(prefsMutation.mutate);
  useEffect(() => {
    mutateRef.current = prefsMutation.mutate;
  }, [prefsMutation.mutate]);

  const getPref = useCallback(<T,>(key: string, defaultValue?: T): T => {
    const val = getDeep(prefs, key);
    if (val !== undefined) return val as T;
    if (key === "calendarType" && defaultValue === undefined) {
      return "BS" as unknown as T;
    }
    return defaultValue as T;
  }, [prefs]);

  const setPref = useCallback((key: string, value: unknown) => {
    const currentVal = getDeep(prefsRef.current, key);
    if (JSON.stringify(currentVal) === JSON.stringify(value)) {
      return;
    }

    setPrefs(prev => setDeep(prev, key, value));

    if (typeof window !== "undefined") {
      const localKey = LOCAL_STORAGE_REVERSE_MAP[key];
      if (localKey) {
        localStorage.setItem(localKey, typeof value === "string" ? value : JSON.stringify(value));
      }
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      mutateRef.current({ preferences: prefsRef.current });
    }, 1000);
  }, []);

  return (
    <UserPreferencesContext.Provider value={{ prefs, getPref, setPref, ready }}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences(): UserPreferencesContextType {
  const ctx = useContext(UserPreferencesContext);
  if (ctx) {
    return ctx;
  }
  return {
    prefs: {},
    ready: false,
    getPref: <T,>(key: string, defaultValue?: T): T => {
      const localKey = LOCAL_STORAGE_REVERSE_MAP[key] || key;
      if (typeof window !== "undefined") {
        const val = localStorage.getItem(localKey);
        if (val !== null) {
          try { return JSON.parse(val) as T; } catch { return val as unknown as T; }
        }
      }
      return defaultValue as T;
    },
    setPref: (key: string, value: unknown) => {
      const localKey = LOCAL_STORAGE_REVERSE_MAP[key] || key;
      if (typeof window !== "undefined") {
        localStorage.setItem(localKey, typeof value === "string" ? value : JSON.stringify(value));
      }
    },
  };
}
