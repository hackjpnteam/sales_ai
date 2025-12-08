import Image from "next/image";

export default function Footer() {
  return (
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
  );
}
