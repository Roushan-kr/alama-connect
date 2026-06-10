/**
 * src/lib/roster-sanitizer.ts
 *
 * Pure function — no DB calls, no side effects.
 * Normalizes raw Excel rows into structured SanitizedRow objects.
 *
 * entryNumber normalization is the SINGLE canonical location.
 * All other consumers (verification module, merge task) read
 * already-normalized values from the DB.
 */

import { normalizeEntryNumber } from './entry-number.js'

export type RawRow = Record<string, string | number | null>

export interface SanitizedRow {
  entryNumber: string
  fullName?: string
  email?: string
  branch?: string
  batch?: number
  role?: string
  /** All non-core columns, keyed by templateVar name */
  meta: Record<string, string | number | null>
}

export interface SanitizationError {
  rowIndex: number
  entryNumber?: string
  columnName: string
  value: string | number | null
  reason: string
}

export interface SanitizationResult {
  clean: SanitizedRow[]
  errors: SanitizationError[]
}

type ColumnMapping = {
  excelHeader: string
  templateVar: string
  isCoreField: boolean
  coreField?: string
}

const CORE_FIELDS = new Set(['entryNumber', 'fullName', 'email', 'branch', 'batch', 'role'])
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VALID_ROLES = new Set(['STUDENT', 'ALUMNI', 'FACULTY'])

export function sanitizeRosterRows(
  rows: RawRow[],
  columnMappings: ColumnMapping[],
): SanitizationResult {
  const currentYear = new Date().getFullYear()
  const clean: SanitizedRow[] = []
  const errors: SanitizationError[] = []

  // Build lookup: excelHeader → mapping
  const mappingByHeader = new Map(columnMappings.map((m) => [m.excelHeader, m]))

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const rowIndex = i + 2 // 1-based + 1 for header row

    // Rule 1: Drop fully-empty rows (already done in parser, but guard here too)
    const allEmpty = Object.values(row).every(
      (v) => v === null || String(v).trim() === ''
    )
    if (allEmpty) continue

    let hasHardError = false
    const rowErrors: SanitizationError[] = []
    
    // Core fields initialized or conditionally spread to avoid undefined assignment
    let entryNumber = ''
    let fullName: string | undefined
    let email: string | undefined
    let branch: string | undefined
    let batch: number | undefined
    let role: string | undefined
    const meta: Record<string, string | number | null> = {}

    // Rule 2: Trim all string values (done in parser, but ensure)
    const trimmed: RawRow = {}
    for (const [k, v] of Object.entries(row)) {
      trimmed[k] = typeof v === 'string' ? v.trim() : v
    }

    for (const [header, rawValue] of Object.entries(trimmed)) {
      const mapping = mappingByHeader.get(header)
      const templateVar = mapping?.templateVar ?? header
      const isCoreField = mapping?.isCoreField ?? false
      const coreField = mapping?.coreField

      if (isCoreField && coreField && CORE_FIELDS.has(coreField)) {
        // Process as a core structured field
        switch (coreField) {
          case 'entryNumber': {
            if (!rawValue || String(rawValue).trim() === '') {
              rowErrors.push({
                rowIndex, columnName: header, value: rawValue,
                reason: 'entryNumber is required and cannot be empty',
              })
              hasHardError = true
            } else {
              entryNumber = normalizeEntryNumber(String(rawValue))
            }
            break
          }

          case 'fullName': {
            if (rawValue !== null && rawValue !== '') fullName = String(rawValue)
            break
          }

          case 'email': {
            if (rawValue && !EMAIL_REGEX.test(String(rawValue))) {
              rowErrors.push({
                rowIndex,
                ...(entryNumber ? { entryNumber } : {}),
                columnName: header,
                value: rawValue,
                reason: `"${rawValue}" is not a valid email address`,
              })
              // email errors are NOT hard errors — row still imports without email
            } else {
              if (rawValue !== null && rawValue !== '') email = String(rawValue)
            }
            break
          }

          case 'branch': {
            if (rawValue !== null && rawValue !== '') branch = String(rawValue)
            break
          }

          case 'batch': {
            if (rawValue !== null && rawValue !== '') {
              // Rule: coerce string to int — handles CSV where everything is a string
              const batchInt =
                typeof rawValue === 'string' ? parseInt(rawValue, 10) : Number(rawValue)
              if (isNaN(batchInt) || batchInt < 1990 || batchInt > currentYear + 6) {
                rowErrors.push({
                  rowIndex,
                  ...(entryNumber ? { entryNumber } : {}),
                  columnName: header,
                  value: rawValue,
                  reason: `Batch year must be between 1990 and ${currentYear + 6}, got "${rawValue}"`,
                })
              } else {
                batch = batchInt
              }
            }
            break
          }

          case 'role': {
            if (rawValue) {
              const normalized = String(rawValue).toUpperCase().trim()
              if (!VALID_ROLES.has(normalized)) {
                rowErrors.push({
                  rowIndex,
                  ...(entryNumber ? { entryNumber } : {}),
                  columnName: header,
                  value: rawValue,
                  reason: `Role must be one of STUDENT, ALUMNI, FACULTY — got "${rawValue}"`,
                })
              } else {
                role = normalized
              }
            }
            break
          }
        }
      } else {
        // Non-core or unmapped: store in meta keyed by templateVar
        if (rawValue !== null && rawValue !== '') {
          meta[templateVar] = rawValue
        }
      }
    }

    // Collect all row errors
    errors.push(...rowErrors)

    if (hasHardError) continue // Skip rows missing entryNumber

    clean.push({
      entryNumber,
      meta,
      ...(fullName !== undefined ? { fullName } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(branch !== undefined ? { branch } : {}),
      ...(batch !== undefined ? { batch } : {}),
      ...(role !== undefined ? { role } : {}),
    })
  }

  return { clean, errors }
}
