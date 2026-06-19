import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import type { Company } from "@shared/schema";

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSuperAdmin: boolean;
  selectedCompany: string;
  setSelectedCompany: (value: string) => void;
  companies: Company[];
  bulkFileInputRef: RefObject<HTMLInputElement>;
  bulkUploading: boolean;
  bulkResult: { created: number; skipped: number; errors: string[] } | null;
  onDownloadTemplate: () => void;
  onUpload: (file: File) => void;
}

export function BulkUploadDialog({
  open,
  onOpenChange,
  isSuperAdmin,
  selectedCompany,
  setSelectedCompany,
  companies,
  bulkFileInputRef,
  bulkUploading,
  bulkResult,
  onDownloadTemplate,
  onUpload,
}: BulkUploadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Bulk Salary Structure Upload
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file to create salary structures for multiple employees at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isSuperAdmin && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Company</label>
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>{company.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCompany === "__all__" && (
                <p className="text-xs text-amber-600">Please select a company to continue.</p>
              )}
            </div>
          )}
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-3">
              Upload an Excel file (.xlsx) with salary structure data
            </p>
            <input
              ref={bulkFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = "";
              }}
            />
            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={onDownloadTemplate}
              >
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
              <Button
                size="sm"
                onClick={() => bulkFileInputRef.current?.click()}
                disabled={bulkUploading || (isSuperAdmin && selectedCompany === "__all__")}
              >
                {bulkUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Select File
                  </>
                )}
              </Button>
            </div>
          </div>

          {bulkResult && (
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{bulkResult.created}</p>
                  <p className="text-xs text-green-600 dark:text-green-500">Created</p>
                </div>
                <div className="flex-1 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{(bulkResult as any).updated ?? 0}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-500">Updated</p>
                </div>
                <div className="flex-1 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{bulkResult.skipped}</p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-500">Skipped</p>
                </div>
              </div>
              {bulkResult.errors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">Issues Found:</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {bulkResult.errors.map((err, i) => (
                      <p key={i} className="text-xs text-red-700 dark:text-red-400">{err}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
