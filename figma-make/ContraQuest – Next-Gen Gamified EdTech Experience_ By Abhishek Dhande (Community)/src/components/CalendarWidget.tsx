import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function CalendarWidget() {
  const today = 3;
  const daysInWeek = [
    { id: 'mon', label: 'M' },
    { id: 'tue', label: 'T' },
    { id: 'wed', label: 'W' },
    { id: 'thu', label: 'T' },
    { id: 'fri', label: 'F' },
    { id: 'sat', label: 'S' },
    { id: 'sun', label: 'S' }
  ];
  const weekDates = [
    { id: 'date-1', date: 1 },
    { id: 'date-2', date: 2 },
    { id: 'date-3', date: 3 },
    { id: 'date-4', date: 4 },
    { id: 'date-5', date: 5 },
    { id: 'date-6', date: 6 },
    { id: 'date-7', date: 7 }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.5 }}
      className="p-6 bg-card-glass backdrop-blur-lg rounded-[20px] shadow-card border border-white/20"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-section-header text-[#091A7A]">September 2025</h3>
        <div className="flex items-center gap-1">
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="w-8 h-8 flex items-center justify-center rounded-[12px] transition-all duration-200"
          >
            <ChevronLeft className="w-4 h-4 text-[#091A7A] stroke-[1.5]" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="w-8 h-8 flex items-center justify-center rounded-[12px] transition-all duration-200"
          >
            <ChevronRight className="w-4 h-4 text-[#091A7A] stroke-[1.5]" />
          </motion.button>
        </div>
      </div>
      
      <div className="grid grid-cols-7 gap-2">
        {daysInWeek.map((day) => (
          <div key={day.id} className="text-center text-tiny text-[#6B7280] font-medium py-2">
            {day.label}
          </div>
        ))}
        
        {weekDates.map((dateObj, index) => (
          <motion.button
            key={dateObj.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.6 + index * 0.04, type: "spring", stiffness: 300 }}
            whileTap={{ scale: 0.95 }}
            className={`w-9 h-9 flex items-center justify-center rounded-[18px] text-small font-medium transition-all duration-200 ${
              dateObj.date === today
                ? 'bg-[#ADC8FF] text-[#091A7A] shadow-interactive border border-white/20'
                : 'text-[#6B7280]'
            }`}
          >
            {dateObj.date}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}