import { motion } from 'motion/react';

export function ScienceIcon3D() {
  return (
    <div className="relative w-10 h-10 flex items-center justify-center">
      {/* Flask base */}
      <motion.div
        className="relative"
        initial={{ rotateX: 0, rotateY: 0 }}
        animate={{ 
          rotateX: [0, 3, 0],
          rotateY: [0, -2, 0]
        }}
        transition={{ 
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Flask neck */}
        <div className="absolute top-0 left-1/2 w-1.5 h-3 bg-gradient-to-b from-gray-300 to-gray-400 transform -translate-x-0.5 rounded-t-sm" />
        
        {/* Flask body */}
        <div className="w-8 h-9 bg-gradient-to-br from-gray-200 to-gray-300 rounded-b-full shadow-lg relative overflow-hidden">
          {/* Liquid */}
          <motion.div
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-purple-600 via-blue-500 to-cyan-400 rounded-b-full"
            animate={{ 
              height: ['60%', '70%', '60%']
            }}
            transition={{ 
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          
          {/* Liquid surface highlight */}
          <motion.div
            className="absolute left-1 right-1 bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full h-0.5"
            animate={{ 
              top: ['40%', '30%', '40%']
            }}
            transition={{ 
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          
          {/* Flask highlight */}
          <div className="absolute top-1 left-1 w-2 h-3 bg-gradient-to-br from-white/50 to-transparent rounded-full" />
        </div>
        
        {/* Cork/stopper */}
        <div className="absolute -top-0.5 left-1/2 w-2 h-1 bg-gradient-to-b from-amber-600 to-amber-800 transform -translate-x-0.5 rounded-t-sm" />
      </motion.div>
      
      {/* Floating bubbles */}
      <motion.div
        className="absolute top-2 right-1 w-1 h-1 bg-cyan-300 rounded-full opacity-70"
        animate={{ 
          y: [0, -8, 0],
          scale: [0.5, 1, 0.3],
          opacity: [0.7, 0.3, 0]
        }}
        transition={{ 
          duration: 2.5,
          repeat: Infinity,
          delay: 0.5
        }}
      />
      
      <motion.div
        className="absolute top-3 right-2 w-0.5 h-0.5 bg-blue-300 rounded-full opacity-60"
        animate={{ 
          y: [0, -6, 0],
          scale: [0.3, 0.8, 0.2],
          opacity: [0.6, 0.2, 0]
        }}
        transition={{ 
          duration: 2,
          repeat: Infinity,
          delay: 1
        }}
      />
      
      <motion.div
        className="absolute top-1 left-1 w-0.5 h-0.5 bg-purple-300 rounded-full opacity-50"
        animate={{ 
          y: [0, -10, 0],
          x: [0, 2, 0],
          scale: [0.4, 1.2, 0.1],
          opacity: [0.5, 0.1, 0]
        }}
        transition={{ 
          duration: 3,
          repeat: Infinity,
          delay: 1.5
        }}
      />
      
      {/* Steam/vapor */}
      <motion.div
        className="absolute -top-1 left-1/2 transform -translate-x-0.5"
        animate={{ 
          scale: [0.5, 1, 0.5],
          opacity: [0.3, 0.6, 0.1],
          y: [0, -3, 0]
        }}
        transition={{ 
          duration: 2,
          repeat: Infinity
        }}
      >
        <div className="w-2 h-1 bg-gradient-to-t from-white/40 to-transparent rounded-full blur-sm" />
      </motion.div>
    </div>
  );
}