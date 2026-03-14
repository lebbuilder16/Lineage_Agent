import { motion } from 'motion/react';

export function SocialStudiesIcon3D() {
  return (
    <div className="relative w-10 h-10 flex items-center justify-center">
      {/* Globe base */}
      <motion.div
        className="relative w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 via-green-500 to-blue-600 shadow-lg"
        initial={{ rotateY: 0 }}
        animate={{ rotateY: 360 }}
        transition={{ 
          duration: 20,
          repeat: Infinity,
          ease: "linear"
        }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Continents/land masses */}
        <div className="absolute top-2 left-2 w-3 h-2 bg-green-600 rounded-sm opacity-80" />
        <div className="absolute top-4 right-1 w-2 h-2 bg-green-700 rounded-full opacity-70" />
        <div className="absolute bottom-2 left-1 w-2.5 h-1.5 bg-green-600 rounded-sm opacity-75" />
        <div className="absolute top-1 right-2 w-1.5 h-1 bg-green-700 rounded-sm opacity-60" />
        
        {/* Globe highlight */}
        <div className="absolute top-1 left-1 w-3 h-3 bg-gradient-to-br from-white/40 to-transparent rounded-full" />
        
        {/* Globe grid lines */}
        <div className="absolute inset-0 rounded-full border border-white/20" />
        <div className="absolute top-0 left-1/2 w-0.5 h-full bg-white/15 transform -translate-x-0.5" />
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white/15 transform -translate-y-0.5" />
      </motion.div>
      
      {/* Location pins */}
      <motion.div
        className="absolute top-1 left-2"
        animate={{ 
          scale: [1, 1.2, 1],
          y: [0, -1, 0]
        }}
        transition={{ 
          duration: 2,
          repeat: Infinity,
          delay: 0.5
        }}
      >
        <div className="w-1.5 h-2 bg-red-500 rounded-t-full relative shadow-sm">
          <div className="absolute top-0.5 left-1/2 w-0.5 h-0.5 bg-white rounded-full transform -translate-x-0.5" />
          <div className="absolute bottom-0 left-1/2 w-0 h-0 border-l-[3px] border-r-[3px] border-t-[2px] border-l-transparent border-r-transparent border-t-red-500 transform -translate-x-0.5" />
        </div>
      </motion.div>
      
      <motion.div
        className="absolute top-3 right-1"
        animate={{ 
          scale: [1, 1.3, 1],
          y: [0, -2, 0]
        }}
        transition={{ 
          duration: 2.5,
          repeat: Infinity,
          delay: 1
        }}
      >
        <div className="w-1 h-1.5 bg-orange-500 rounded-t-full relative shadow-sm">
          <div className="absolute top-0.5 left-1/2 w-0.5 h-0.5 bg-white rounded-full transform -translate-x-0.5 scale-75" />
          <div className="absolute bottom-0 left-1/2 w-0 h-0 border-l-[2px] border-r-[2px] border-t-[1.5px] border-l-transparent border-r-transparent border-t-orange-500 transform -translate-x-0.5" />
        </div>
      </motion.div>
      
      <motion.div
        className="absolute bottom-2 left-3"
        animate={{ 
          scale: [1, 1.1, 1],
          y: [0, -1.5, 0]
        }}
        transition={{ 
          duration: 3,
          repeat: Infinity,
          delay: 1.5
        }}
      >
        <div className="w-1 h-1.5 bg-blue-500 rounded-t-full relative shadow-sm">
          <div className="absolute top-0.5 left-1/2 w-0.5 h-0.5 bg-white rounded-full transform -translate-x-0.5 scale-75" />
          <div className="absolute bottom-0 left-1/2 w-0 h-0 border-l-[2px] border-r-[2px] border-t-[1.5px] border-l-transparent border-r-transparent border-t-blue-500 transform -translate-x-0.5" />
        </div>
      </motion.div>
      
      {/* Orbital ring */}
      <motion.div
        className="absolute inset-0 rounded-full border border-gray-300/30"
        animate={{ rotateZ: 360 }}
        transition={{ 
          duration: 15,
          repeat: Infinity,
          ease: "linear"
        }}
        style={{ transform: 'rotateX(70deg)' }}
      />
      
      {/* Floating sparkle */}
      <motion.div
        className="absolute -top-1 right-0 text-yellow-400 text-xs"
        animate={{ 
          scale: [0.5, 1, 0.5],
          opacity: [0.4, 0.8, 0.4],
          rotate: [0, 180, 360]
        }}
        transition={{ 
          duration: 3,
          repeat: Infinity,
          delay: 2
        }}
      >
        ✨
      </motion.div>
    </div>
  );
}