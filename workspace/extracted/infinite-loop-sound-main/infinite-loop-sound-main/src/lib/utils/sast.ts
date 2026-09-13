// SAST (South Africa Standard Time, UTC+2) helpers
export const SAST_OFFSET = 2; // hours ahead of UTC

export function toSAST(date: Date | string | number): Date {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Date(d.getTime() + SAST_OFFSET * 60 * 60 * 1000);
}

export function formatSAST(
  date: Date | string | number,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = toSAST(date);
  return d.toLocaleString("en-GB", { timeZone: "UTC", hour12: false, ...opts });
}

export function formatSASTTime(date: Date | string | number): string {
  return formatSAST(date, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatSASTDate(date: Date | string | number): string {
  return formatSAST(date, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function sastHour(date: Date | string | number): number {
  const d = toSAST(date);
  return d.getUTCHours();
}
