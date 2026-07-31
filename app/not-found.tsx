import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 text-center text-white">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-500/20 text-4xl">
        🔍
      </div>

      <h1 className="text-5xl font-black tracking-tight">404</h1>

      <p className="mt-3 text-xl font-semibold text-slate-300">Page not found</p>

      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <div className="mt-8 flex items-center gap-3">
        <Link
          className="h-11 rounded-xl bg-cyan-400 px-6 text-sm font-bold leading-[44px] text-slate-900 transition hover:bg-cyan-300"
          href="/"
        >
          Go home
        </Link>
        <Link
          className="h-11 rounded-xl border border-white/10 px-6 text-sm font-semibold leading-[44px] text-slate-300 transition hover:bg-white/5"
          href="/login"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
