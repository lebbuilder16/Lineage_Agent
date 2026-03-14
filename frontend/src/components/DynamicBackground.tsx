import { motion } from 'motion/react';

export function DynamicBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Base gradient */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #ADC8FF 0%, #E8F2FF 20%, #F8FAFC 40%, #FFFFFF 60%, #F8FAFC 80%, #E8F2FF 100%)'
        }}
      />
      
      {/* Animated gradient overlay 1 */}
      <motion.div
        animate={{
          opacity: [0.3, 0.6, 0.3],
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 20% 30%, rgba(173, 200, 255, 0.15) 0%, transparent 50%)',
        }}
      />
      
      {/* Animated gradient overlay 2 */}
      <motion.div
        animate={{
          opacity: [0.2, 0.5, 0.2],
          scale: [1.1, 1, 1.1],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2
        }}
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 80% 70%, rgba(173, 200, 255, 0.1) 0%, transparent 40%)',
        }}
      />
      
      {/* Subtle moving gradient */}
      <motion.div
        animate={{
          x: ['-10%', '10%', '-10%'],
          y: ['-5%', '5%', '-5%'],
          opacity: [0.1, 0.3, 0.1],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(173, 200, 255, 0.08) 0%, transparent 60%)',
        }}
      />
    </div>
  );
}