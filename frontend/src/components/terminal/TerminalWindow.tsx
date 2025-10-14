import { ReactNode } from 'react';

interface TerminalWindowProps {
  children: ReactNode;
  title?: string;
  className?: string;
}

export const TerminalWindow = ({ children, title, className = '' }: TerminalWindowProps) => {
  return (
    <div className={`terminal-window ${className}`}>
      {title && (
        <div className="bg-cream-300 border-b-2 border-cream-400 -mx-3 -mt-3 mb-3 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
            <span className="text-copper-500">▸</span>
            {title}
          </div>
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-sm border border-cream-400 bg-terminal-red"></div>
            <div className="w-3 h-3 rounded-sm border border-cream-400 bg-terminal-amber"></div>
            <div className="w-3 h-3 rounded-sm border border-cream-400 bg-terminal-green"></div>
          </div>
        </div>
      )}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};
