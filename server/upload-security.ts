import path from "path";
import type { Request } from "express";

// Extensions that must NEVER be accepted regardless of the per-upload allow-list.
// Covers executables, scripts, and other commonly-abused file types.
const DANGEROUS_EXTENSIONS = new Set<string>([
  ".exe", ".com", ".msi", ".bat", ".cmd", ".sh", ".bash", ".zsh", ".ps1",
  ".vbs", ".vbe", ".js", ".jse", ".mjs", ".cjs", ".jar", ".scr", ".cpl",
  ".pif", ".reg", ".dll", ".so", ".dylib", ".bin", ".run", ".app",
  ".php", ".phtml", ".asp", ".aspx", ".jsp", ".py", ".rb", ".pl",
  ".html", ".htm", ".svg", ".hta", ".wsf", ".wsh", ".ws",
]);

// Curated allow-lists per upload purpose.
export const DOCUMENT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];
export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
// Spreadsheet + delimited/text data used by bulk imports and biometric ATTLOG/USERINFO files.
export const DATA_EXTENSIONS = [".xlsx", ".xls", ".csv", ".txt", ".dat", ".tsv"];
export const APK_EXTENSIONS = [".apk"];

export type MulterFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => void;

/**
 * Build a Multer fileFilter that rejects dangerous executable/script files and
 * only accepts files whose extension is in the provided allow-list (case-insensitive).
 */
function rejection(message: string): Error {
  const err = new Error(message);
  (err as Error & { status?: number }).status = 400;
  return err;
}

export function makeFileFilter(allowedExtensions: string[]): MulterFileFilter {
  const allowed = new Set(allowedExtensions.map((e) => e.toLowerCase()));
  return (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!ext || DANGEROUS_EXTENSIONS.has(ext)) {
      return cb(rejection(`File type "${ext || "unknown"}" is not allowed.`), false);
    }
    if (!allowed.has(ext)) {
      return cb(
        rejection(`File type "${ext}" is not allowed. Allowed types: ${[...allowed].join(", ")}.`),
        false,
      );
    }
    cb(null, true);
  };
}
