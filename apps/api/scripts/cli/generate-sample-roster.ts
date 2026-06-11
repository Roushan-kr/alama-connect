#!/usr/bin/env tsx
/**
 * CLI script to generate the sample roster spreadsheet.
 * Outputs to apps/api/scripts/sample-roster.xlsx
 */

import * as XLSX from "xlsx";
import * as path from "node:path";
import * as fs from "node:fs";

const headers = [
  "entryNumber",
  "fullName",
  "email",
  "branch",
  "batch",
  "role",
  "phone",
  "city",
  "state",
  "linkedinUrl",
];

const sampleRows = [
  {
    entryNumber: "102103001",
    fullName: "Roushan Kumar",
    email: "roushan.kumar@ptu.ac.in",
    branch: "Computer Science and Engineering",
    batch: 2022,
    role: "STUDENT",
    phone: "9876543210",
    city: "Patiala",
    state: "Punjab",
    linkedinUrl: "https://linkedin.com/in/roushan-kumar",
  },
  {
    entryNumber: "102003042",
    fullName: "Ananya Sharma",
    email: "ananya.sharma@ptu.ac.in",
    branch: "Electronics and Communication Engineering",
    batch: 2021,
    role: "ALUMNI",
    phone: "9812345678",
    city: "Chandigarh",
    state: "Punjab",
    linkedinUrl: "https://linkedin.com/in/ananya-sharma",
  },
  {
    entryNumber: "102303115",
    fullName: "Vikram Singh",
    email: "vikram.singh@ptu.ac.in",
    branch: "Mechanical Engineering",
    batch: 2023,
    role: "STUDENT",
    phone: "9898989898",
    city: "Ludhiana",
    state: "Punjab",
    linkedinUrl: "https://linkedin.com/in/vikram-singh",
  },
];

const instructions = [
  ["REQUIRED FIELDS: entryNumber, fullName, email, branch, batch, role"],
  ["entryNumber must be unique within your network. Duplicates will be merged (existing record updated)."],
  ["batch must be a 4-digit year between 1990 and 2030."],
  ["role must be exactly: STUDENT, ALUMNI, or FACULTY (case-sensitive)."],
  ["email must be a valid email address. Duplicate emails within the file will be flagged."],
  ["Do not change column header names in the Roster sheet."],
  ["Extra columns are allowed — they will be stored in the meta field."],
  ["Maximum 50,000 rows per upload."],
];

async function main() {
  const wb = XLSX.utils.book_new();

  // 1. Create Roster sheet
  const rosterData = [
    headers,
    ...sampleRows.map((row) => [
      row.entryNumber,
      row.fullName,
      row.email,
      row.branch,
      row.batch,
      row.role,
      row.phone,
      row.city,
      row.state,
      row.linkedinUrl,
    ]),
  ];
  const wsRoster = XLSX.utils.aoa_to_sheet(rosterData);

  // Style the header row (SheetJS cell object 's' property)
  const cols = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  cols.forEach((col) => {
    const cellRef = `${col}1`;
    if (wsRoster[cellRef]) {
      wsRoster[cellRef].s = {
        font: { bold: true, name: "Calibri", sz: 11 },
        fill: { fgColor: { rgb: "DBEAFE" } },
      };
    }
  });

  // Calculate column widths
  const colWidths = headers.map((header) => {
    let maxLen = header.length;
    sampleRows.forEach((row) => {
      const val = String((row as any)[header] ?? "");
      if (val.length > maxLen) {
        maxLen = val.length;
      }
    });
    return { wch: Math.ceil(maxLen * 1.2) + 2 };
  });
  wsRoster["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, wsRoster, "Roster");

  // 2. Create Instructions sheet
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  wsInstructions["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");

  // Output destination
  const outputDir = path.resolve(process.cwd(), "scripts");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = path.join(outputDir, "sample-roster.xlsx");

  XLSX.writeFile(wb, outputPath);
  console.log(`✅ Sample roster spreadsheet generated at ${outputPath}`);
}

main().catch((err) => {
  console.error("❌ Generation failed:", err);
  process.exit(1);
});
