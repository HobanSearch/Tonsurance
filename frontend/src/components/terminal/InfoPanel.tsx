import type { ReactNode } from 'react';

interface InfoPanelProps {
  children: ReactNode;
  type?: 'default' | 'success' | 'warning' | 'error';
  title?: string;
  className?: string;
}

export const InfoPanel = ({
  children,
  type = 'default',
  title,
  className = '',
}: InfoPanelProps) => {
  return (
    <div className={`info-panel ${type} ${className}`}>
      {title && (
        <div className="bg-cream-400 -mx-4 -mt-4 mb-3 px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b-2 border-cream-400">
          {title}
        </div>
      )}
      {children}
    </div>
  );
};
