import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generatePresentationLayoutOnServer } from "./presentation-layout.server";

export const audienceDistanceSchema = z.enum(["near", "room", "projector"]);
export type AudienceDistance = z.infer<typeof audienceDistanceSchema>;

export const presentationLayoutSchema = z.object({
  metricScale: z.enum(["standard", "large"]),
  roadEmphasis: z.enum(["standard", "high"]),
  statusPlacement: z.enum(["top", "side"]),
  showSensorDetails: z.boolean(),
  rationale: z.string(),
});
export type PresentationLayout = z.infer<typeof presentationLayoutSchema>;

const inputSchema = z.object({
  audienceDistance: audienceDistanceSchema,
  runLabel: z.string(),
});

export const generatePresentationLayout = createServerFn({ method: "POST" })
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data }) => generatePresentationLayoutOnServer(data));
