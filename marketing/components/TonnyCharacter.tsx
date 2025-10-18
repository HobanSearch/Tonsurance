import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface TonnyCharacterProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  animate?: boolean;
  className?: string;
  showImage?: boolean; // Toggle between emoji and image
}

const sizeMap = {
  sm: { container: 'w-12 h-12', text: 'text-2xl', image: 48 },
  md: { container: 'w-16 h-16', text: 'text-4xl', image: 64 },
  lg: { container: 'w-24 h-24', text: 'text-6xl', image: 96 },
  xl: { container: 'w-32 h-32', text: 'text-8xl', image: 128 },
  '2xl': { container: 'w-48 h-48', text: 'text-9xl', image: 192 },
};

export function TonnyCharacter({
  size = 'md',
  animate = true,
  className = '',
  showImage = true,
}: TonnyCharacterProps) {
  const { container, text, image: imageSize } = sizeMap[size];

  const animationProps = animate
    ? {
        whileHover: {
          scale: 1.1,
          rotate: [0, -5, 5, -5, 0],
          transition: { duration: 0.5 }
        },
        animate: {
          y: [0, -10, 0],
        },
        transition: {
          y: {
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }
        }
      }
    : {};

  // Check if Tonny image exists, otherwise fallback to emoji
  const [imageError, setImageError] = React.useState(false);
  const useTonnyImage = showImage && !imageError;

  return (
    <motion.div
      className={`inline-flex items-center justify-center ${className}`}
      {...animationProps}
    >
      {useTonnyImage ? (
        <div className={`relative ${container}`}>
          <Image
            src="/TonnyEnvelope.png"
            alt="Tonny, the Tonsurance bot"
            width={imageSize}
            height={imageSize}
            className="object-contain rounded-full"
            onError={() => setImageError(true)}
            priority
          />
        </div>
      ) : (
        <span className={text}>🤖</span>
      )}
    </motion.div>
  );
}

// Smaller inline variant for text
export function TonnyIcon({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-block ${className}`}>
      <TonnyCharacter size="sm" animate={false} showImage={false} />
    </span>
  );
}
