import Link from 'next/link';
import { CalendarClock, Users, BarChart3, ShieldCheck, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const features = [
  {
    icon: CalendarClock,
    title: 'Drag-and-drop scheduling',
    description:
      'Build shifts visually on a calendar. Assign employees, track coverage, and publish in seconds.',
  },
  {
    icon: Users,
    title: 'Multi-location workforce',
    description:
      'Manage employees across every location of your restaurant group from one unified workspace.',
  },
  {
    icon: BarChart3,
    title: 'Labor cost insights',
    description:
      'Real-time dashboards show scheduled hours, labor cost ratios, and coverage gaps before they happen.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-based access',
    description:
      'Owners, managers, and employees each see exactly what they need — nothing more, nothing less.',
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CalendarClock className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">ShiftWise</span>
          </div>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/register">
                Get started
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
              Multi-tenant restaurant scheduling
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Smarter shift scheduling for{' '}
              <span className="text-primary">modern restaurants</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              ShiftWise unifies scheduling, workforce management, and labor
              analytics across every location — so managers spend less time on
              spreadsheets and more time running the floor.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <Button size="lg" asChild>
                <Link href="/register">
                  Start free trial
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="grid gap-5 sm:grid-cols-2">
            {features.map((f) => (
              <Card key={f.title} className="border-border/60">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-1.5 text-base font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} ShiftWise</span>
          <span>Built for restaurant teams</span>
        </div>
      </footer>
    </div>
  );
}
