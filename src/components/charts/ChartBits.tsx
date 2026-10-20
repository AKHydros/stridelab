import type { ReactNode } from "react";
import { fmtPace } from "../../lib/units";

export const axisProps = {
  stroke: "var(--grid)",
  tickLine: false,
  axisLine: { stroke: "var(--grid)" },
} as const;

export const gridProps = { stroke: "var(--grid)", vertical: false } as const;

export const paceTick = (v: number) => fmtPace(v, "");

/** Round pace domain to 15/30/60 s steps so ticks read 5:00, 5:15, 5:30… */
export function paceAxis(values: (number | undefined)[]): { domain: [number, number]; ticks: number[] } {
  const v = values.filter((x): x is number => x !== undefined && Number.isFinite(x));
  if (!v.length) return { domain: [240, 360], ticks: [240, 300, 360] };
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const step = hi - lo > 150 ? 60 : hi - lo > 60 ? 30 : 15;
  const min = Math.floor((lo - 3) / step) * step;
  const max = Math.ceil((hi + 3) / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max; t += step) ticks.push(t);
  return { domain: [min, max], ticks };
}

export interface TipRow {
  label: string;
  value: string;
  color?: string;
}

/** Glass tooltip; values in text ink, colour swatch carries identity. */
export function GlassTip({ title, rows }: { title: ReactNode; rows: TipRow[] }) {
  return (
    <div className="tooltip">
      <div className="t">{title}</div>
      {rows.map((r) => (
        <div className="r" key={r.label}>
          <span>
            {r.color && <i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: r.color, marginRight: 6 }} />}
            {r.label}
          </span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; box?: boolean; dashed?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <i className={i.box ? "box" : ""} style={{ background: i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 7px)` : i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function Interp({ children }: { children: ReactNode }) {
  return (
    <p className="interp">
      <b>Coach's read · </b>
      {children}
    </p>
  );
}
