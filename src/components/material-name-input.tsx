"use client";

import React, { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc-client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  Globe,
  Building2,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface MaterialMatchItem {
  id: string;
  name: string;
  category: string | null;
  subCategory: string | null;
  defaultUnit: string | null;
  defaultRate: number | null;
  score: number;
  matchType: "exact" | "alias" | "token_sort" | "trigram" | "levenshtein";
  confidence: "high" | "medium" | "low";
  scope: "global" | "org" | "project";
  isCustom?: boolean;
}

interface MaterialNameInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelectMatch?: (match: MaterialMatchItem) => void;
  placeholder?: string;
  scope?: "global" | "org" | "project" | "all";
  organizationId?: string;
  projectId?: string;
  availableSubCategories?: string[];
  className?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  id?: string;
}

export function MaterialNameInput({
  value,
  onChange,
  onSelectMatch,
  placeholder = "e.g. Cement OPC 53 Grade",
  scope = "all",
  organizationId,
  projectId,
  availableSubCategories = [],
  className,
  disabled = false,
  required = false,
  autoFocus = false,
  id,
}: MaterialNameInputProps) {
  const [debouncedQuery, setDebouncedQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter available sub-categories based on input query
  const filteredSubCategories = React.useMemo(() => {
    const q = value.trim().toLowerCase();
    const unique = Array.from(new Set(availableSubCategories.filter(Boolean)));
    if (!q) return unique;
    return unique.filter((s) => s.toLowerCase().includes(q));
  }, [value, availableSubCategories]);

  // Debounce input by 250ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(value.trim());
    }, 250);
    return () => clearTimeout(handler);
  }, [value]);

  const { data, isLoading } = trpc.catalogV2.findSimilar.useQuery(
    {
      name: debouncedQuery,
      scope: scope as any,
      organizationId: organizationId ?? undefined,
      projectId: projectId ?? undefined,
      threshold: 0.35,
      limit: 6,
    },
    {
      enabled: debouncedQuery.length >= 2 && !disabled,
      staleTime: 5000,
    }
  );

  const matches: MaterialMatchItem[] = (data?.matches as any) || [];
  const topMatch = matches[0];

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Determine indicator status
  let statusIndicator: React.ReactNode = null;
  if (value.trim().length >= 2) {
    if (isLoading) {
      statusIndicator = (
        <span className="flex items-center text-xs text-muted-foreground gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking
        </span>
      );
    } else if (topMatch?.matchType === "exact" || topMatch?.score >= 0.98) {
      statusIndicator = (
        <Badge
          variant="outline"
          className="bg-info/10 text-info dark:bg-[var(--navy-deep)]/40 dark:text-info/80 border-info/30 text-[10px] gap-1 px-1.5 py-0 cursor-pointer"
          onClick={() => setIsOpen(true)}
          title="This base material exists in your catalog. You can add a new specification or select existing."
        >
          <Sparkles className="h-2.5 w-2.5 text-info" /> Existing Group
        </Badge>
      );
    } else if (topMatch && topMatch.score >= 0.65) {
      statusIndicator = (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 text-[10px] gap-1 px-1.5 py-0 cursor-pointer" onClick={() => setIsOpen(true)}>
          <AlertTriangle className="h-2.5 w-2.5 text-amber-500" /> {Math.round(topMatch.score * 100)}% Match
        </Badge>
      );
    } else {
      statusIndicator = (
        <Badge variant="outline" className="bg-success/10 text-success dark:bg-success/40 dark:text-success/80 border-success/30 text-[10px] gap-1 px-1.5 py-0">
          <CheckCircle2 className="h-2.5 w-2.5 text-success/90" /> Unique
        </Badge>
      );
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (matches.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          className={cn("pr-24 font-medium", className)}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {statusIndicator}
        </div>
      </div>

      {/* Live Suggestions & Typo Warning Dropdown */}
      {isOpen && (matches.length > 0 || filteredSubCategories.length > 0) && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover/95 p-2 shadow-xl backdrop-blur-md animate-in fade-in-50 zoom-in-95">
          {filteredSubCategories.length > 0 && matches.length === 0 && (
            <div className="pb-1 mb-1 px-1 border-b border-border/60 text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-success/80" />
              Existing Sub-Categories in Catalog ({filteredSubCategories.length})
            </div>
          )}

          {/* Sub-Category Options */}
          {filteredSubCategories.length > 0 && (
            <div className="space-y-1 mb-1.5">
              {filteredSubCategories.map((subCat) => (
                <div
                  key={subCat}
                  className="group flex items-center justify-between p-2 rounded-md hover:bg-accent/80 transition-colors cursor-pointer text-xs"
                  onClick={() => {
                    onChange(subCat);
                    setIsOpen(false);
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground">{subCat}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 bg-success/10 text-success/80 border-success/20">
                      Sub-Category
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px] opacity-80 group-hover:opacity-100 gap-1 bg-background/80 hover:bg-primary hover:text-primary-foreground border border-border/80"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(subCat);
                      setIsOpen(false);
                    }}
                  >
                    Select <ArrowRight className="h-2.5 w-2.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {matches.length > 0 && (
            <>
              <div className="flex items-center justify-between pb-1.5 mb-1 px-1 border-b border-border/60 text-[11px] text-muted-foreground font-medium">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  Similar Materials in Catalog ({matches.length})
                </span>
                <span>Confidence</span>
              </div>

              <div className="space-y-1">
                {matches.map((match) => {
                  const scorePct = Math.round(match.score * 100);
                  const isExact = match.matchType === "exact" || scorePct >= 98;
                  const isHigh = scorePct >= 80;

                  return (
                    <div
                      key={`${match.scope}-${match.id}`}
                      className="group flex items-center justify-between p-2 rounded-md hover:bg-accent/80 transition-colors cursor-pointer text-xs"
                      onClick={() => {
                        if (onSelectMatch) {
                          onSelectMatch(match);
                        } else {
                          onChange(match.name);
                        }
                        setIsOpen(false);
                      }}
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-foreground truncate">
                            {match.name}
                          </span>
                          {match.scope === "global" ? (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 gap-0.5">
                              <Globe className="h-2 w-2" /> Global
                            </Badge>
                          ) : match.scope === "org" ? (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 bg-info/10 text-info dark:bg-[var(--navy-deep)]/40 dark:text-info/80 border-info/30 gap-0.5">
                              <Building2 className="h-2 w-2" /> Org
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 bg-success/10 text-success dark:bg-success/40 dark:text-success/80 border-success/30 gap-0.5">
                              <Shield className="h-2 w-2" /> Project
                            </Badge>
                          )}
                          {match.category && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded">
                              {match.category}
                            </span>
                          )}
                        </div>
                        {match.defaultUnit && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Unit: <span className="font-medium text-foreground/80">{match.defaultUnit}</span>
                            {match.defaultRate ? ` • Rate: NPR ${match.defaultRate.toLocaleString()}` : ""}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] font-mono px-1.5 py-0",
                            isExact && "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 font-bold",
                            !isExact && isHigh && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 font-medium",
                            !isExact && !isHigh && "bg-muted text-muted-foreground"
                          )}
                        >
                          {scorePct}% {match.matchType === "alias" ? "Alias" : match.matchType === "token_sort" ? "Tokens" : ""}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[10px] opacity-80 group-hover:opacity-100 gap-1 bg-background/80 hover:bg-primary hover:text-primary-foreground border border-border/80"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectMatch) {
                              onSelectMatch(match);
                            } else {
                              onChange(match.name);
                            }
                            setIsOpen(false);
                          }}
                        >
                          Use <ArrowRight className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
