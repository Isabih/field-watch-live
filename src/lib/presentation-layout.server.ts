import { createOpenAI } from "@ai-sdk/openai";
import { NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./ai-run-id.server";
import { presentationLayoutSchema, type AudienceDistance, type PresentationLayout } from "./presentation-layout.functions";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

function safeGatewayMessage(error: unknown) {
  const fallback = "Lovable AI could not create a layout right now. Your current layout is unchanged.";
  if (!(error instanceof Error)) return fallback;
  const candidates = [error.message, "responseBody" in error && typeof error.responseBody === "string" ? error.responseBody : ""];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as { message?: unknown; error?: { message?: unknown } };
      const message = parsed.message ?? parsed.error?.message;
      if (typeof message === "string" && message.trim()) return message;
    } catch {
      if (!candidate.includes("LOVABLE_API_KEY") && candidate.length < 240) return candidate;
    }
  }
  return fallback;
}

export async function generatePresentationLayoutOnServer(input: { audienceDistance: AudienceDistance; runLabel: string }): Promise<PresentationLayout> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Lovable AI is not configured for this project.");

  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const output = Output.object({ schema: presentationLayoutSchema });
  const prompt = `Design a distraction-free live field-monitoring presentation layout for this operator context.\nAudience distance: ${input.audienceDistance}.\nRun label: ${input.runLabel.trim() || "Current run"}.\nAvailable sections: score metrics, virtual road, stage status, ultrasonic sensor, line sensor, connection health.\nChoose only the provided schema values. Projector viewing should favor large metrics, high road emphasis, top status, and reduced secondary detail. Near viewing may retain detail. Keep the rationale to one short sentence.`;

  try {
    const result = streamText({
      model: provider.responses(MODEL),
      output,
      prompt,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    return presentationLayoutSchema.parse(await result.output);
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      try {
        if (!error.text) throw new Error("Missing AI output");
        return presentationLayoutSchema.parse(JSON.parse(error.text));
      } catch {
        throw new Error("Lovable AI returned an invalid layout. Your current layout is unchanged.");
      }
    }
    throw new Error(safeGatewayMessage(error));
  }
}
