import Link from "next/link";
import Image from "next/image";

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
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Powered by hackjpn ver 2.1</p>
        </Link>

        {children}
      </div>
    </div>
  );
}
