import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'outline-dark';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  href,
  onClick,
  className = '',
  disabled = false,
}: ButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'bg-copper-500 hover:bg-copper-600 text-white shadow-md hover:shadow-lg font-semibold',
    secondary: 'bg-cream-300 hover:bg-cream-400 text-text-primary border-2 border-cream-400 shadow-sm hover:shadow-md font-semibold',
    outline: 'border-2 border-cream-200 text-cream-200 hover:bg-cream-200 hover:text-copper-500 hover:border-cream-200 font-semibold',
    'outline-dark': 'border-2 border-copper-500 text-copper-500 hover:bg-copper-500 hover:text-cream-200 hover:border-copper-500 font-semibold',
  };

  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  const MotionButton = motion.button;
  const MotionLink = motion.a;

  if (href) {
    // Check if it's an external link
    const isExternal = href.startsWith('http') || href.startsWith('//');

    if (isExternal) {
      return (
        <MotionLink
          href={href}
          className={classes}
          whileHover={{ scale: disabled ? 1 : 1.02 }}
          whileTap={{ scale: disabled ? 1 : 0.98 }}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </MotionLink>
      );
    }

    // For internal links, use Next.js Link
    return (
      <Link href={href} passHref legacyBehavior>
        <MotionLink
          className={classes}
          whileHover={{ scale: disabled ? 1 : 1.02 }}
          whileTap={{ scale: disabled ? 1 : 0.98 }}
        >
          {children}
        </MotionLink>
      </Link>
    );
  }

  return (
    <MotionButton
      onClick={onClick}
      className={classes}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
    >
      {children}
    </MotionButton>
  );
}
