import type { ReactNode } from 'react';

interface InfoPanelProps {
  children: ReactNode;
  type?: 'default' | 'success' | 'warning' | 'error' | 'secondary' | 'info';
  variant?: 'default' | 'success' | 'warning' | 'error' | 'secondary' | 'info';
  title?: string;
  className?: string;
}

export const InfoPanel = ({
  children,
  type,
  variant,
  title,
  className = '',
}: InfoPanelProps) => {
  // Support both 'type' and 'variant' props (variant takes precedence)
  const panelType = variant || type || 'default';

  return (
    <div className={`info-panel ${panelType} ${className}`}>
      {title && (
        <div className="bg-cream-400 -mx-4 -mt-4 mb-3 px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b-2 border-cream-400">
          {title}
        </div>
      )}
      {children}
    </div>
  );
};
