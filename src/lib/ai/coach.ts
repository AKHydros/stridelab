import Anthropic from "@anthropic-ai/sdk";
import masterPrompt from "../../../docs/MASTER_PROMPT.md?raw";
import type { Analysis } from "../analysis/analyze";
import type { Lap, SessionData } from "../types";

export const COACH_MODEL = "claude-opus-5-5";

const lapTable = (laps: Lap[]) =>
  ["lap,distance_km,time_s,avg_hr,max_hr,cadence_spm,power_w,ascent_m,descent_m,note"]
    .concat(
      laps.map((l) =>
        [l.index, l.distanceKm.toFixed(3), l.timeS.toFixed(1), l.avgHr ?? "", l.maxHr ?? "", l.cadence ?? "", l.power?.toFixed(0) ?? "", l.ascentM ?? "", l.descentM ?? "", JSON.stringify(l.note ?? "")].join(","),
      ),
    )
    .join("\n");

/**
 * Build the user turn: athlete context, the normalised source tables and the
 * engine's validated calculations. The model is told to treat the computed
 * values as the arithmetic source of truth so narrative and numbers agree.
 */
export function buildCoachInput(s: SessionData, a: Analysis): string {
  const c = s.context;
  const training = s.training?.records
    .map((r) => [r.date, r.title.replace(/,/g, " "), r.distanceKm.toFixed(2), r.timeS.toFixed(0), r.avgHr ?? ""].join(","))
    .join("\n");
  const computed = JSON.parse(
    JSON.stringify(a, (k, v) => (k === "laps" || k === "records" ? undefined : typeof v === "number" ? Number(v.toFixed(3)) : v)),
  );
  return [
    "<athlete_context>",
    JSON.stringify(c, null, 2),
    "</athlete_context>",
    s.isDemo ? "<note>These files are SYNTHETIC demo data. Say so at the top of the report.</note>" : "",
    "<file name=\"Garmin Split Analysis (main event, normalised)\">",
    s.event ? lapTable(a.event?.laps ?? s.event.laps) : "Not supplied",
    s.event?.looseNotes.length ? "Free-text notes: " + s.event.looseNotes.join(" | ") : "",
    "</file>",
    "<file name=\"Stryd Analysis\">",
    s.stryd ? (s.stryd.laps.length ? lapTable(s.stryd.laps) : `${s.stryd.samples.length} per-second samples (summarised in computed metrics)`) : "Not supplied",
    s.stryd?.criticalPowerW ? `Critical power: ${s.stryd.criticalPowerW} W` : "",
    "</file>",
    "<file name=\"Garmin Running Activity Summary\">",
    training ? "date,title,distance_km,time_s,avg_hr\n" + training : "Not supplied",
    "</file>",
    "<file name=\"Cool Down 5K Garmin Split\">",
    s.cooldown ? lapTable(s.cooldown.laps) : "Not supplied",
    "</file>",
    "<computed_metrics>",
    "Validated by the app's deterministic engine (units: km, s, s/km, bpm, W). Use these values as the arithmetic source of truth; where you derive anything new, show the method.",
    JSON.stringify(computed),
    "</computed_metrics>",
    "Charts are rendered by the app from the same data, so for section 6 graphs give the coaching interpretation for each graph and refer to them as Graph 1–5 rather than drawing them.",
    "Write the report in Markdown.",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface CoachCallbacks {
  onText: (delta: string) => void;
}

export async function runCoach(apiKey: string, s: SessionData, a: Analysis, cb: CoachCallbacks, signal?: AbortSignal): Promise<string> {
  // The key stays in this browser and is sent only to api.anthropic.com.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const stream = client.beta.messages.stream(
    {
      model: COACH_MODEL,
      max_tokens: 64000,
      // Re-run on Anthropic's recommended fallback model if the request is declined.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system: masterPrompt,
      messages: [{ role: "user", content: buildCoachInput(s, a) }],
    },
    { signal },
  );
  stream.on("text", cb.onText);
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") throw new Error("The model declined this request.");
  if (final.stop_reason === "max_tokens") cb.onText("\n\n*(Report truncated at the output limit.)*");
  return final.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

export function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Invalid API key.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key does not have access to the model.";
  if (e instanceof Anthropic.RateLimitError) return "Rate limited — wait a moment and retry.";
  if (e instanceof Anthropic.APIUserAbortError) return "Stopped.";
  if (e instanceof Anthropic.APIConnectionError) return "Network error reaching the Claude API.";
  if (e instanceof Anthropic.APIError) return `Claude API error ${e.status ?? ""}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
