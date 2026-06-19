import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText } from "lucide-react";

interface ExportButtonsProps {
  onExcel?: () => void;
  onPDF?: () => void;
  excelLabel?: string;
  pdfLabel?: string;
  disabled?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost";
  testIdPrefix?: string;
  className?: string;
}

export function ExportButtons({
  onExcel,
  onPDF,
  excelLabel = "Excel",
  pdfLabel = "PDF",
  disabled,
  size = "sm",
  variant = "outline",
  testIdPrefix = "export",
  className,
}: ExportButtonsProps) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      {onExcel && (
        <Button type="button" size={size} variant={variant} onClick={onExcel} disabled={disabled} data-testid={`button-${testIdPrefix}-excel`}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          {excelLabel}
        </Button>
      )}
      {onPDF && (
        <Button type="button" size={size} variant={variant} onClick={onPDF} disabled={disabled} data-testid={`button-${testIdPrefix}-pdf`}>
          <FileText className="h-4 w-4 mr-2" />
          {pdfLabel}
        </Button>
      )}
    </div>
  );
}
