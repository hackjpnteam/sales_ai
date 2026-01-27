"use client";

import { Lock, Sparkles } from "lucide-react";
import { ReactNode } from "react";

type ProFeatureLockProps = {
  children: ReactNode;
  isLocked: boolean;
  requiredPlan?: "pro" | "max";
  onUpgradeClick?: () => void;
  message?: string;
};

export function ProFeatureLock({
  children,
  isLocked,
  requiredPlan = "pro",
  onUpgradeClick,
  message = "この機能はProプラン以上でご利用いただけます",
}: ProFeatureLockProps) {
  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="opacity-50 pointer-events-none blur-[1px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px] rounded-xl">
        <div className="text-center p-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-br from-rose-50 to-rose-100 flex items-center justify-center mb-3">
            <Lock className="w-5 h-5 text-rose-600" />
          </div>
          <p className="text-sm text-slate-600 mb-3">{message}</p>
          {onUpgradeClick && (
            <button
              onClick={onUpgradeClick}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-500 to-rose-600 text-white text-sm font-medium rounded-xl hover:from-rose-600 hover:to-rose-700 transition-all shadow-lg shadow-rose-500/20"
            >
              <Sparkles className="w-4 h-4" />
              {requiredPlan === "max" ? "Maxプランにアップグレード" : "Proプランにアップグレード"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
