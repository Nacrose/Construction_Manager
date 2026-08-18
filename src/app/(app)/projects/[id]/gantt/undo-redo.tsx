"use client";

import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

const MAX_STACK = 50;

type UndoAction = {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

type UndoRedoCtx = {
  pushAction: (action: UndoAction) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
};

const UndoRedoContext = createContext<UndoRedoCtx>({
  pushAction: () => {},
  undo: async () => {},
  redo: async () => {},
  canUndo: false,
  canRedo: false,
});

export function UndoRedoProvider({ children }: { children: ReactNode }) {
  const undoStack = useRef<UndoAction[]>([]);
  const redoStack = useRef<UndoAction[]>([]);
  // Track sizes in state so consumers re-render when stacks change.
  // Reading ref.current during render is forbidden by React Compiler.
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  const pushAction = useCallback((action: UndoAction) => {
    undoStack.current.push(action);
    if (undoStack.current.length > MAX_STACK) undoStack.current.shift();
    redoStack.current = [];
    setUndoCount(undoStack.current.length);
    setRedoCount(0);
  }, []);

  const undo = useCallback(async () => {
    const action = undoStack.current.pop();
    if (!action) return;
    try {
      await action.undo();
      redoStack.current.push(action);
      setUndoCount(undoStack.current.length);
      setRedoCount(redoStack.current.length);
      toast.success(`Undo: ${action.label}`);
    } catch {
      toast.error(`Undo failed: ${action.label}`);
    }
  }, []);

  const redo = useCallback(async () => {
    const action = redoStack.current.pop();
    if (!action) return;
    try {
      await action.redo();
      undoStack.current.push(action);
      setUndoCount(undoStack.current.length);
      setRedoCount(redoStack.current.length);
      toast.success(`Redo: ${action.label}`);
    } catch {
      toast.error(`Redo failed: ${action.label}`);
    }
  }, []);

  return (
    <UndoRedoContext
      value={{
        pushAction,
        undo,
        redo,
        canUndo: undoCount > 0,
        canRedo: redoCount > 0,
      }}
    >
      {children}
    </UndoRedoContext>
  );
}

export function useUndoRedo() {
  return useContext(UndoRedoContext);
}
