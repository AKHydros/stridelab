import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Backdrop, Glass, LiquidGlassDefs, supportsRefraction } from "./components/glass/Glass";
import { TabBar, type TabDef } from "./components/glass/TabBar";
import { icons } from "./components/Icons";
import { analyze } from "./lib/analysis/analyze";
import { type Conditions, DEFAULT_CONDITIONS } from "./lib/conditions";
import { usePersistentSession, usePrefs } from "./lib/store";
import type { SessionData } from "./lib/types";
import { After } from "./views/After";
import { Data } from "./views/Data";
import { Effort } from "./views/Effort";
import { Mind } from "./views/Mind";
import { Overview } from "./views/Overview";
import { Pacing } from "./views/Pacing";
import { RaceLab } from "./views/RaceLab";
import { Fuel } from "./views/Fuel";
import { Load } from "./views/Load";
import { Recovery } from "./views/Recovery";
import { Training } from "./views/Training";
import { Zones } from "./views/Zones";

// Map tiles and the Anthropic SDK load only when their tabs are opened.
const Route = lazy(() => import("./views/Route").then((m) => ({ default: m.Route })));
const Report = lazy(() => import("./views/Report").then((m) => ({ default: m.Report })));

const TABS: TabDef[] = [
  { id: "overview", label: "Summary" },
  { id: "pacing", label: "Pacing" },
  { id: "effort", label: "HR & Power" },
  { id: "mind", label: "Mind" },
  { id: "zones", label: "Zones" },
  { id: "training", label: "Training" },
  { id: "load", label: "Load" },
  { id: "after", label: "+5K" },
  { id: "race", label: "Race Lab" },
  { id: "route", label: "Route" },
  { id: "fuel", label: "Fuel" },
  { id: "recovery", label: "Recovery" },
  { id: "report", label: "Report" },
  { id: "data", label: "Data" },
];

export default function App() {
  const [session, setSession] = usePersistentSession();
  const [prefs, setPrefs] = usePrefs();
  const [tab, setTab] = useState(() => (location.hash.slice(1) && TABS.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : session ? "overview" : "data"));
  const [menu, setMenu] = useState(false);
  const [conditions, setConditions] = useState<Conditions>(DEFAULT_CONDITIONS);

  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", prefs.theme);
    root.setAttribute("data-material", prefs.material);
    root.classList.toggle("refract", prefs.material === "liquid" && supportsRefraction());
  }, [prefs]);

  useEffect(() => {
    history.replaceState(null, "", `#${tab}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [tab]);

  const analysis = useMemo(() => {
    if (!session) return undefined;
    try {
      return analyze(session);
    } catch (e) {
      console.error(e);
      return undefined;
    }
  }, [session]);

  const updateContext = (patch: Partial<SessionData["context"]>) => session && setSession({ ...session, context: { ...session.context, ...patch } });
  const needsData = !session || !analysis;
  const view = needsData || tab === "data" ? "data" : tab;

  return (
    <>
      <LiquidGlassDefs />
      <Backdrop />
      <div className="shell">
        <Glass as="header" lens className="topbar">
          <div className="brand">
            <img src="./icon.svg" alt="" />
            StrideLab <small>Endurance performance analyst</small>
          </div>
          <div className="spacer" />
          {session?.isDemo && <span className="chip demo">{icons.warn} Synthetic demo</span>}
          {session && !session.isDemo && session.context.eventName && <span className="chip">{session.context.eventName}</span>}
          <div style={{ position: "relative" }}>
            <button className="btn icon" aria-label="Display settings" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>{icons.settings}</button>
            {menu && (
              <Glass strong className="menu">
                <div className="field">Appearance
                  <div className="segmented">
                    {(["auto", "light", "dark"] as const).map((t) => <button key={t} aria-pressed={prefs.theme === t} onClick={() => setPrefs({ ...prefs, theme: t })}>{t[0].toUpperCase() + t.slice(1)}</button>)}
                  </div>
                </div>
                <div className="field">Material
                  <div className="segmented">
                    {(["liquid", "frosted", "solid"] as const).map((m) => <button key={m} aria-pressed={prefs.material === m} onClick={() => setPrefs({ ...prefs, material: m })}>{m[0].toUpperCase() + m.slice(1)}</button>)}
                  </div>
                </div>
                <p className="small muted" style={{ margin: 0 }}>
                  Liquid adds refraction on Chromium browsers; Safari and Firefox show frosted glass. “Reduce transparency” in your OS switches to solid automatically.
                </p>
              </Glass>
            )}
          </div>
        </Glass>

        <main onClick={() => menu && setMenu(false)}>
          {view === "data" && <Data s={session} setSession={setSession} onOpen={() => setTab("overview")} />}
          {view !== "data" && session && analysis && (
            <Suspense fallback={<p className="muted" style={{ padding: 20 }}>Loading…</p>}>
              {view === "overview" && <Overview s={session} a={analysis} />}
              {view === "pacing" && <Pacing s={session} a={analysis} />}
              {view === "effort" && <Effort s={session} a={analysis} />}
              {view === "mind" && <Mind a={analysis} />}
              {view === "zones" && <Zones s={session} a={analysis} />}
              {view === "training" && <Training a={analysis} />}
              {view === "load" && <Load s={session} a={analysis} />}
              {view === "after" && <After s={session} a={analysis} />}
              {view === "race" && <RaceLab s={session} a={analysis} conditions={conditions} setConditions={setConditions} updateContext={updateContext} />}
              {view === "route" && <Route s={session} conditions={conditions} />}
              {view === "fuel" && <Fuel s={session} />}
              {view === "recovery" && <Recovery s={session} a={analysis} />}
              {view === "report" && <Report s={session} a={analysis} />}
            </Suspense>
          )}
        </main>
      </div>
      <TabBar tabs={TABS} active={view} onChange={setTab} />
    </>
  );
}
