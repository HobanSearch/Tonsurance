import type { InputHTMLAttributes } from 'react';

interface CommandPromptProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  prompt?: string;
}

export const CommandPrompt = ({ prompt = '$', className = '', ...props }: CommandPromptProps) => {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-cream-300/50 border border-cream-400 rounded">
      <span className="command-prompt">{prompt}</span>
      <input
        type="text"
        className={`flex-1 bg-transparent border-none outline-none font-mono text-sm text-text-primary ${className}`}
        {...props}
      />
    </div>
  );
};
