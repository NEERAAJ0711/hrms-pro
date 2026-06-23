import { registerPrompt } from "./registry";

// Prompt specs + builders for document (KYC) and free-text (profile) extraction.

export interface KycDocSpec {
  label: string;
  fields: string[];
}

export const KYC_EXTRACTION_SPEC: Record<string, KycDocSpec> = {
  aadhaar: { label: "Aadhaar Card", fields: ["name", "dateOfBirth", "gender", "aadhaarNumber", "address"] },
  pan: { label: "PAN Card", fields: ["panNumber", "name", "fatherName", "dateOfBirth"] },
  bank_details: { label: "Bank Details", fields: ["accountHolderName", "accountNumber", "ifsc", "bankName", "branch"] },
  cancelled_cheque: { label: "Cancelled Cheque", fields: ["accountHolderName", "accountNumber", "ifsc", "bankName", "branch"] },
  address_proof: { label: "Address Proof", fields: ["name", "address"] },
};

export function buildKycSystemPrompt(spec: KycDocSpec): string {
  const fieldList = spec.fields.join(", ");
  return (
    `You are an OCR assistant for Indian KYC documents. Read the ${spec.label} in the image and extract the requested fields exactly as printed. ` +
    `Return ONLY a JSON object with these keys: ${fieldList}. ` +
    `Use an empty string for any field you cannot read clearly. Format dates as DD/MM/YYYY. Do not guess or invent values.`
  );
}

export function buildKycUserText(spec: KycDocSpec): string {
  return `Extract these fields from this ${spec.label}: ${spec.fields.join(", ")}`;
}

// Fields here map 1:1 to the whitelist in the apply-extraction endpoint (docType "profile").
export const PROFILE_EXTRACTION_FIELDS = [
  "gender",
  "dateOfBirth",
  "mobileNumber",
  "officialEmail",
  "fatherHusbandName",
  "uan",
  "esiNumber",
  "pan",
  "aadhaar",
  "bankAccount",
  "ifsc",
  "presentAddress",
  "permanentAddress",
  "maritalStatus",
  "motherName",
  "bloodGroup",
  "nomineeName",
  "nomineeRelation",
  "emergencyContactName",
  "emergencyContactNumber",
] as const;

export function buildProfileSystemPrompt(): string {
  const fieldList = PROFILE_EXTRACTION_FIELDS.join(", ");
  return (
    `You extract Indian HR/statutory profile details that an employee has explicitly stated in their message, for their ESIC, EPFO and HRMS records. ` +
    `Return ONLY a JSON object with these keys: ${fieldList}. ` +
    `Rules: include a value ONLY if the employee clearly stated it in this message; otherwise use an empty string. Never guess or infer. ` +
    `gender: "Male"/"Female"/"Other". dateOfBirth: format as DD/MM/YYYY. uan: 12 digits. aadhaar: 12 digits. pan: 10 chars uppercase. ` +
    `mobileNumber: 10 digits. ifsc: 11 chars uppercase. Strip spaces from numbers, UAN, Aadhaar, account number, IFSC and PAN. ` +
    `maritalStatus: "Married"/"Single"/"Widowed"/"Divorced". motherName: full name. bloodGroup: e.g. "O+","AB-". ` +
    `nomineeName: full name of the nominee. nomineeRelation: relationship to the employee (e.g. "Wife","Husband","Son","Mother"). ` +
    `emergencyContactName: full name. emergencyContactNumber: 10 digits.`
  );
}

registerPrompt("kyc.system", (spec: KycDocSpec) => buildKycSystemPrompt(spec));
registerPrompt("profile.system", () => buildProfileSystemPrompt());
