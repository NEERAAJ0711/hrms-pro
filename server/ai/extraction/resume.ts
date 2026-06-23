import * as fs from "fs";
import * as path from "path";
import type { ParsedResume, AiResult } from "../recruitment/types";
import { buildResumeParsePrompt } from "../recruitment/prompts";
import { callRecruitmentJson } from "../recruitment/ai-json";

// ─── Resume text extraction + AI parsing ──────────────────────────────────────
// Supports PDF, DOCX and TXT. Extraction is library-based (no AI); parsing the
// extracted text into structured fields reuses the provider/prompt layer with
// the same OpenAI→Gemini fallback and graceful "no AI key" behavior as KYC.

export const RESUME_EXTENSIONS = [".pdf", ".docx", ".txt"] as const;

export function isResumeExtractable(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return (RESUME_EXTENSIONS as readonly string[]).includes(ext);
}

export interface ResumeTextResult {
  ok: boolean;
  text?: string;
  reason?: string;
}

// Extract plain text from a resume file on disk. Never throws — returns ok:false.
export async function extractResumeText(absFilePath: string, fileName: string): Promise<ResumeTextResult> {
  const ext = path.extname(fileName || absFilePath).toLowerCase();
  try {
    if (!fs.existsSync(absFilePath)) return { ok: false, reason: "file_not_found" };

    if (ext === ".txt") {
      const text = fs.readFileSync(absFilePath, "utf-8");
      return finalizeText(text);
    }

    if (ext === ".pdf") {
      // pdf-parse@2.x exposes a PDFParse class: construct with the buffer, then
      // getText() returns a TextResult whose `text` is the whole-document string.
      const { PDFParse } = (await import("pdf-parse")) as any;
      const buf = fs.readFileSync(absFilePath);
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      try {
        const result = await parser.getText();
        return finalizeText(result?.text || "");
      } finally {
        await parser.destroy?.();
      }
    }

    if (ext === ".docx") {
      const mammoth: any = await import("mammoth");
      const result = await mammoth.extractRawText({ path: absFilePath });
      return finalizeText(result?.value || "");
    }

    return { ok: false, reason: "unsupported_format" };
  } catch (err: any) {
    console.warn("[AI] Resume text extraction failed:", err?.message);
    return { ok: false, reason: "extraction_error" };
  }
}

function finalizeText(raw: string): ResumeTextResult {
  const text = (raw || "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (!text) return { ok: false, reason: "empty_document" };
  return { ok: true, text };
}

// Parse extracted resume text into structured candidate fields via AI.
export async function parseResumeText(resumeText: string, companyId?: string | null): Promise<AiResult<ParsedResume>> {
  const text = (resumeText || "").trim();
  if (!text) {
    return { available: false, reason: "empty_document", message: "The resume contained no readable text." };
  }

  const system = buildResumeParsePrompt();
  // Keep the payload bounded so we never blow the model context on huge PDFs.
  const user = `Resume text:\n\n${text.slice(0, 12000)}`;

  const outcome = await callRecruitmentJson({ feature: "resume_parse", system, user, companyId });
  if (!outcome.ok) {
    if (outcome.reason === "no_ai_key") {
      return {
        available: false,
        reason: "no_ai_key",
        message: "AI is not configured. Add an OpenAI or Gemini API key in Settings → API Keys to parse resumes.",
      };
    }
    return { available: false, reason: outcome.reason, message: "Could not parse the resume. Please try again." };
  }

  return { available: true, data: normalizeParsedResume(outcome.data) };
}

function asStringArray(v: any): string[] | undefined {
  if (Array.isArray(v)) {
    const out = v.map((x) => (typeof x === "string" ? x.trim() : String(x ?? "").trim())).filter(Boolean);
    return out.length ? out : undefined;
  }
  if (typeof v === "string" && v.trim()) {
    const out = v.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    return out.length ? out : undefined;
  }
  return undefined;
}

function asString(v: any): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

// Coerce the loosely-typed model JSON into our ParsedResume shape, dropping
// anything empty so we never persist fabricated/blank values.
export function normalizeParsedResume(raw: Record<string, any>): ParsedResume {
  const out: ParsedResume = {};
  out.fullName = asString(raw.fullName);
  out.email = asString(raw.email);
  out.phone = asString(raw.phone);
  out.location = asString(raw.location);
  out.currentCompany = asString(raw.currentCompany);
  out.currentDesignation = asString(raw.currentDesignation);
  const yrs = raw.totalExperienceYears;
  if (yrs != null && !Number.isNaN(Number(yrs))) out.totalExperienceYears = Number(yrs);
  out.skills = asStringArray(raw.skills);
  out.education = asStringArray(raw.education);
  if (Array.isArray(raw.experience)) {
    const exp = raw.experience
      .map((e: any) => ({
        company: asString(e?.company),
        designation: asString(e?.designation),
        duration: asString(e?.duration),
      }))
      .filter((e: any) => e.company || e.designation || e.duration);
    if (exp.length) out.experience = exp;
  }
  out.certifications = asStringArray(raw.certifications);
  out.languages = asStringArray(raw.languages);
  out.projects = asStringArray(raw.projects);
  out.links = asStringArray(raw.links);
  out.noticePeriod = asString(raw.noticePeriod);
  out.currentSalary = asString(raw.currentSalary);
  out.expectedSalary = asString(raw.expectedSalary);
  out.preferredLocation = asString(raw.preferredLocation);
  out.summary = asString(raw.summary);
  // Drop undefined keys for a clean stored object.
  return JSON.parse(JSON.stringify(out));
}
