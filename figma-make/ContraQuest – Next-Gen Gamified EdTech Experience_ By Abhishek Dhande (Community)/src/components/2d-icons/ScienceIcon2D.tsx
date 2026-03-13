import { motion } from 'motion/react';
import ScienceIcon from '../../imports/Icons-13-1134';

export function ScienceIcon2D() {
  return (
    <motion.div
      className="w-12 h-12 flex items-center justify-center"
      whileHover={{ scale: 1.1, rotate: 3 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <ScienceIcon />
    </motion.div>
  );
}