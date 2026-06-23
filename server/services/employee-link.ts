// HRMS Pro — Cross-company employee association
//
// The same person (matched by PAN or Aadhaar) may be employed at two companies
// with different employment details, BUT they can be On-Roll (permanent) in only
// ONE company. In any other company they must be added as Contractual
// (employmentType = "contract") with a contractor tag (contractorMasterId).
// The second-company record is linked to the On-Roll ("master") record via
// masterEmployeeId so the two are associated as the same person.
import { db } from "../db";
import { employees } from "@shared/schema";
import { eq, and, or, inArray, sql } from "drizzle-orm";

export const ONROLL_TYPE = "permanent";

type LinkInput = {
  pan?: string | null;
  aadhaar?: string | null;
  employmentType?: string | null;
  contractorMasterId?: string | null;
};

export type CrossCompanyLinkResult = {
  error?: string;
  masterEmployeeId?: string | null;
  backfillIds?: string[];
};

// Find this person's records in OTHER companies (same PAN or Aadhaar).
export async function findPersonInOtherCompanies(
  data: LinkInput,
  companyId: string,
  excludeId?: string,
): Promise<any[]> {
  const idConds: any[] = [];
  if (data.pan) idConds.push(eq(employees.pan, String(data.pan)));
  if (data.aadhaar) idConds.push(eq(employees.aadhaar, String(data.aadhaar)));
  if (idConds.length === 0) return [];
  const rows = await db
    .select()
    .from(employees)
    .where(and(or(...idConds), sql`${employees.companyId} <> ${companyId}`));
  return excludeId ? rows.filter((r: any) => r.id !== excludeId) : rows;
}

// Validate + resolve the cross-company link for a create/update.
// Returns { error } to reject, or { masterEmployeeId, backfillIds } to apply.
export async function resolveCrossCompanyLink(
  data: LinkInput,
  companyId: string,
  excludeId?: string,
): Promise<CrossCompanyLinkResult> {
  const matches = await findPersonInOtherCompanies(data, companyId, excludeId);
  if (matches.length === 0) return {}; // brand-new person — nothing to link

  const incomingType = data.employmentType ?? ONROLL_TYPE;
  const existingOnRoll = matches.find((m) => (m.employmentType ?? ONROLL_TYPE) === ONROLL_TYPE);
  const ref = existingOnRoll || matches[0];
  const who = `${ref.firstName} ${ref.lastName} (${ref.employeeCode})`;

  // Cardinality: a person may be associated with at most TWO companies. `matches`
  // only contains records in OTHER companies (the current one is excluded), so if
  // the person already exists in 2+ other companies, adding them here is a 3rd.
  const otherCompanyIds = new Set(matches.map((m) => m.companyId));
  if (otherCompanyIds.size >= 2) {
    return {
      error:
        `${who} is already associated with two companies. ` +
        `A person can belong to at most two companies.`,
    };
  }

  if (incomingType === ONROLL_TYPE) {
    // Trying to put them On-Roll here.
    if (existingOnRoll) {
      return {
        error:
          `${who} is already On-Roll (permanent) in another company. ` +
          `A person can be On-Roll in only one company — for this company set ` +
          `Employment Type to "Contract" and tag a contractor.`,
      };
    }
    // No On-Roll record yet anywhere → this record becomes the master.
    // Re-parent ALL existing records (in the other company) to this new master so
    // the On-Roll record is always the master, even if they were created earlier
    // and pointed at each other.
    const backfillIds = matches.map((m) => m.id);
    return { masterEmployeeId: null, backfillIds };
  }

  // Contractual (or any non-permanent) record in a second company.
  if (incomingType !== "contract" || !data.contractorMasterId) {
    return {
      error:
        `${who} already exists in another company. In this company they must be ` +
        `added as Contractual — set Employment Type to "Contract" and tag a contractor.`,
    };
  }

  // Link to the group's master (the On-Roll record, else the group's existing
  // master, else the oldest matched record).
  const masterId = existingOnRoll ? existingOnRoll.id : ref.masterEmployeeId || ref.id;
  return { masterEmployeeId: masterId };
}

// Apply backfill links: point the given records' masterEmployeeId at newMasterId.
export async function backfillMasterLink(newMasterId: string, backfillIds?: string[]): Promise<void> {
  if (!backfillIds || backfillIds.length === 0) return;
  await db.update(employees)
    .set({ masterEmployeeId: newMasterId })
    .where(inArray(employees.id, backfillIds));
}
