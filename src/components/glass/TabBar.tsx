import { useLayoutEffect, useRef, useState } from "react";
import { icons } from "../Icons";
import { Glass } from "./Glass";

export interface TabDef {
  id: string;
  label: string;
}

/** Floating capsule tab bar with a springy liquid indicator. */
export function TabBar({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (id: string) => void }) {
  const barRef = useRef<HTMLElement>(null);
  const [ind, setInd] = useState({ left: 6, width: 64 });
  useLayoutEffect(() => {
    const bar = barRef.current;
    const el = bar?.querySelector<HTMLButtonElement>(`[data-tab="${active}"]`);
    if (!bar || !el) return;
    const update = () => setInd({ left: el.offsetLeft, width: el.offsetWidth });
    update();
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [active]);
  return (
    <div className="tabbar-wrap">
      <Glass as="nav" lens className="tabbar" role="tablist" aria-label="Sections" ref={barRef}>
        <span className="indicator" style={{ left: ind.left, width: ind.width }} aria-hidden="true" />
        {tabs.map((t) => (
          <button key={t.id} data-tab={t.id} role="tab" aria-selected={active === t.id} className="tab" onClick={() => onChange(t.id)}>
            {icons[t.id]}
            {t.label}
          </button>
        ))}
      </Glass>
    </div>
  );
}
