"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { AnimatedPage } from "@/components/ui/animated-page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Star, TrendingUp, Building2 } from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";

const RES_TABS = [
  { label: "Materials & Procurement", href: "/materials" },
  { label: "Resource & Rate Library", href: "/rate-library" },
  { label: "Equipment & Fleet", href: "/equipment" },
  { label: "Plant & Production", href: "/production" },
  { label: "Subcontractors", href: "/subcontractors" },
  { label: "HR / Staff", href: "/hr" },
  { label: "Vendors Directory", href: "/vendors" },
];

function getOverallColor(overall: number) {
  if (overall >= 80) return "text-success bg-success/10 dark:bg-success dark:text-success/80";
  if (overall >= 60) return "text-info bg-info/10 dark:bg-[var(--navy-deep)] dark:text-info/80";
  if (overall >= 40) return "text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400";
  return "text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400";
}

function getScoreColor(score: number) {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-info";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

export default function VendorPerformancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data, isLoading } = trpc.partner.performanceScore.useQuery({ projectId: id });

  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);

  const radarData = useMemo(() => {
    if (!data || !selectedVendor) return [];
    const vendor = data.vendors.find(v => v.id === selectedVendor);
    if (!vendor) return [];
    return [
      { dimension: "Delivery", score: vendor.deliveryScore, fullMark: 100 },
      { dimension: "Quality", score: vendor.qualityScore, fullMark: 100 },
      { dimension: "Price", score: vendor.priceScore, fullMark: 100 },
      { dimension: "Responsiveness", score: vendor.responsivenessScore, fullMark: 100 },
    ];
  }, [data, selectedVendor]);

  return (
    <AnimatedPage className="space-y-4 pb-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/projects/${id}/vendors`} className="hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Vendors
        </Link>
        <span>/</span>
        <span>Performance Scoring</span>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Star className="h-6 w-6 text-primary" />
          Vendor Performance Scoring
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Evaluate vendors on delivery, quality, price, and responsiveness.
        </p>
      </div>

      {isLoading ? (
        <Card>
          <CardContent>
            <Skeleton className="h-64" />
          </CardContent>
        </Card>
      ) : !data || data.vendors.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-center py-8 text-xs text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No vendors with purchase orders found in this project.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[10px] text-muted-foreground uppercase">Total Vendors</div>
                <div className="text-2xl font-bold">{data.summary.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[10px] text-muted-foreground uppercase">Excellent</div>
                <div className="text-2xl font-bold text-success">{data.summary.excellent}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[10px] text-muted-foreground uppercase">Good</div>
                <div className="text-2xl font-bold text-info">{data.summary.good}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[10px] text-muted-foreground uppercase">Average/Poor</div>
                <div className="text-2xl font-bold text-amber-600">{data.summary.average + data.summary.poor}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-3">
              {data.vendors.map((vendor, idx) => (
                <Card
                  key={vendor.id}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    selectedVendor === vendor.id && "ring-2 ring-primary"
                  )}
                  onClick={() => setSelectedVendor(vendor.id === selectedVendor ? null : vendor.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="text-lg font-bold text-muted-foreground w-6 text-right">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{vendor.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {vendor.totalOrders} orders · NPR {vendor.totalValue.toLocaleString("en-IN")}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className="text-[10px] text-muted-foreground">Delivery</div>
                          <div className={cn("text-sm font-bold tabular-nums", getScoreColor(vendor.deliveryScore))}>
                            {vendor.deliveryScore}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] text-muted-foreground">Quality</div>
                          <div className={cn("text-sm font-bold tabular-nums", getScoreColor(vendor.qualityScore))}>
                            {vendor.qualityScore}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] text-muted-foreground">Price</div>
                          <div className={cn("text-sm font-bold tabular-nums", getScoreColor(vendor.priceScore))}>
                            {vendor.priceScore}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] text-muted-foreground">Overall</div>
                          <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-sm font-bold", getOverallColor(vendor.overall))}>
                            {vendor.overall}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="space-y-3">
              {selectedVendor && radarData.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">
                      {data.vendors.find(v => v.id === selectedVendor)?.name}
                    </CardTitle>
                    <CardDescription className="text-xs">Performance Radar</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ResponsiveContainer width="100%" height={250}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Radar
                          name="Score"
                          dataKey="score"
                          stroke="#3b82f6"
                          fill="#3b82f6"
                          fillOpacity={0.3}
                        />
                        <Tooltip
                          contentStyle={{
                            fontSize: 11,
                            borderRadius: 8,
                            border: "1px solid hsl(var(--border))",
                            background: "hsl(var(--background))",
                          }}
                          formatter={(value: number) => [`${value}/100`, "Score"]}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Scoring Methodology</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground w-20">Delivery (35%)</span>
                    <span>On-time delivery rate from PO dates</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground w-20">Quality (25%)</span>
                    <span>Transaction quality rate</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground w-20">Price (20%)</span>
                    <span>Competitive pricing score</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground w-20">Response (20%)</span>
                    <span>Communication & responsiveness</span>
                  </div>
                </CardContent>
              </Card>

              {!selectedVendor && (
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center text-xs text-muted-foreground">
                      <TrendingUp className="h-6 w-6 mx-auto mb-2 opacity-30" />
                      <p>Select a vendor to view their performance radar chart.</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </AnimatedPage>
  );
}
