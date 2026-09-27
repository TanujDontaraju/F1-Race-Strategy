"use client";

import Link from "next/link";

export default function NewsPage() {
  return (
    <div className="pitwall-ambient flex min-h-screen flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col gap-4 p-4 lg:p-6">
        {/* Header matching the main dashboard */}
        <header className="glass-chrome relative z-20 flex flex-wrap items-center justify-between gap-3 rounded-[28px] px-5 py-2.5">
          <div className="flex items-baseline gap-6">
            <Link href="/" className="text-sm font-bold uppercase tracking-[0.16em] transition-opacity hover:opacity-70">
              Pit Wall
            </Link>
            <Link href="/news" className="text-sm font-bold uppercase tracking-[0.16em] transition-opacity hover:opacity-70">
              News
            </Link>
          </div>
        </header>

        {/* Main content */}
        <main className="flex flex-1 items-center justify-center">
          <div className="glass-chrome rounded-[32px] px-8 py-12 text-center sm:px-12">
            <h1 className="text-3xl font-bold uppercase tracking-[0.12em] sm:text-4xl">News</h1>
            <p className="mt-6 text-lg text-white/60">Under Development</p>
            <p className="mt-2 text-sm text-white/40">Coming soon</p>
          </div>
        </main>
      </div>
    </div>
  );
}
