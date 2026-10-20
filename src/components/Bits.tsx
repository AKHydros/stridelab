import type { ReactNode } from "react";
import { icons } from "./Icons";
import { Glass } from "./glass/Glass";

export function Stat({ label, value, unit, foot }: { label: string; value: ReactNode; unit?: string; foot?: ReactNode }) {
  return (
    <Glass className="stat">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {foot && <div className="foot">{foot}</div>}
    </Glass>
  );
}

export function Pill({ kind, children }: { kind: "good" | "warn" | "bad" | "info"; children: ReactNode }) {
  const icon = kind === "good" ? icons.check : kind === "info" ? icons.info : icons.warn;
  return (
    <span className={`pill ${kind}`}>
      {icon}
      {children}
    </span>
  );
}

export function Card({ title, sub, children, className = "" }: { title?: ReactNode; sub?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Glass className={`card ${className}`}>
      {title && <h2>{title}</h2>}
      {sub && <p className="sub">{sub}</p>}
      {children}
    </Glass>
  );
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Glass className="card empty">
      <h2>{title}</h2>
      <p className="muted">{children}</p>
    </Glass>
  );
}
