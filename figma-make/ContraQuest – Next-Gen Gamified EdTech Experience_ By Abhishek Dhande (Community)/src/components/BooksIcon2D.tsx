import { motion } from 'motion/react';

export function BooksIcon2D() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 }}
      className="w-20 h-20 flex items-center justify-center"
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Back book */}
        <rect
          x="8"
          y="16"
          width="16"
          height="20"
          rx="2"
          fill="#4F46E5"
          stroke="#3730A3"
          strokeWidth="1"
        />
        
        {/* Middle book */}
        <rect
          x="12"
          y="12"
          width="16"
          height="20"
          rx="2"
          fill="#10B981"
          stroke="#059669"
          strokeWidth="1"
        />
        
        {/* Front book */}
        <rect
          x="16"
          y="8"
          width="16"
          height="20"
          rx="2"
          fill="#091A7A"
          stroke="#1E3A8A"
          strokeWidth="1"
        />
        
        {/* Book spine lines */}
        <line x1="9" y1="16" x2="9" y2="36" stroke="#3730A3" strokeWidth="0.5" />
        <line x1="13" y1="12" x2="13" y2="32" stroke="#059669" strokeWidth="0.5" />
        <line x1="17" y1="8" x2="17" y2="28" stroke="#1E3A8A" strokeWidth="0.5" />
        
        {/* Pen */}
        <motion.g
          initial={{ rotate: -20 }}
          animate={{ rotate: -15 }}
          transition={{ delay: 0.2, type: "spring" }}
          style={{ transformOrigin: "36px 20px" }}
        >
          {/* Pen body */}
          <rect
            x="32"
            y="18"
            width="12"
            height="3"
            rx="1.5"
            fill="#F59E0B"
            stroke="#D97706"
            strokeWidth="0.5"
          />
          
          {/* Pen tip */}
          <polygon
            points="44,18.5 44,21.5 47,20"
            fill="#374151"
            stroke="#111827"
            strokeWidth="0.5"
          />
          
          {/* Pen clip */}
          <rect
            x="34"
            y="16"
            width="1"
            height="4"
            rx="0.5"
            fill="#9CA3AF"
          />
        </motion.g>
        
        {/* Small sparkle effects */}
        <motion.circle
          cx="38"
          cy="14"
          r="1"
          fill="#ADC8FF"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ delay: 0.5, duration: 2, repeat: Infinity }}
        />
        <motion.circle
          cx="28"
          cy="6"
          r="0.5"
          fill="#ADC8FF"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ delay: 1, duration: 2, repeat: Infinity }}
        />
      </svg>
    </motion.div>
  );
}