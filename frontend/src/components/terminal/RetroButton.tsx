import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface RetroButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'default' | 'primary';
}

export const RetroButton = ({
  children,
  variant = 'default',
  className = '',
  ...props
}: RetroButtonProps) => {
  const variantClass = variant === 'primary' ? 'retro-btn-primary' : '';

  return (
    <button
      className={`retro-btn ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
