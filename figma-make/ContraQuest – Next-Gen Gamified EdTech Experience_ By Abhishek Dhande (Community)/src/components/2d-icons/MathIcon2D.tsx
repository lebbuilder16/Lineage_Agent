import { motion } from 'motion/react';
import MathIcon from '../../imports/Icons-13-1058';

export function MathIcon2D() {
  return (
    <motion.div
      className="w-12 h-12 flex items-center justify-center"
      whileHover={{ scale: 1.1, rotate: 5 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <MathIcon />
    </motion.div>
  );
}