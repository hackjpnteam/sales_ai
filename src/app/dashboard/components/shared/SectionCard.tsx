"use client";

import { ReactNode } from "react";

type SectionCardProps = {
  title?: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
};

export function SectionCard({
  title,
  description,
  icon,
  children,
  className = "",
  headerAction,
}: SectionCardProps) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 ${className}`}>
      {(title || description) && (
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {icon && (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-50 to-rose-100 flex items-center justify-center text-rose-600">
                  {icon}
                </div>
              )}
              <div>
                {title && (
                  <h3 className="font-semibold text-slate-800">{title}</h3>
                )}
                {description && (
                  <p className="text-sm text-slate-500">{description}</p>
                )}
              </div>
            </div>
            {headerAction && <div>{headerAction}</div>}
          </div>
        </div>
      )}
      <div className="px-4 sm:px-6 py-4">{children}</div>
    </div>
  );
}
