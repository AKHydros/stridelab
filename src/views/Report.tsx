import { useMemo, useRef, useState } from "react";
import { Card, Pill } from "../components/Bits";
import { Markdown } from "../components/Markdown";
import { Glass } from "../components/glass/Glass";
import { COACH_MODEL, describeError, runCoach } from "../lib/ai/coach";
import type { Analysis } from "../lib/analysis/analyze";
import { buildReport } from "../lib/report/markdown";
import { sessionValue, setSessionValue } from "../lib/store";
import type { SessionData } from "../lib/types";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Report({ s, a }: { s: SessionData; a: Analysis }) {
  const [mode, setMode] = useState<"engine" | "ai">("engine");
  const report = useMemo(() => buildReport(s, a), [s, a]);
  const [key, setKey] = useState(() => sessionValue("stridelab.apikey"));
  const [ai, setAi] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  const abort = useRef<AbortController>();
  const slug = (s.context.eventName || "session").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  const generate = async () => {
    setAi("");
    setErr("");
    setStatus("running");
    abort.current = new AbortController();
    try {
      await runCoach(key.trim(), s, a, { onText: (t) => setAi((x) => x + t) }, abort.current.signal);
      setStatus("done");
    } catch (e) {
      setErr(describeError(e));
      setStatus("error");
    }
  };

  return (
    <div className="page">
      <Glass className="hero no-print">
        <div className="eyebrow">Sections 1–10 · Coach's final verdict</div>
        <h1>Performance debrief</h1>
        <p>The <b>engine report</b> is deterministic: every number is computed and verified in your browser. The optional <b>AI coach</b> sends the same validated metrics and your master prompt to Claude for a narrative debrief.</p>
        <div className="row" style={{ marginTop: 14 }}>
          <div className="segmented" role="group" aria-label="Report source">
            <button aria-pressed={mode === "engine"} onClick={() => setMode("engine")}>Engine report</button>
            <button aria-pressed={mode === "ai"} onClick={() => setMode("ai")}>AI coach (Claude)</button>
          </div>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn" onClick={() => download(`${slug}-${mode === "ai" ? "ai-" : ""}debrief.md`, mode === "ai" ? ai : report)} disabled={mode === "ai" && !ai}>Download .md</button>
          <button className="btn" onClick={() => window.print()}>Print / PDF</button>
        </div>
      </Glass>

      {mode === "ai" && (
        <Card title="AI coach" sub={`Model ${COACH_MODEL} · adaptive thinking · system prompt = your master prompt (docs/MASTER_PROMPT.md).`} className="no-print">
          <div className="callout small" style={{ marginBottom: 12 }}>
            <Pill kind="info">Privacy</Pill>
            <span>Your Anthropic API key stays in this tab (session storage) and is sent only to api.anthropic.com along with the normalised session data. For a shared deployment, proxy the call through your own server instead.</span>
          </div>
          <div className="row">
            <label className="field" style={{ flex: "1 1 280px" }}>Anthropic API key
              <input type="password" autoComplete="off" placeholder="sk-ant-…" value={key} onChange={(e) => { setKey(e.target.value); setSessionValue("stridelab.apikey", e.target.value); }} />
            </label>
            {status === "running"
              ? <button className="btn" onClick={() => abort.current?.abort()}>Stop</button>
              : <button className="btn primary" disabled={!key.trim()} onClick={generate}>Generate debrief</button>}
          </div>
          {status === "running" && <p className="small muted">Analysing… the debrief streams in below.</p>}
          {err && <p className="small" style={{ color: "var(--bad)" }}>{err}</p>}
        </Card>
      )}

      <Card>
        {mode === "engine" ? <Markdown text={report} /> : ai ? <Markdown text={ai} /> : <p className="muted">No AI debrief yet.</p>}
      </Card>
    </div>
  );
}
