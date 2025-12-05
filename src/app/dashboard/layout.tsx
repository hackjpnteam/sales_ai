import { SessionProvider } from "next-auth/react";
import { Sparkles } from "lucide-react";
import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div
        className="min-h-screen"
        style={{
          background: "linear-gradient(180deg, #F1E8F0 0%, #E8DDE7 50%, #DFD4DE 100%)",
        }}
      >
        {/* Header */}
        <header
          className="px-4 sm:px-6 py-3 sm:py-4"
          style={{
            background: "linear-gradient(135deg, #D86672 0%, #D86672 50%, #D86672 100%)",
          }}
        >
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <h1 className="text-white font-bold text-base sm:text-xl tracking-tight">Saleschat AI</h1>
                <p className="text-white/70 text-[10px] sm:text-xs hidden sm:block">ダッシュボード</p>
              </div>
            </Link>
            <nav className="flex items-center gap-2 sm:gap-4">
              <Link
                href="/"
                className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-white/20 backdrop-blur-sm text-white text-xs sm:text-sm font-medium hover:bg-white/30 transition-all"
              >
                <span className="hidden sm:inline">ホームへ戻る</span>
                <span className="sm:hidden">ホーム</span>
              </Link>
            </nav>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
          {children}
        </main>
      </div>
    </SessionProvider>
  );
}
