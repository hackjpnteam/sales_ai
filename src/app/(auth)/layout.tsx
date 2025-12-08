import Link from "next/link";
import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "linear-gradient(180deg, #F1E8F0 0%, #E8DDE7 50%, #DFD4DE 100%)",
      }}
    >
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <Link href="/" className="block text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-white shadow-lg mb-3 sm:mb-4">
              <Image
                src="/logo.png"
                alt="Saleschat AI"
                width={80}
                height={80}
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Saleschat AI</h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">Powered by hackjpn</p>
          </Link>

          {children}
        </div>
      </div>

      {/* フッター */}
      <footer className="border-t border-slate-200 py-4 px-4">
        <div className="max-w-4xl mx-auto">
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
                <p className="text-xs text-slate-400">2024 hackjpn.inc</p>
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
