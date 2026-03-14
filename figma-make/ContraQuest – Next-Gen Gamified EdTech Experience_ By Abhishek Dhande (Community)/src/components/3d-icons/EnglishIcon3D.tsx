import { motion } from 'motion/react';

export function EnglishIcon3D() {
  return (
    <div className="relative w-10 h-10 flex items-center justify-center">
      {/* Open book */}
      <motion.div
        className="relative"
        initial={{ rotateX: 0, rotateY: 0 }}
        animate={{ 
          rotateX: [0, -5, 0],
          rotateY: [0, 3, 0]
        }}
        transition={{ 
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Left page */}
        <motion.div
          className="absolute w-5 h-7 bg-gradient-to-br from-white to-gray-100 rounded-l-lg shadow-md border-r border-gray-200"
          animate={{ rotateY: [0, -10, 0] }}
          transition={{ 
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          style={{ transformOrigin: 'right center' }}
        >
          {/* Text lines */}
          <div className="p-1 space-y-0.5">
            <div className="w-3 h-0.5 bg-gray-400 rounded" />
            <div className="w-4 h-0.5 bg-gray-400 rounded" />
            <div className="w-3.5 h-0.5 bg-gray-400 rounded" />
          </div>
        </motion.div>
        
        {/* Right page */}
        <motion.div
          className="w-5 h-7 bg-gradient-to-bl from-white to-gray-100 rounded-r-lg shadow-md border-l border-gray-200"
          animate={{ rotateY: [0, 10, 0] }}
          transition={{ 
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.5
          }}
          style={{ transformOrigin: 'left center' }}
        >
          {/* Text lines */}
          <div className="p-1 space-y-0.5">
            <div className="w-3 h-0.5 bg-gray-400 rounded" />
            <div className="w-4 h-0.5 bg-gray-400 rounded" />
            <div className="w-2.5 h-0.5 bg-gray-400 rounded" />
          </div>
        </motion.div>
        
        {/* Book spine */}
        <div className="absolute left-1/2 top-0 w-0.5 h-7 bg-gradient-to-b from-amber-600 to-amber-800 transform -translate-x-0.5 rounded-sm" />
      </motion.div>
      
      {/* Quill pen */}
      <motion.div
        className="absolute -top-1 right-0"
        animate={{ 
          rotate: [45, 50, 45],
          x: [0, 1, 0],
          y: [0, -1, 0]
        }}
        transition={{ 
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1
        }}
      >
        {/* Feather */}
        <div className="w-1 h-6 bg-gradient-to-t from-amber-700 via-amber-500 to-amber-300 rounded-full relative">
          {/* Feather details */}
          <div className="absolute left-0 top-1 w-1.5 h-0.5 bg-amber-600 rounded-full transform -rotate-12 origin-left" />
          <div className="absolute left-0 top-2 w-1.5 h-0.5 bg-amber-600 rounded-full transform -rotate-12 origin-left" />
          <div className="absolute left-0 top-3 w-1 h-0.5 bg-amber-600 rounded-full transform -rotate-12 origin-left" />
        </div>
        
        {/* Pen tip */}
        <div className="absolute bottom-0 left-1/2 w-0.5 h-1 bg-gray-700 transform -translate-x-0.5 rounded-b-full" />
      </motion.div>
      
      {/* Floating sparkles */}
      <motion.div
        className="absolute -top-2 left-1 text-yellow-400 text-xs"
        animate={{ 
          scale: [0.5, 1, 0.5],
          opacity: [0.3, 0.8, 0.3]
        }}
        transition={{ 
          duration: 2,
          repeat: Infinity,
          delay: 0.5
        }}
      >
        ✨
      </motion.div>
    </div>
  );
}