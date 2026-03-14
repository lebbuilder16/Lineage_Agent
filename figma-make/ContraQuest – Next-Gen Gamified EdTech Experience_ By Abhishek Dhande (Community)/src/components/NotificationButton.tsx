import { motion } from 'motion/react';
import { BellRing } from 'lucide-react';

export function NotificationButton() {
  return (
    <div className="absolute top-14 right-4 z-10">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-md"
      >
        <BellRing className="w-5 h-5 text-[#091A7A]" />
      </motion.button>
    </div>
  );
}