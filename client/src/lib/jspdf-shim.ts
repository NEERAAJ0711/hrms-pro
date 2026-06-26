import { jsPDF } from "jspdf";
import autoTablePlugin, { applyPlugin } from "jspdf-autotable";

// Register the autotable plugin on the jsPDF prototype so that both
// `doc.autoTable(...)` and `doc.lastAutoTable.finalY` work natively.
applyPlugin(jsPDF as any);

export { jsPDF };

export function autoTable(doc: any, opts: any): void {
  autoTablePlugin(doc, opts);
}

export async function initJsPDF(opts?: any): Promise<any> {
  return new jsPDF(opts);
}

export default jsPDF;
