---
name: PDF generation (jspdf shim)
description: Why client-side PDF export must use bundled jspdf, not the old CDN shim; firewall blocks jspdf 2.5.1.
---

# PDF generation must be synchronous/bundled

`client/src/lib/jspdf-shim.ts` exposes `jsPDF`, `autoTable`, `initJsPDF`. Many
report/compliance functions construct `const doc = new jsPDF(...)` and then call
`doc.setFontSize/text/save(...)` **synchronously**.

**Rule:** the shim must import `jspdf` + `jspdf-autotable` as real bundled
packages and call `applyPlugin(jsPDF)` so `doc.autoTable()` and
`doc.lastAutoTable.finalY` work. Do NOT load jspdf from a CDN inside an async
proxy.

**Why:** the previous shim loaded jspdf from cloudflare and created the real doc
inside `loadScripts().then(...)`. Because callers use the doc synchronously, the
underlying doc was still null at call time → methods were `undefined` → PDF
failed silently (Excel kept working because `xlsx` is bundled). Symptom reported
as "PDF is not working". Bundling also makes PDF work offline / behind the VPS
firewall.

**How to apply:** keep the shim's exports stable (`jsPDF`, `autoTable`,
`initJsPDF`, default) so the ~7 importer files need no changes. autotable v5
option names used here (head/body/startY/styles/headStyles/columnStyles) and
`lastAutoTable.finalY` are backward compatible.

**Gotcha — firewall:** `jspdf@2.5.1` is blocked by the package security firewall
(Critical CVE, Socket policy → HTTP 403). Use jspdf 3.x/4.x (CVE patched).
Installed via package manager: jspdf 4.2.1 + jspdf-autotable v5.
