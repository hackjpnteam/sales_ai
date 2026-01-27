"use client";

// [Analytics] 後方互換性のためのリダイレクト
// 古いURL: /dashboard/analytics?companyId=xxx
// 新しいURL: /dashboard/agent/[agentId]/analytics

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function AnalyticsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = searchParams.get("companyId");
  const companyName = searchParams.get("companyName");

  useEffect(() => {
    const fetchAndRedirect = async () => {
      if (!companyId) {
        // companyIdがない場合はダッシュボードにリダイレクト
        router.replace("/dashboard");
        return;
      }

      try {
        // companyIdからagentIdを取得
        const res = await fetch("/api/user/companies");
        if (res.ok) {
          const data = await res.json();
          const allCompanies = [...(data.companies || []), ...(data.sharedCompanies || [])];

          for (const company of allCompanies) {
            if (company.companyId === companyId) {
              const agent = company.agents?.[0];
              if (agent) {
                // 新しいURLにリダイレクト
                const params = new URLSearchParams();
                if (companyName) params.set("companyName", companyName);
                const redirectUrl = `/dashboard/agent/${agent.agentId}/analytics${params.toString() ? `?${params.toString()}` : ""}`;
                router.replace(redirectUrl);
                return;
              }
            }
          }
        }

        // 見つからない場合はダッシュボードにリダイレクト
        router.replace("/dashboard");
      } catch (error) {
        console.error("Redirect error:", error);
        router.replace("/dashboard");
      }
    };

    fetchAndRedirect();
  }, [companyId, companyName, router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500 mx-auto mb-4" />
        <p className="text-slate-600">リダイレクト中...</p>
      </div>
    </div>
  );
}

export default function LegacyAnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
        </div>
      }
    >
      <AnalyticsRedirect />
    </Suspense>
  );
}
