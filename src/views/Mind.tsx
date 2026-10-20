import { Card, Empty, Pill } from "../components/Bits";
import { Glass } from "../components/glass/Glass";
import type { Analysis } from "../lib/analysis/analyze";

const kind = (s: string) => (s === "Supports" ? "good" : s === "Partially supports" ? "info" : s === "Cannot substantiate" ? "warn" : "info") as "good" | "info" | "warn";

export function Mind({ a }: { a: Analysis }) {
  const items = a.event?.commentary ?? [];
  return (
    <div className="page">
      <Glass className="hero">
        <div className="eyebrow">Module E · Subjective vs objective</div>
        <h1>What you felt vs what was recorded</h1>
        <p>Each observation is located on the lap where it was written and checked against that lap's pace (vs the event and the preceding three laps), heart rate and power. The classification is a heuristic for the coach to review — never a diagnosis.</p>
      </Glass>
      {!items.length && <Empty title="No observations found">Add a Notes/Comments column to the Garmin split file, or type observations on the Data tab.</Empty>}
      <div className="grid g2">
        {items.map((c, i) => (
          <Card key={i} title={<>“{c.text}”</>} sub={c.atKm ? `Lap ${c.lap?.index} · ${c.atKm}` : "Not tied to a lap"}>
            <div className="row" style={{ marginBottom: 8 }}>
              <Pill kind={kind(c.support)}>{c.support}</Pill>
              <Pill kind="info">{c.sentiment === "strain" ? "Reports strain" : c.sentiment === "positive" ? "Reports feeling good" : "Neutral / contextual"}</Pill>
            </div>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {c.evidence.map((e) => <li key={e}>{e}</li>)}
            </ul>
            <p className="interp">
              <b>Coaching implication · </b>
              {c.sentiment === "strain"
                ? c.support === "Supports"
                  ? "The data shows the same change you felt. Plan a response for this point in the marathon (cue words, fuel timing, a 'next 5 km only' focus)."
                  : c.support === "Partially supports"
                    ? "Some metrics moved with the sensation. Perceived effort may be leading the data — useful as an early warning, not a reason to slow automatically."
                    : "Output held despite the sensation — evidence you can keep pace through this feeling. Rehearse that self-talk."
                : c.sentiment === "positive"
                  ? "Note what preceded this state (pace, fuel, terrain) so it can be repeated."
                  : "Context recorded for the debrief."}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
