'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TonnyCharacter } from './TonnyCharacter';

export function FloatingTonnyChat() {
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);

  // Hide tooltip after 10 seconds
  React.useEffect(() => {
    const timer = setTimeout(() => setShowTooltip(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  const handleClick = () => {
    window.open('https://t.me/TonsuranceBot', '_blank');
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {(isHovered || showTooltip) && (
          <motion.div
            initial={{ opacity: 0, x: 20, y: 10 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute bottom-full right-0 mb-4 mr-2"
          >
            <div className="bg-white rounded-2xl shadow-2xl p-4 max-w-xs border-2 border-copper-500">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  <TonnyCharacter size="sm" animate={false} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary mb-1">
                    Hey! Need help with coverage? 💎
                  </p>
                  <p className="text-xs text-text-secondary">
                    Chat with me to get a personalized quote in seconds!
                  </p>
                </div>
              </div>
              {/* Speech bubble arrow */}
              <div className="absolute bottom-0 right-8 transform translate-y-full">
                <div className="w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-copper-500"></div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative bg-copper-500 hover:bg-copper-600 text-white rounded-full w-20 h-20 shadow-2xl transition-colors duration-200 cursor-pointer border-4 border-white overflow-hidden flex items-center justify-center"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        animate={{
          y: [0, -8, 0],
        }}
        transition={{
          y: {
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          },
        }}
        aria-label="Chat with Tonny"
      >
        {/* Pulse effect */}
        <span className="absolute inset-0 rounded-full bg-copper-500 animate-ping opacity-25"></span>

        <div className="relative w-full h-full flex items-center justify-center scale-110">
          <TonnyCharacter size="md" animate={false} showImage={true} />
        </div>
      </motion.button>
    </div>
  );
}
