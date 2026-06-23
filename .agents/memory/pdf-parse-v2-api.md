---
name: pdf-parse v2 API
description: pdf-parse@2.x is a different module from v1 — class-based, ESM-only
---
pdf-parse@2.x (installed 2.4.5) is a full rewrite. The v1 patterns are all broken:
- v1: `const pdfParse = require("pdf-parse")` or `import("pdf-parse/lib/pdf-parse.js")`,
  called as `await pdfParse(buffer)` → returns `{ text }`. The `lib/pdf-parse.js`
  deep path does NOT exist in v2 and the package "exports" block blocks it, so the
  import throws (caught as extraction_error → PDF parsing silently fails).
- v2: ESM-only (`"type":"module"`), exports a `PDFParse` class. Usage:
  `const { PDFParse } = await import("pdf-parse"); const p = new PDFParse({ data: new Uint8Array(buf) }); const r = await p.getText(); // r.text` then `await p.destroy()`.

**Why:** architect review caught PDF resume parsing as a blocking failure; the
code was written against the v1 API but v2 was installed.
**How to apply:** in server/ai/extraction/resume.ts. Regression-test by generating
a PDF with pdfkit in-test and round-tripping it through extractResumeText().
