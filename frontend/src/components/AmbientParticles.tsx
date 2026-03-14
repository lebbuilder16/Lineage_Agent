import { motion } from 'motion/react';

export function AmbientParticles() {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 2 + Math.random() * 4,
    duration: 8 + Math.random() * 6,
    delay: Math.random() * 4
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full"
          initial={{
            x: `${particle.x}%`,
            y: `${particle.y}%`,
            opacity: 0,
          }}
          animate={{
            x: `${particle.x + (Math.random() - 0.5) * 30}%`,
            y: `${particle.y + (Math.random() - 0.5) * 30}%`,
            opacity: [0, 0.6, 0],
          }}
          transition={{
            duration: particle.duration,
            repeat: Infinity,
            delay: particle.delay,
            ease: "easeInOut"
          }}
          style={{
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            background: 'radial-gradient(circle, rgba(173, 200, 255, 0.6) 0%, rgba(173, 200, 255, 0.2) 70%, transparent 100%)',
            filter: 'blur(0.5px)'
          }}
        />
      ))}
    </div>
  );
}