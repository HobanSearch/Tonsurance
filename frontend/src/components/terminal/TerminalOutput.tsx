import type { ReactNode } from 'react';

interface TerminalOutputProps {
  children: ReactNode;
  type?: 'normal' | 'success' | 'error' | 'info';
  className?: string;
}

export const TerminalOutput = ({ children, type = 'normal', className = '' }: TerminalOutputProps) => {
  const typeClass = {
    normal: '',
    success: 'output-success',
    error: 'output-error',
    info: 'output-info',
  }[type];

  return (
    <div className={`terminal-output ${typeClass} ${className}`}>
      {children}
    </div>
  );
};
