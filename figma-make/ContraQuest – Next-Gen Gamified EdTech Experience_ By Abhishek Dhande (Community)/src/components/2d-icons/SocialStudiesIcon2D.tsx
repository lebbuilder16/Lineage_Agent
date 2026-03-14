import { motion } from 'motion/react';
import SocialStudiesIcon from '../../imports/Icons-13-1147';

export function SocialStudiesIcon2D() {
  return (
    <motion.div
      className="w-12 h-12 flex items-center justify-center"
      whileHover={{ scale: 1.1, rotate: -3 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <SocialStudiesIcon />
    </motion.div>
  );
}