import { motion } from 'motion/react';

export function OpenBookIcon() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 }}
      className="w-20 h-20 flex items-center justify-center"
    >
      <svg
        width="80"
        height="80"
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Book binding (center) */}
        <rect
          x="38"
          y="20"
          width="4"
          height="40"
          rx="2"
          fill="#374151"
          stroke="#1F2937"
          strokeWidth="1"
        />
        
        {/* Left page */}
        <path
          d="M10 25 C10 23, 12 20, 15 20 L38 20 L38 60 L15 60 C12 60, 10 57, 10 55 L10 25 Z"
          fill="#F9FAFB"
          stroke="#E5E7EB"
          strokeWidth="1.5"
        />
        
        {/* Right page */}
        <path
          d="M70 25 C70 23, 68 20, 65 20 L42 20 L42 60 L65 60 C68 60, 70 57, 70 55 L70 25 Z"
          fill="#F9FAFB"
          stroke="#E5E7EB"
          strokeWidth="1.5"
        />
        
        {/* Text lines on left page */}
        <line x1="15" y1="28" x2="33" y2="28" stroke="#D1D5DB" strokeWidth="1" />
        <line x1="15" y1="32" x2="30" y2="32" stroke="#D1D5DB" strokeWidth="1" />
        <line x1="15" y1="36" x2="32" y2="36" stroke="#D1D5DB" strokeWidth="1" />
        <line x1="15" y1="40" x2="28" y2="40" stroke="#D1D5DB" strokeWidth="1" />
        
        {/* Text lines on right page */}
        <line x1="47" y1="28" x2="65" y2="28" stroke="#D1D5DB" strokeWidth="1" />
        <line x1="47" y1="32" x2="62" y2="32" stroke="#D1D5DB" strokeWidth="1" />
        <line x1="47" y1="36" x2="64" y2="36" stroke="#D1D5DB" strokeWidth="1" />
        <line x1="47" y1="40" x2="60" y2="40" stroke="#D1D5DB" strokeWidth="1" />
        
        {/* Pen */}
        <motion.g
          initial={{ rotate: -20, x: 5, y: 5 }}
          animate={{ rotate: -15, x: 0, y: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
          style={{ transformOrigin: "60px 35px" }}
        >
          {/* Pen body */}
          <rect
            x="52"
            y="32"
            width="20"
            height="4"
            rx="2"
            fill="#091A7A"
            stroke="#1E3A8A"
            strokeWidth="1"
          />
          
          {/* Pen tip */}
          <polygon
            points="72,33 72,37 77,35"
            fill="#374151"
            stroke="#111827"
            strokeWidth="1"
          />
          
          {/* Pen clip */}
          <rect
            x="55"
            y="29"
            width="2"
            height="6"
            rx="1"
            fill="#ADC8FF"
          />
          
          {/* Pen cap detail */}
          <circle
            cx="54"
            cy="34"
            r="1.5"
            fill="#ADC8FF"
            stroke="#091A7A"
            strokeWidth="0.5"
          />
        </motion.g>
        
        {/* Book shadow/depth */}
        <path
          d="M10 25 L10 55 C10 57, 12 60, 15 60 L38 60 L40 62 L42 60 L65 60 C68 60, 70 57, 70 55 L70 25"
          fill="none"
          stroke="#D1D5DB"
          strokeWidth="1"
          opacity="0.5"
        />
        
        {/* Small sparkle effects */}
        <motion.circle
          cx="25"
          cy="22"
          r="1.5"
          fill="#ADC8FF"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ delay: 0.5, duration: 2, repeat: Infinity }}
        />
        <motion.circle
          cx="55"
          cy="25"
          r="1"
          fill="#ADC8FF"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ delay: 1, duration: 2, repeat: Infinity }}
        />
        <motion.circle
          cx="35"
          cy="50"
          r="0.5"
          fill="#ADC8FF"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ delay: 1.5, duration: 2, repeat: Infinity }}
        />
      </svg>
    </motion.div>
  );
}