import { tool } from "ai";
import { z } from "zod";
import { getAvailability, slotKey } from "./availability";

export type AgentContext = {
  clientDate: string; // visitor's local date, YYYY-MM-DD
  timeZone: string;
  bookedSlots: string[]; // "YYYY-MM-DDTHH:mm" already taken (from the browser's CRM state)
};

export const INTEREST_LEVELS = ["frio", "tibio", "caliente"] as const;
export type InterestLevel = (typeof INTEREST_LEVELS)[number];

/**
 * Tools run on the server. They don't touch a database: their validated
 * inputs/outputs stream to the browser as typed tool parts, and the CRM panel
 * derives its state from them (persisted in localStorage).
 */
export function createAgentTools(ctx: AgentContext) {
  // Slots booked during this request (multi-step) are blocked as well.
  const takenSlots = new Set(ctx.bookedSlots);

  return {
    updateLeadProfile: tool({
      description:
        "Actualiza la ficha del lead en el CRM en tiempo real. Llámala en cuanto detectes un dato nuevo o un cambio. Envía solo los campos nuevos o modificados.",
      inputSchema: z.object({
        name: z.string().optional().describe("Nombre de la persona de contacto"),
        company: z.string().optional().describe("Nombre de la empresa o negocio"),
        niche: z
          .string()
          .optional()
          .describe("Industria o nicho, p. ej. 'Clínica dental', 'Inmobiliaria'"),
        needs: z
          .string()
          .optional()
          .describe("Resumen de la necesidad en una frase (máx. 120 caracteres)"),
        budget: z
          .string()
          .optional()
          .describe("Presupuesto como rango legible, p. ej. 'USD 3.000 – 6.000'"),
        budgetIsEstimate: z
          .boolean()
          .optional()
          .describe("true si el presupuesto lo estimas tú y no lo dijo el cliente"),
        interestLevel: z
          .enum(INTEREST_LEVELS)
          .optional()
          .describe("frio: explorando · tibio: necesidad clara sin fecha · caliente: urgencia o quiere agendar"),
      }),
      execute: async (input) => ({
        ok: true as const,
        updatedFields: Object.keys(input).filter(
          (key) => input[key as keyof typeof input] !== undefined,
        ),
        syncedAt: new Date().toISOString(),
      }),
    }),

    checkAvailability: tool({
      description:
        "Consulta los horarios libres para una llamada de descubrimiento de 30 minutos (mañana y pasado mañana).",
      inputSchema: z.object({
        day: z
          .enum(["manana", "pasado_manana", "ambos"])
          .describe("Qué día(s) consultar. Usa 'ambos' si el cliente no especifica."),
      }),
      execute: async ({ day }) => {
        const days = getAvailability(ctx.clientDate, [...takenSlots]).filter(
          (d) =>
            day === "ambos" ||
            (day === "manana" && d.dayLabel === "Mañana") ||
            (day === "pasado_manana" && d.dayLabel === "Pasado mañana"),
        );
        return { timeZone: ctx.timeZone, durationMinutes: 30, days };
      },
    }),

    bookAppointment: tool({
      description:
        "Registra una cita confirmada. Úsala solo cuando el cliente haya elegido un horario disponible y conozcas su nombre.",
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Fecha en formato YYYY-MM-DD"),
        time: z.string().regex(/^\d{2}:\d{2}$/).describe("Hora en formato HH:mm (24 h)"),
        leadName: z.string().min(1).describe("Nombre del cliente"),
        company: z.string().optional().describe("Empresa o negocio del cliente"),
        projectSummary: z.string().min(1).describe("Resumen del proyecto en una frase"),
      }),
      execute: async ({ date, time, leadName, company, projectSummary }) => {
        const availability = getAvailability(ctx.clientDate, [...takenSlots]);
        const day = availability.find((d) => d.date === date);

        if (!day || !day.slots.includes(time)) {
          return {
            status: "unavailable" as const,
            reason: day
              ? "Ese horario ya no está disponible."
              : "Solo se puede agendar para mañana o pasado mañana.",
            alternatives: availability,
          };
        }

        takenSlots.add(slotKey(date, time));
        return {
          status: "confirmed" as const,
          appointment: {
            id: `APT-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
            date,
            time,
            timeZone: ctx.timeZone,
            leadName,
            company,
            projectSummary,
            createdAt: new Date().toISOString(),
          },
        };
      },
    }),
  };
}
