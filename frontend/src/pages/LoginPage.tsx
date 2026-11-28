import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bug, Clock, Database, FolderDown, Pause, Play, Zap } from "lucide-react";

import { AccessDialog } from "@/components/AccessDialog";
import { api } from "@/lib/api/client";

const SLIDES = [
  {
    title: "Turn web pages into usable datasets.",
    description: "Run batch crawls with Patroy, Playtrafi, and Scrapy from one self-hosted workbench.",
  },
  {
    title: "Extract data from dynamic websites.",
    description: "Render JavaScript with browser engines and turn pages into structured records or clean Markdown.",
  },
  {
    title: "Schedule the crawls you run often.",
    description: "Run jobs on demand or on a recurring schedule and follow their progress in the workbench.",
  },
  {
    title: "Keep your results ready to use.",
    description: "Explore results in SQLite, combine datasets, and export them as CSV or Excel files.",
  },
];

const FEATURES = [
  { icon: Zap, label: "Three crawl engines", detail: "Patroy, Playtrafi, and Scrapy" },
  { icon: Clock, label: "Scheduled jobs", detail: "Batch crawls on demand or by cron" },
  { icon: Database, label: "Datasets & SQL", detail: "Explore and combine results" },
  { icon: FolderDown, label: "CSV & Excel exports", detail: "Automatic file splitting" },
];

export function LoginPage() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [slide, setSlide] = useState(0);
  const [playing, setPlaying] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    staleTime: 60_000,
  });
  const version = health?.version.split(/[+-]/)[0];

  useEffect(() => {
    if (!playing || dialogOpen) return;
    const timer = window.setInterval(() => setSlide((index) => (index + 1) % SLIDES.length), 6500);
    return () => window.clearInterval(timer);
  }, [playing, dialogOpen]);

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-gradient-to-br from-slate-950 via-brand-950 to-indigo-950 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 -top-48 h-[32rem] w-[32rem] rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -bottom-64 -right-48 h-[44rem] w-[44rem] rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-10 sm:py-8">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-sky-500">
            <Bug aria-hidden="true" className="h-6 w-6" />
          </span>
          <span className="text-xl font-bold tracking-tight">Krawlyx</span>
        </div>
        <Link to="/contact" className="flex min-h-11 items-center text-sm font-medium text-brand-100 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300">
          Contact
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-5 py-10 text-center sm:px-10 sm:py-16">
        <div className="grid w-full max-w-4xl">
          {SLIDES.map(({ title, description }, index) => (
            <div
              key={title}
              aria-hidden={slide !== index}
              className={`col-start-1 row-start-1 flex flex-col items-center self-center motion-safe:transition-opacity motion-safe:duration-300 ${slide === index ? "opacity-100" : "invisible opacity-0"}`}
            >
              <h1 className="text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-7xl">
                {title}
              </h1>
              <p className="mt-5 max-w-xl text-balance text-base leading-relaxed text-brand-100 sm:text-lg">
                {description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center" role="group" aria-label="Landing page highlights">
          {SLIDES.map(({ title }, index) => (
            <button
              key={title}
              type="button"
              aria-label={title}
              aria-pressed={index === slide}
              onClick={() => {
                setSlide(index);
                setPlaying(false);
              }}
              className="grid h-11 w-11 place-items-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
            >
              <span className={`h-2 rounded-full ${index === slide ? "w-5 bg-brand-300" : "w-2 bg-brand-200/45"}`} />
            </button>
          ))}
          <button
            type="button"
            aria-label={playing ? "Pause highlights" : "Play highlights"}
            onClick={() => setPlaying(!playing)}
            className="grid h-11 w-11 place-items-center rounded-md text-brand-100 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
          >
            {playing ? <Pause aria-hidden="true" className="h-4 w-4" /> : <Play aria-hidden="true" className="h-4 w-4" />}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            dialog.current?.showModal();
            setDialogOpen(true);
          }}
          className="mt-8 inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-white px-7 py-3 text-base font-bold text-brand-900 shadow-lg shadow-slate-950/30 transition hover:bg-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300"
        >
          Log in <ArrowRight aria-hidden="true" className="h-5 w-5" />
        </button>
      </main>

      <footer className="mx-auto w-full max-w-7xl px-5 sm:px-10">
        <ul className="grid grid-cols-2 gap-x-5 gap-y-5 border-y border-white/15 py-5 sm:gap-6 sm:py-7 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, label, detail }) => (
            <li key={label} className="flex items-start gap-2.5">
              <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-300 sm:h-5 sm:w-5" />
              <div>
                <p className="text-sm font-semibold">{label}</p>
                <p className="mt-1 text-sm leading-snug text-brand-200">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-4 py-4 text-xs text-brand-200">
          <span>© {new Date().getFullYear()} Alfazen Inc.</span>
          {version && <span title={health?.version}>{version}</span>}
        </div>
      </footer>

      <AccessDialog dialog={dialog} isOpen={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
