import { Sparkles } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{
        background: "linear-gradient(180deg, #F1E8F0 0%, #E8DDE7 50%, #DFD4DE 100%)",
      }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="block text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 shadow-lg mb-3 sm:mb-4">
            <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Saleschat AI</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">接客AIエージェント管理</p>
        </Link>

        {children}
      </div>
    </div>
  );
}
