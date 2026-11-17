import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import { z } from "zod";
import { createAgentTools } from "@/lib/agent-tools";
import { buildInstructions } from "@/lib/prompt";
import type { LeadUIMessage } from "@/lib/types";

// Any Vercel AI Gateway model id works here. Override with AI_MODEL.
const MODEL = process.env.AI_MODEL ?? "anthropic/claude-haiku-5.5";
const MAX_HISTORY = 40;

const requestSchema = z.object({
  messages: z.array(z.unknown()).min(1),
  clientDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  timeZone: z.string().max(64).optional(),
  bookedSlots: z.array(z.string().max(32)).max(200).optional(),
});

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { clientDate, timeZone, bookedSlots } = parsed.data;
  const ctx = {
    clientDate: clientDate ?? new Date().toISOString().slice(0, 10),
    timeZone: timeZone ?? "UTC",
    bookedSlots: bookedSlots ?? [],
  };

  // Keep the context bounded and make sure the history starts with a user turn.
  const history = (parsed.data.messages as LeadUIMessage[]).slice(-MAX_HISTORY);
  while (history.length > 0 && history[0].role !== "user") history.shift();

  const tools = createAgentTools(ctx);

  const result = streamText({
    model: MODEL,
    instructions: buildInstructions(ctx),
    messages: await convertToModelMessages(history, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: isStepCount(5),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        console.error("[api/chat]", error);
        const message = error instanceof Error ? error.message : String(error);
        if (/api key|unauthorized|authentication|oidc|401|403/i.test(message)) {
          return "El agente no tiene credenciales de IA. Configura AI_GATEWAY_API_KEY (o despliega en Vercel con AI Gateway).";
        }
        return "Alex no pudo responder ahora mismo. Inténtalo de nuevo.";
      },
    }),
  });
}
