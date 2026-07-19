import { env } from "cloudflare:workers";

export type AiProvider = "gemini" | "openai";

export type HighlightText = {
  ja: string;
  en: string;
};

export type BoutHighlightCopy = {
  east: HighlightText;
  west: HighlightText;
  key: HighlightText;
};

export type BoutHighlightFacts = {
  schemaVersion: "1";
  bashoId: number;
  day: number;
  division: { id: number; nameJa: string };
  east: {
    nskId: number;
    nameJa: string;
    nameEn: string;
    rankJa: string;
    wins: number;
    losses: number;
    elo: number;
    glicko2: number;
    glickoRd: number;
    heightCm: number | null;
    weightKg: number | null;
  };
  west: {
    nskId: number;
    nameJa: string;
    nameEn: string;
    rankJa: string;
    wins: number;
    losses: number;
    elo: number;
    glicko2: number;
    glickoRd: number;
    heightCm: number | null;
    weightKg: number | null;
  };
  matchup: {
    eastWinProbability: number;
    westWinProbability: number;
    confidence: "high" | "medium" | "low";
    headToHeadBouts: number;
    eastHeadToHeadWins: number;
    westHeadToHeadWins: number;
  };
};

export const HIGHLIGHT_PROMPT_VERSION = "sumo-biyori-highlights-v1";
export const HIGHLIGHT_SCHEMA_VERSION = "1";

const outputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    east: { $ref: "#/$defs/highlightText" },
    west: { $ref: "#/$defs/highlightText" },
    key: { $ref: "#/$defs/highlightText" },
  },
  required: ["east", "west", "key"],
  $defs: {
    highlightText: {
      type: "object",
      additionalProperties: false,
      properties: {
        ja: { type: "string", minLength: 1, maxLength: 220 },
        en: { type: "string", minLength: 1, maxLength: 280 },
      },
      required: ["ja", "en"],
    },
  },
} as const;

const systemInstruction = `You are the bout-preview editor for Sumo Biyori.
Use only the supplied JSON facts. Never invent injuries, techniques, promotion stakes, streaks, quotes, or history.
Return exactly three short perspectives: east wrestler, west wrestler, and the matchup key.
Each perspective must contain natural Japanese and natural English with the same meaning.
Make each entry one or two concise sentences. Explain what makes the bout interesting; do not claim the forecast is certain.
Do not repeat raw data unless it supports the point. Do not use Markdown.`;

type RuntimeEnv = {
  AI_PROVIDER?: AiProvider;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

export type AiHighlightSettings = {
  provider: AiProvider;
  model: string;
};

function runtime(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

export function getAiHighlightSettings(): AiHighlightSettings {
  const provider = runtime().AI_PROVIDER === "openai" ? "openai" : "gemini";
  return {
    provider,
    model: provider === "openai"
      ? runtime().OPENAI_MODEL?.trim() || "gpt-5.6-luna"
      : runtime().GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite",
  };
}

function outputTextFromOpenAi(payload: unknown): string | null {
  const record = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
  };
  if (typeof record.output_text === "string") return record.output_text;
  for (const item of record.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

function outputTextFromGemini(payload: unknown): string | null {
  const record = payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  };
  const parts = record.candidates?.[0]?.content?.parts ?? [];
  const text = parts.flatMap((part) => typeof part.text === "string" ? [part.text] : []).join("");
  return text || null;
}

async function checkedJson(response: Response): Promise<unknown> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = JSON.stringify(payload).slice(0, 600);
    throw new Error(`AI provider request failed (${response.status}): ${detail}`);
  }
  return payload;
}

async function generateWithGemini(facts: BoutHighlightFacts, model: string): Promise<string> {
  const apiKey = runtime().GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(facts) }] }],
        generationConfig: {
          temperature: 0.25,
          responseMimeType: "application/json",
          responseJsonSchema: outputSchema,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  const payload = await checkedJson(response);
  const text = outputTextFromGemini(payload);
  if (!text) throw new Error("Gemini returned no structured text");
  return text;
}

async function generateWithOpenAi(facts: BoutHighlightFacts, model: string): Promise<string> {
  const apiKey = runtime().OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      reasoning: { effort: "none" },
      instructions: systemInstruction,
      input: JSON.stringify(facts),
      text: {
        format: {
          type: "json_schema",
          name: "sumo_bout_highlights",
          strict: true,
          schema: outputSchema,
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await checkedJson(response);
  const text = outputTextFromOpenAi(payload);
  if (!text) throw new Error("OpenAI returned no structured text");
  return text;
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

export function parseBoutHighlightCopy(value: unknown): BoutHighlightCopy {
  const candidate = value as Partial<Record<"east" | "west" | "key", Partial<HighlightText>>>;
  for (const key of ["east", "west", "key"] as const) {
    if (!validText(candidate?.[key]?.ja, 220) || !validText(candidate?.[key]?.en, 280)) {
      throw new Error(`Invalid AI highlight output at ${key}`);
    }
  }
  return {
    east: { ja: candidate.east!.ja!.trim(), en: candidate.east!.en!.trim() },
    west: { ja: candidate.west!.ja!.trim(), en: candidate.west!.en!.trim() },
    key: { ja: candidate.key!.ja!.trim(), en: candidate.key!.en!.trim() },
  };
}

export async function generateBoutHighlightCopy(
  facts: BoutHighlightFacts,
  settings = getAiHighlightSettings(),
): Promise<BoutHighlightCopy> {
  const text = settings.provider === "openai"
    ? await generateWithOpenAi(facts, settings.model)
    : await generateWithGemini(facts, settings.model);
  return parseBoutHighlightCopy(JSON.parse(text));
}

export function boutHighlightId(
  bashoId: number,
  day: number,
  division: number,
  eastNskId: number,
  westNskId: number,
): string {
  return `${bashoId}-${day}-${division}-${eastNskId}-${westNskId}`;
}
