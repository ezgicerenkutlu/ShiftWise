import Link from 'next/link';
import { CalendarClock } from 'lucide-react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: form */}
      <div className="relative flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-10 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <CalendarClock className="h-5 w-5" />
            </div>
            <span className="text-xl font-semibold tracking-tight">ShiftWise</span>
          </Link>
          {children}
        </div>
      </div>

      {/* Right: brand panel */}
      <div className="relative hidden overflow-hidden bg-primary lg:block" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/80" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="absolute -right-24 top-1/4 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -left-24 bottom-1/4 h-72 w-72 rounded-full bg-white/5 blur-3xl" />

        <div className="relative flex h-full flex-col justify-between p-12 text-primary-foreground">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="h-5 w-5" />
            ShiftWise
          </div>

          <div className="space-y-6">
            <h2 className="max-w-md text-3xl font-bold leading-tight">
              The scheduling platform built for restaurant operations.
            </h2>
            <p className="max-w-md text-primary-foreground/80">
              Schedule shifts, track labor costs, and manage your entire
              workforce across locations — all in one place.
            </p>

            <div className="flex gap-6 pt-4">
              <div>
                <p className="text-2xl font-bold">40%</p>
                <p className="text-xs text-primary-foreground/70">
                  Less time scheduling
                </p>
              </div>
              <div className="w-px bg-primary-foreground/20" />
              <div>
                <p className="text-2xl font-bold">24/7</p>
                <p className="text-xs text-primary-foreground/70">
                  Team access
                </p>
              </div>
              <div className="w-px bg-primary-foreground/20" />
              <div>
                <p className="text-2xl font-bold">1</p>
                <p className="text-xs text-primary-foreground/70">
                  Unified workspace
                </p>
              </div>
            </div>
          </div>

          <div className="text-sm text-primary-foreground/60">
            Trusted by restaurant teams worldwide
          </div>
        </div>
      </div>
    </div>
  );
}
