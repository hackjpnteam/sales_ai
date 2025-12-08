import Link from "next/link";
import Image from "next/image";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
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
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Image
                  src="/logo.png"
                  alt="Saleschat AI"
                  width={48}
                  height={48}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h1 className="text-white font-bold text-base sm:text-xl tracking-tight">Saleschat AI</h1>
                <p className="text-white/70 text-[10px] sm:text-xs">Powered by hackjpn</p>
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

        {/* フッター */}
        <footer className="border-t border-slate-200 py-4 px-4 mt-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Image
                  src="/logo.png"
                  alt="Saleschat AI"
                  width={32}
                  height={32}
                  className="rounded-full"
                />
                <div>
                  <p className="text-sm font-medium text-slate-700">Saleschat AI</p>
                  <p className="text-xs text-slate-400">© 2024 hackjpn Inc.</p>
                </div>
              </div>
              <nav className="flex flex-wrap items-center justify-center gap-4 text-sm text-slate-500">
                <a
                  href="https://hackjpn.com/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-700 transition-colors"
                >
                  利用規約
                </a>
                <span className="text-slate-300">|</span>
                <a
                  href="https://hackjpn.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-700 transition-colors"
                >
                  情報の取り扱い
                </a>
                <span className="text-slate-300">|</span>
                <a
                  href="https://hackjpn.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-700 transition-colors"
                >
                  運営会社
                </a>
              </nav>
            </div>
            <p className="text-center text-xs text-slate-400 mt-3">
              Powered by <a href="https://hackjpn.com" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 transition-colors">hackjpn</a> ver 2.5
            </p>
          </div>
        </footer>
      </div>
  );
}
