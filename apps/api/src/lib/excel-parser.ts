/**
 * src/lib/excel-parser.ts
 *
 * Parses an Excel (.xlsx, .xls) or CSV buffer into rows using SheetJS.
 *
 * Rules:
 * - Only the first sheet is read (index 0, not by name — works for CSV too).
 * - First non-empty row is the header row.
 * - { raw: false } coerces all values to strings to avoid Excel date serials.
 * - Enforces max 50,000 rows.
 * - Empty cells become null.
 *
 * CSV note: SheetJS wraps CSV in a synthetic sheet at SheetNames[0].
 * All values will be strings; batch coercion is handled in the sanitizer.
 */

import * as XLSX from 'xlsx'

export type RawRow = Record<string, string | number | null>

export class RosterTooLargeError extends Error {
  constructor(count: number) {
    super(`Roster has ${count} rows which exceeds the 50,000 row limit`)
    this.name = 'RosterTooLargeError'
  }
}

export function parseExcelBuffer(buffer: Buffer): {
  headers: string[]
  rows: RawRow[]
} {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false })

  // Always use index 0 — works for both .xlsx (named sheets) and .csv (synthetic sheet)
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { headers: [], rows: [] }
  }

  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    return { headers: [], rows: [] }
  }

  // Parse into array-of-arrays to control header extraction manually
  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: null,
  }) as Array<Array<string | null>>

  // Find first non-empty row as header row
  const headerRowIdx = raw.findIndex((row) =>
    row && row.some((cell) => cell !== null && String(cell).trim() !== '')
  )
  if (headerRowIdx === -1) return { headers: [], rows: [] }

  const headerRow = raw[headerRowIdx]
  if (!headerRow) return { headers: [], rows: [] }

  const headers = headerRow
    .map((h) => (h !== null ? String(h).trim() : ''))
    .filter(Boolean)

  const dataRows = raw.slice(headerRowIdx + 1)

  if (dataRows.length > 50_000) {
    throw new RosterTooLargeError(dataRows.length)
  }

  const rows: RawRow[] = dataRows
    .filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ''))
    .map((row) => {
      const obj: RawRow = {}
      headers.forEach((header, i) => {
        const cell = row[i] ?? null
        if (cell === null || String(cell).trim() === '') {
          obj[header] = null
        } else {
          // Preserve as string — batch coercion happens in sanitizer
          obj[header] = String(cell).trim()
        }
      })
      return obj
    })

  return { headers, rows }
}
