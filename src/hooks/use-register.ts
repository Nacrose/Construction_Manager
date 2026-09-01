"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export interface UseRegisterOptions {
  defaultStatus?: string;
  defaultTab?: string;
  defaultPageSize?: number;
  syncToUrl?: boolean;
}

export interface RegisterDialogState<T = any> {
  type: "create" | "edit" | "delete" | "view" | "review" | "custom" | null;
  item: T | null;
  open: boolean;
  metadata?: Record<string, any>;
}

/**
 * Canonical Register & Ledger Hook for Construction Manager
 *
 * Provides URL-synchronized filtering, search, pagination, row selection,
 * and standard modal dialog state management for tabular views.
 */
export function useRegister<T = any>(options: UseRegisterOptions = {}) {
  const {
    defaultStatus = "all",
    defaultTab = "all",
    defaultPageSize = 25,
    syncToUrl = true,
  } = options;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Dialog state
  const [dialog, setDialog] = useState<RegisterDialogState<T>>({
    type: null,
    item: null,
    open: false,
  });

  // Selected row IDs
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // URL-driven query state
  const search = searchParams?.get("q") ?? "";
  const status = searchParams?.get("status") ?? defaultStatus;
  const tab = searchParams?.get("tab") ?? defaultTab;
  const page = parseInt(searchParams?.get("page") ?? "1", 10) || 1;
  const pageSize = parseInt(searchParams?.get("limit") ?? String(defaultPageSize), 10) || defaultPageSize;

  /** Update URL query params with shallow navigation */
  const setQueryParams = useCallback(
    (updates: Record<string, string | number | null | undefined>) => {
      if (!syncToUrl || !searchParams || !pathname) return;

      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }

      // If updating search or filter, reset page to 1
      if ("q" in updates || "status" in updates || "tab" in updates) {
        if (!("page" in updates)) {
          params.delete("page");
        }
      }

      const queryString = params.toString();
      const targetUrl = queryString ? `${pathname}?${queryString}` : pathname;

      startTransition(() => {
        router.replace(targetUrl, { scroll: false });
      });
    },
    [router, pathname, searchParams, syncToUrl]
  );

  const setSearch = useCallback(
    (q: string) => setQueryParams({ q }),
    [setQueryParams]
  );

  const setStatus = useCallback(
    (newStatus: string) => setQueryParams({ status: newStatus }),
    [setQueryParams]
  );

  const setTab = useCallback(
    (newTab: string) => setQueryParams({ tab: newTab }),
    [setQueryParams]
  );

  const setPage = useCallback(
    (newPage: number) => setQueryParams({ page: newPage > 1 ? newPage : null }),
    [setQueryParams]
  );

  const setPageSize = useCallback(
    (newSize: number) => setQueryParams({ limit: newSize !== defaultPageSize ? newSize : null }),
    [setQueryParams, defaultPageSize]
  );

  const setFilter = useCallback(
    (key: string, val: string | number | null | undefined) =>
      setQueryParams({ [key]: val }),
    [setQueryParams]
  );

  const resetFilters = useCallback(() => {
    if (!syncToUrl || !pathname) return;
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }, [router, pathname, syncToUrl]);

  // Dialog helpers
  const openCreate = useCallback((metadata?: Record<string, any>) => {
    setDialog({ type: "create", item: null, open: true, metadata });
  }, []);

  const openEdit = useCallback((item: T, metadata?: Record<string, any>) => {
    setDialog({ type: "edit", item, open: true, metadata });
  }, []);

  const openDelete = useCallback((item: T, metadata?: Record<string, any>) => {
    setDialog({ type: "delete", item, open: true, metadata });
  }, []);

  const openView = useCallback((item: T, metadata?: Record<string, any>) => {
    setDialog({ type: "view", item, open: true, metadata });
  }, []);

  const openReview = useCallback((item: T, metadata?: Record<string, any>) => {
    setDialog({ type: "review", item, open: true, metadata });
  }, []);

  const closeDialog = useCallback(() => {
    setDialog((prev) => ({ ...prev, open: false, item: null, type: null }));
  }, []);

  // Selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return useMemo(
    () => ({
      // Search & Filters
      search,
      setSearch,
      status,
      setStatus,
      tab,
      setTab,
      page,
      setPage,
      pageSize,
      setPageSize,
      setFilter,
      resetFilters,
      isPending,

      // Dialogs
      dialog,
      openCreate,
      openEdit,
      openDelete,
      openView,
      openReview,
      closeDialog,

      // Selection
      selectedIds,
      toggleSelect,
      toggleSelectAll,
      clearSelection,
    }),
    [
      search,
      setSearch,
      status,
      setStatus,
      tab,
      setTab,
      page,
      setPage,
      pageSize,
      setPageSize,
      setFilter,
      resetFilters,
      isPending,
      dialog,
      openCreate,
      openEdit,
      openDelete,
      openView,
      openReview,
      closeDialog,
      selectedIds,
      toggleSelect,
      toggleSelectAll,
      clearSelection,
    ]
  );
}
