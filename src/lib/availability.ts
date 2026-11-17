/**
 * Fake-but-deterministic calendar for the demo.
 * Slots are derived from the client's local date so "mañana" always means
 * the visitor's tomorrow, regardless of the server's timezone.
 */

const SLOT_TIMES = ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30", "18:00"];

export type DayAvailability = {
  date: string; // YYYY-MM-DD
  dayLabel: "Mañana" | "Pasado mañana";
  label: string; // "martes, 17 de noviembre"
  slots: string[]; // ["09:00", ...]
};

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function formatDateLabel(isoDate: string, options?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    ...options,
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function hash(value: string): number {
  let h = 0;
  for (const char of value) h = (h * 31 + char.charCodeAt(0)) >>> 0;
  return h;
}

export function slotKey(date: string, time: string): string {
  return `${date}T${time}`;
}

export function getAvailability(clientDate: string, bookedSlots: readonly string[]): DayAvailability[] {
  const booked = new Set(bookedSlots);
  return ([1, 2] as const).map((offset) => {
    const date = addDays(clientDate, offset);
    const slots = SLOT_TIMES.filter(
      (time) => hash(date + time) % 4 !== 0 && !booked.has(slotKey(date, time)),
    );
    return {
      date,
      dayLabel: offset === 1 ? "Mañana" : "Pasado mañana",
      label: formatDateLabel(date),
      slots,
    };
  });
}
