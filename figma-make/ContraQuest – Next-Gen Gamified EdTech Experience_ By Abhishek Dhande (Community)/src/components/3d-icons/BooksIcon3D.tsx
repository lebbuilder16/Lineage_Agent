import { motion } from 'motion/react';

export function BooksIcon3D() {
  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      {/* Base book (largest, bottom) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-14 h-3 bg-gradient-to-r from-blue-600 to-blue-700 rounded-sm shadow-lg"
        style={{ transform: 'translateX(-50%) perspective(50px) rotateX(15deg)' }}
      >
        {/* Book spine highlight */}
        <div className="absolute left-0 top-0 w-1 h-full bg-blue-400 rounded-l-sm"></div>
      </motion.div>

      {/* Middle book */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-12 h-3 bg-gradient-to-r from-green-600 to-green-700 rounded-sm shadow-md"
        style={{ transform: 'translateX(-50%) perspective(50px) rotateX(15deg)' }}
      >
        {/* Book spine highlight */}
        <div className="absolute left-0 top-0 w-1 h-full bg-green-400 rounded-l-sm"></div>
      </motion.div>

      {/* Top book */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-10 h-3 bg-gradient-to-r from-red-600 to-red-700 rounded-sm shadow-sm"
        style={{ transform: 'translateX(-50%) perspective(50px) rotateX(15deg)' }}
      >
        {/* Book spine highlight */}
        <div className="absolute left-0 top-0 w-1 h-full bg-red-400 rounded-l-sm"></div>
      </motion.div>

      {/* Pen */}
      <motion.div
        initial={{ opacity: 0, rotate: -45, scale: 0.8 }}
        animate={{ opacity: 1, rotate: -30, scale: 1 }}
        transition={{ delay: 0.4, type: "spring", stiffness: 100 }}
        className="absolute top-1 right-2 w-8 h-1.5 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full shadow-md"
        style={{ transform: 'rotate(-30deg)' }}
      >
        {/* Pen tip */}
        <div className="absolute -left-1 top-1/2 transform -translate-y-1/2 w-2 h-1 bg-gray-800 rounded-r-full"></div>
        {/* Pen clip */}
        <div className="absolute right-1 -top-0.5 w-0.5 h-2 bg-silver rounded-full"></div>
      </motion.div>

      {/* Floating particles */}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ 
            opacity: [0, 1, 0], 
            scale: [0, 1, 0],
            y: [0, -10, -20]
          }}
          transition={{ 
            delay: 0.5 + i * 0.2, 
            duration: 2, 
            repeat: Infinity,
            repeatDelay: 1
          }}
          className={`absolute w-1 h-1 bg-yellow-400 rounded-full`}
          style={{
            left: `${50 + i * 10}%`,
            top: `${30 + i * 5}%`
          }}
        />
      ))}
    </div>
  );
}