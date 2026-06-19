import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  testId?: string;
}

export function PageHeader({ title, description, icon, actions, className, testId }: PageHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className ?? ""}`} data-testid={testId}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
