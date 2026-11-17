# AI Lead Qualifier & Appointment Setter

Demo de portafolio: **Alex**, un agente comercial de IA que conversa con prospectos por un widget estilo WhatsApp, los **cualifica**, actualiza un **CRM en vivo** y **agenda citas** mediante function calling. No necesita base de datos: el estado vive en memoria y `localStorage`.

**Stack:** Next.js 16 (App Router) · Tailwind CSS v4 · Vercel AI SDK 7 (`ai`, `@ai-sdk/react`) · Zod 4 · Lucide Icons · Vercel AI Gateway

## Cómo funciona

```
Chat (useChat) ──POST /api/chat──▶ streamText + 3 tools (Zod)
     ▲                                   │
     └──── stream de UI messages ◀───────┘  (tool parts: tool-updateLeadProfile, …)
                │
                ▼
   deriveSession(messages) → Lead Profile · Citas · Métricas   (+ animación "Sincronizado por IA")
```

| Tool | Qué hace |
| --- | --- |
| `updateLeadProfile` | Extrae nombre, empresa, nicho, necesidad, presupuesto (real o estimado) y nivel de interés (frío/tibio/caliente). |
| `checkAvailability` | Devuelve horarios ficticios (deterministas) para mañana y pasado mañana, según la fecha local del visitante. |
| `bookAppointment` | Valida que el horario siga libre y registra la cita con fecha, hora y resumen del proyecto. |

- El panel CRM es una **proyección pura** de las tool parts del chat (`src/lib/crm.ts`): sin efectos ni estado duplicado.
- El navegador envía en cada request su fecha, zona horaria y las citas ya reservadas, así el servidor nunca ofrece un horario ocupado.
- Conversación, leads archivados y métricas se guardan en `localStorage`. "Nuevo lead" archiva el actual; el botón ↺ reinicia la demo.
- El "Tiempo de respuesta" se mide en el cliente (envío → primer token o tool call).

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # añade tu AI_GATEWAY_API_KEY
npm run dev
```

Obtén la API key en el dashboard de Vercel → AI Gateway. Opcional: `AI_MODEL` para cambiar de modelo (por defecto `openai/gpt-4.1-mini`, elegido por latencia).

## Despliegue en Vercel

1. Sube el repo a GitHub e impórtalo en Vercel (o ejecuta `vercel` en esta carpeta).
2. En Vercel, la autenticación con AI Gateway funciona vía **OIDC automáticamente**; no hace falta configurar la key. Si lo prefieres, añade `AI_GATEWAY_API_KEY` en *Settings → Environment Variables*.
3. Deploy. No se necesita base de datos ni ningún otro servicio.

## Estructura

```
src/
  app/api/chat/route.ts   streamText + tools, validación del body, errores amigables
  app/layout.tsx          fuentes, metadata, tema sin parpadeo
  components/
    workspace.tsx         useChat, persistencia, métricas, layout split-screen / tabs móviles
    chat-panel.tsx        widget de chat, prompts rápidos, chips de tool calls
    crm-panel.tsx         métricas, Lead Profile Card, tabla de citas, animaciones de sync
  lib/
    agent-tools.ts        definición de las 3 tools con Zod
    availability.ts       calendario ficticio determinista
    crm.ts                deriva el estado del CRM a partir de los mensajes
    prompt.ts             instrucciones de Alex
    types.ts              LeadUIMessage tipado con InferUITools
```
