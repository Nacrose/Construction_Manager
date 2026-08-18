"use client";

import { useState, useCallback, useRef, useEffect } from "react";

/**
 * useHistorizedState — a state hook with undo/redo support.
 *
 * - `state`: current value
 * - `setState(updater)`: updates state, snapshots previous value into history
 * - `undo()`: step back one snapshot
 * - `redo()`: step forward
 * - `canUndo`, `canRedo`: booleans for button enabling
 * - `reset(value)`: replaces state without recording history
 *
 * History snapshots are debounced (default 300ms) so rapid changes during
 * a drag/resize only produce one history entry.
 *
 * Usage:
 *   const { state, setState, undo, redo, canUndo, canRedo } = useHistorizedState(initial);
 */
export function useHistorizedState<T>(
  initial: T,
  opts: { debounceMs?: number; maxHistory?: number } = {}
) {
  const { debounceMs = 300, maxHistory = 50 } = opts;
  const [state, setStateRaw] = useState<T>(initial);
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const lastCommittedRef = useRef<T>(initial);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSnapshotRef = useRef<T | null>(null);

  // Update canUndo / canRedo whenever past/future change
  useEffect(() => { setCanUndo(past.length > 0); }, [past]);
  useEffect(() => { setCanRedo(future.length > 0); }, [future]);

  const setState = useCallback((updater: T | ((prev: T) => T)) => {
    setStateRaw(prev => {
      const next = typeof updater === "function"
        ? (updater as (p: T) => T)(prev)
        : updater;

      // Skip if no change
      if (Object.is(next, prev)) return prev;

      // Debounce the history push so rapid drag updates don't spam history
      if (debounceRef.current) clearTimeout(debounceRef.current);
      pendingSnapshotRef.current = prev;
      debounceRef.current = setTimeout(() => {
        const snapshot = pendingSnapshotRef.current;
        if (snapshot != null) {
          setPast(p => [...p.slice(-(maxHistory - 1)), snapshot]);
          setFuture([]);
          lastCommittedRef.current = snapshot;
        }
      }, debounceMs);

      return next;
    });
  }, [debounceMs, maxHistory]);

  const undo = useCallback(() => {
    setPast(p => {
      if (p.length === 0) return p;
      const last = p[p.length - 1];
      setStateRaw(current => {
        // Push current to future, then set state to the last past entry
        setFuture(f => [...f, current]);
        lastCommittedRef.current = last;
        return last;
      });
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture(f => {
      if (f.length === 0) return f;
      const next = f[f.length - 1];
      setStateRaw(current => {
        setPast(p => [...p, current]);
        lastCommittedRef.current = next;
        return next;
      });
      return f.slice(0, -1);
    });
  }, []);

  const reset = useCallback((value: T) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    pendingSnapshotRef.current = null;
    lastCommittedRef.current = value;
    setPast([]);
    setFuture([]);
    setStateRaw(value);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { state, setState, undo, redo, canUndo, canRedo, reset };
}
