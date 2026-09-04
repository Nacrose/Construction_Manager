"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { trpc } from "@/lib/trpc-client";
import { getUser } from "@/lib/client-auth";
import { toast } from "sonner";

type Prefs = Record<string, unknown>;

const LOCAL_STORAGE_MAP: Record<string, string> = {
  "theme": "theme",
  "cf-sidebar-mode": "sidebarMode",
  "cf-sidebar-modules-order": "sidebarModulesOrder",
  "cf-fab-mode": "fabMode",
  "ganttLeftPanelWidth": "ganttLeftPanelWidth",
  "ganttActivityGridWidthV2": "ganttLeftPanelWidth",
  "gantt-fullscreen-preference": "ganttFullscreen",
  "calendar-type-preference": "calendarType",
  "gantt-theme": "ganttTheme",
  "gantt-bar-radius": "ganttBarRadius",
  "gantt-compact-density": "ganttCompactDensity",
  "gantt-show-crit-highlight": "ganttShowCritHighlight",
  "gantt-show-baseline-stripes": "ganttShowBaselineStripes",
  "gantt-show-holidays": "ganttShowHolidays",
  "gantt-show-weekends": "ganttShowWeekends",
  "ganttShowMinimap": "ganttShowMinimap",
  "ganttZoomScale": "ganttZoomScale",
  "ganttZoomLevel": "ganttZoomLevel",
  "ganttTaskListVisible": "ganttTaskListVisible",
  "ganttInspectorVisible": "ganttInspectorVisible",
};

const LOCAL_STORAGE_REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(LOCAL_STORAGE_MAP).map(([k, v]) => [v, k])
);

function getUserStorageKey(uid?: string | null): string {
  return uid ? `cf_prefs_${uid}` : "cf_prefs_guest";
}

function hydrateFromLocalStorage(uid?: string | null): Prefs {
  const defaults: Prefs = {
    calendarType: "BS",
    ganttTheme: "omniplan",
    ganttBarRadius: "rounded",
    ganttCompactDensity: true,
    ganttShowCritHighlight: true,
    ganttShowBaselineStripes: true,
    ganttShowHolidays: true,
    ganttShowWeekends: true,
  };
  if (typeof window === "undefined") return defaults;

  const userKey = getUserStorageKey(uid);
  let parsed: Prefs = {};
  const raw = localStorage.getItem(userKey);
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {}
  }

  // Also hydrate legacy un-namespaced keys for backward compatibility
  for (const [localKey, prefKey] of Object.entries(LOCAL_STORAGE_MAP)) {
    if (parsed[prefKey] === undefined) {
      const val = localStorage.getItem(localKey);
      if (val !== null) {
        try {
          parsed[prefKey] = JSON.parse(val);
        } catch {
          parsed[prefKey] = val;
        }
      }
    }
  }

  return { ...defaults, ...parsed };
}

function getDeep(obj: any, path: string): any {
  if (!obj) return undefined;
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
  const result = { ...(obj || {}) };
  let current = result;
  for (let i = 0; i < keys.length - 1; i++) {
    current[keys[i]] = { ...(current[keys[i]] || {}) };
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
  return result;
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type UserPreferencesContextType = {
  prefs: Prefs;
  getPref: <T>(key: string, defaultValue?: T) => T;
  setPref: (key: string, value: unknown) => void;
  saveStateImmediately: () => Promise<void>;
  isSaving: boolean;
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  ready: boolean;
};

const UserPreferencesContext = createContext<UserPreferencesContextType | null>(null);

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const prefsMutation = trpc.userPreferences.update.useMutation();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return getUser()?.id ?? null;
    }
    return null;
  });

  const userIdRef = useRef<string | null>(currentUserId);
  useEffect(() => {
    userIdRef.current = currentUserId;
  }, [currentUserId]);

  const [prefs, setPrefs] = useState<Prefs>(() => {
    if (typeof window !== "undefined") {
      return hydrateFromLocalStorage(getUser()?.id);
    }
    return { calendarType: "BS" };
  });

  const [ready, setReady] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prefsRef = useRef<Prefs>(prefs);

  // Sync ref synchronously when state updates
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  // Listen for user auth changes (login, logout, switch account)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleAuthChange = () => {
      const u = getUser();
      const newUid = u?.id ?? null;
      if (newUid !== userIdRef.current) {
        setCurrentUserId(newUid);
        const hydrated = hydrateFromLocalStorage(newUid);
        prefsRef.current = hydrated;
        setPrefs(hydrated);
      }
    };
    window.addEventListener("cf:auth-change", handleAuthChange);
    return () => window.removeEventListener("cf:auth-change", handleAuthChange);
  }, []);

  // Fetch server preferences for the authenticated user
  const { data: serverPrefs, refetch: _refetchServerPrefs } = trpc.userPreferences.get.useQuery(undefined, {
    staleTime: 60 * 1000,
    retry: 1,
    enabled: typeof window !== "undefined" && !!currentUserId,
  });

  useEffect(() => {
    if (serverPrefs && typeof serverPrefs === "object") {
      setPrefs((prev) => {
        const merged = { ...prev, ...serverPrefs };
        prefsRef.current = merged;
        if (typeof window !== "undefined") {
          const userKey = getUserStorageKey(userIdRef.current);
          try {
            localStorage.setItem(userKey, JSON.stringify(merged));
          } catch {}
          for (const [prefKey, val] of Object.entries(serverPrefs)) {
            const localKey = LOCAL_STORAGE_REVERSE_MAP[prefKey] || prefKey;
            try {
              localStorage.setItem(localKey, typeof val === "string" ? val : JSON.stringify(val));
            } catch {}
          }
        }
        return merged;
      });
    }
    setReady(true);
  }, [serverPrefs]);

  const mutateRef = useRef(prefsMutation.mutateAsync);
  useEffect(() => {
    mutateRef.current = prefsMutation.mutateAsync;
  }, [prefsMutation.mutateAsync]);

  const getPref = useCallback(<T,>(key: string, defaultValue?: T): T => {
    const val = getDeep(prefs, key);
    if (val !== undefined) return val as T;
    if (key === "calendarType" && defaultValue === undefined) {
      return "BS" as unknown as T;
    }
    return defaultValue as T;
  }, [prefs]);

  // Execute background auto-save to cloud
  const executeAutoSave = useCallback(async (payload: Prefs) => {
    setSaveStatus("saving");
    try {
      await mutateRef.current({ preferences: payload });
      setSaveStatus("saved");
      setLastSavedAt(new Date());
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(() => {
        setSaveStatus("idle");
      }, 2500);
    } catch {
      setSaveStatus("error");
    }
  }, []);

  // Auto-save debounced handler with synchronous in-memory update
  const setPref = useCallback((key: string, value: unknown) => {
    const currentVal = getDeep(prefsRef.current, key);
    if (JSON.stringify(currentVal) === JSON.stringify(value)) {
      return;
    }

    // Synchronously update the ref and local cache to avoid race conditions
    const nextPrefs = setDeep(prefsRef.current, key, value);
    prefsRef.current = nextPrefs;
    setPrefs(nextPrefs);

    if (typeof window !== "undefined") {
      const userKey = getUserStorageKey(userIdRef.current);
      try {
        localStorage.setItem(userKey, JSON.stringify(nextPrefs));
      } catch {}

      const legacyKey = LOCAL_STORAGE_REVERSE_MAP[key] || key;
      try {
        localStorage.setItem(legacyKey, typeof value === "string" ? value : JSON.stringify(value));
      } catch {}
    }

    setSaveStatus("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void executeAutoSave(nextPrefs);
    }, 600);
  }, [executeAutoSave]);

  // Flush any pending auto-save immediately before unmount or on tab switch
  const flushImmediate = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = undefined;
      void executeAutoSave(prefsRef.current);
    }
  }, [executeAutoSave]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushImmediate();
      }
    };
    const handleBeforeUnload = () => {
      flushImmediate();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flushImmediate();
    };
  }, [flushImmediate]);

  const saveStateImmediately = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus("saving");
    try {
      await mutateRef.current({ preferences: prefsRef.current });
      setSaveStatus("saved");
      setLastSavedAt(new Date());
      toast.success("Schedule view state & preferences saved across devices");
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(() => {
        setSaveStatus("idle");
      }, 2500);
    } catch (err: any) {
      setSaveStatus("error");
      toast.error("Failed to sync state to server: " + (err?.message || "Unknown error"));
    }
  }, []);

  const isSaving = saveStatus === "saving";

  return (
    <UserPreferencesContext.Provider
      value={{
        prefs,
        getPref,
        setPref,
        saveStateImmediately,
        isSaving,
        saveStatus,
        lastSavedAt,
        ready,
      }}
    >
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
    isSaving: false,
    saveStatus: "idle",
    lastSavedAt: null,
    saveStateImmediately: async () => {},
    getPref: <T,>(key: string, defaultValue?: T): T => {
      const localKey = LOCAL_STORAGE_REVERSE_MAP[key] || key;
      if (typeof window !== "undefined") {
        const userKey = getUserStorageKey(getUser()?.id);
        try {
          const raw = localStorage.getItem(userKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            const v = getDeep(parsed, key);
            if (v !== undefined) return v as T;
          }
        } catch {}

        const val = localStorage.getItem(localKey);
        if (val !== null) {
          try {
            return JSON.parse(val) as T;
          } catch {
            return val as unknown as T;
          }
        }
      }
      return defaultValue as T;
    },
    setPref: (key: string, value: unknown) => {
      if (typeof window !== "undefined") {
        const userKey = getUserStorageKey(getUser()?.id);
        try {
          const raw = localStorage.getItem(userKey);
          const current = raw ? JSON.parse(raw) : {};
          const updated = setDeep(current, key, value);
          localStorage.setItem(userKey, JSON.stringify(updated));
        } catch {}

        const localKey = LOCAL_STORAGE_REVERSE_MAP[key] || key;
        try {
          localStorage.setItem(localKey, typeof value === "string" ? value : JSON.stringify(value));
        } catch {}
      }
    },
  };
}
