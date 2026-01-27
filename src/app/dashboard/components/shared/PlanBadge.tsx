"use client";

type PlanType = "free" | "lite" | "pro" | "max";

type PlanBadgeProps = {
  plan: PlanType | string;
  size?: "sm" | "md";
};

const planConfig: Record<PlanType, { label: string; bg: string; text: string }> = {
  free: {
    label: "Free",
    bg: "bg-slate-100",
    text: "text-slate-600",
  },
  lite: {
    label: "Lite",
    bg: "bg-blue-100",
    text: "text-blue-600",
  },
  pro: {
    label: "Pro",
    bg: "bg-gradient-to-r from-rose-100 to-rose-200",
    text: "text-rose-600",
  },
  max: {
    label: "Max",
    bg: "bg-gradient-to-r from-amber-100 to-amber-200",
    text: "text-amber-700",
  },
};

export function PlanBadge({ plan, size = "sm" }: PlanBadgeProps) {
  const config = planConfig[(plan as PlanType) || "free"] || planConfig.free;

  const sizeClasses = size === "sm"
    ? "px-2 py-0.5 text-xs"
    : "px-3 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full ${config.bg} ${config.text} ${sizeClasses}`}
    >
      {config.label}
    </span>
  );
}
