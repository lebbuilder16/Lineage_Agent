import { motion } from 'motion/react';
import EnglishIcon from '../../imports/Icons-13-1097';

export function EnglishIcon2D() {
  return (
    <motion.div
      className="w-12 h-12 flex items-center justify-center"
      whileHover={{ scale: 1.1, rotate: -5 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <EnglishIcon />
    </motion.div>
  );
}