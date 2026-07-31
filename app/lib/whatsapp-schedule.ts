import "server-only";

const DEFAULT_TIME_ZONE = "Asia/Kolkata";
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function parseClock(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function localMinuteOfDay(date: Date, timeZone: string) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }

  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function getWhatsAppTimeZone() {
  return process.env.WHATSAPP_TIME_ZONE?.trim() || DEFAULT_TIME_ZONE;
}

export function isWhatsAppQuietTime(
  date: Date,
  start: string,
  end: string,
  timeZone = getWhatsAppTimeZone(),
) {
  const startMinute = parseClock(start);
  const endMinute = parseClock(end);
  if (startMinute === null || endMinute === null || startMinute === endMinute) return false;

  const currentMinute = localMinuteOfDay(date, timeZone);
  return startMinute < endMinute
    ? currentMinute >= startMinute && currentMinute < endMinute
    : currentMinute >= startMinute || currentMinute < endMinute;
}

export function moveOutsideWhatsAppQuietTime(
  candidate: Date,
  start: string,
  end: string,
  timeZone = getWhatsAppTimeZone(),
) {
  let adjusted = new Date(candidate);

  for (let minute = 0; minute <= 24 * 60 + 1; minute += 1) {
    if (!isWhatsAppQuietTime(adjusted, start, end, timeZone)) return adjusted;
    adjusted = new Date(Math.floor(adjusted.getTime() / 60_000) * 60_000 + 60_000);
  }

  return adjusted;
}

export function randomDelaySeconds(minimum: number, maximum: number) {
  const min = Math.max(5, Math.floor(Math.min(minimum, maximum)));
  const max = Math.max(min, Math.floor(Math.max(minimum, maximum)));
  return min + Math.floor(Math.random() * (max - min + 1));
}