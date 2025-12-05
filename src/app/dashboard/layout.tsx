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
          className="px-6 py-4"
          style={{
            background: "linear-gradient(135deg, #D86672 0%, #D86672 50%, #D86672 100%)",
          }}
        >
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-white font-bold text-xl tracking-tight">ChatSales AI</h1>
                <p className="text-white/70 text-xs">ダッシュボード</p>
              </div>
            </Link>
            <nav className="flex items-center gap-4">
              <Link
                href="/"
                className="px-4 py-2 rounded-xl bg-white/20 backdrop-blur-sm text-white text-sm font-medium hover:bg-white/30 transition-all"
              >
                ホームへ戻る
              </Link>
            </nav>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-8">
          {children}
        </main>
      </div>
    </SessionProvider>
  );
}
