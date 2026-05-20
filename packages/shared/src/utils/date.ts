import { DateTime } from "luxon"

const TIMEZONE = "Asia/Kolkata"

/**
 * Get current timestamp in Asia/Kolkata timezone (in milliseconds)
 * Replaces Date.now() for timezone-aware operations
 */
export function nowTimestamp(): number {
  return DateTime.now().setZone(TIMEZONE).toMillis()
}

/**
 * Get current ISO string in Asia/Kolkata timezone
 */
export function nowISO(): string {
  return DateTime.now().setZone(TIMEZONE).toISO() || ""
}

/**
 * Get current Date object converted from Asia/Kolkata timezone
 */
export function nowDate(): Date {
  return DateTime.now().setZone(TIMEZONE).toJSDate()
}

/**
 * Get current DateTime object in Asia/Kolkata timezone
 */
export function nowDateTime(): DateTime {
  return DateTime.now().setZone(TIMEZONE)
}

/**
 * Convert a Date or timestamp to Asia/Kolkata timezone
 */
export function toKolkataTZ(date: Date | number | string): DateTime {
  return DateTime.fromJSDate(
    typeof date === "number" || typeof date === "string" ? new Date(date) : date,
  ).setZone(TIMEZONE)
}

/**
 * Get current timestamp in UTC (for database storage)
 * Use this when you need to store in DB and convert to IST for display
 */
export function nowUTC(): Date {
  return DateTime.utc().toJSDate()
}

/**
 * Format date in Asia/Kolkata timezone with custom format
 * Example: formatDate(new Date(), 'yyyy-MM-dd HH:mm:ss')
 */
export function formatDate(date: Date | number, format: string = "yyyy-MM-dd HH:mm:ss"): string {
  const dt = typeof date === "number" ? DateTime.fromMillis(date) : DateTime.fromJSDate(date)
  return dt.setZone(TIMEZONE).toFormat(format)
}
