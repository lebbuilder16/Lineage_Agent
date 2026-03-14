import { motion } from 'motion/react';

export function MathIcon3D() {
  return (
    <div className="relative w-8 h-8 flex items-center justify-center">
      {/* Calculator base */}
      <motion.div
        className="relative w-7 h-8 bg-gradient-to-br from-slate-700 to-slate-900 rounded-lg shadow-lg"
        initial={{ rotateX: 0, rotateY: 0 }}
        animate={{ 
          rotateX: [0, 5, 0],
          rotateY: [0, -3, 0]
        }}
        transition={{ 
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Screen */}
        <div className="absolute top-1 left-1 right-1 h-3 bg-gradient-to-b from-green-400 to-green-600 rounded-sm opacity-90" />
        
        {/* Buttons grid */}
        <div className="absolute bottom-1 left-1 right-1 grid grid-cols-3 gap-0.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="w-2 h-1.5 bg-gray-300 rounded-xs" />
          ))}
        </div>
      </motion.div>
      
      {/* Floating numbers */}
      <motion.div
        className="absolute -top-1 -right-1 text-blue-600 font-bold text-xs"
        animate={{ 
          y: [-2, -6, -2],
          rotate: [0, 10, 0],
          opacity: [0.7, 1, 0.7]
        }}
        transition={{ 
          duration: 3,
          repeat: Infinity,
          delay: 0.5
        }}
      >
        7
      </motion.div>
      
      <motion.div
        className="absolute -bottom-1 -left-1 text-purple-600 font-bold text-xs"
        animate={{ 
          y: [2, -2, 2],
          rotate: [0, -15, 0],
          opacity: [0.6, 1, 0.6]
        }}
        transition={{ 
          duration: 3.5,
          repeat: Infinity,
          delay: 1
        }}
      >
        +
      </motion.div>
      
      <motion.div
        className="absolute top-0 left-2 text-orange-500 font-bold text-xs"
        animate={{ 
          x: [-1, 1, -1],
          scale: [0.8, 1.1, 0.8],
          opacity: [0.5, 0.9, 0.5]
        }}
        transition={{ 
          duration: 2.5,
          repeat: Infinity,
          delay: 1.5
        }}
      >
        =
      </motion.div>
    </div>
  );
}