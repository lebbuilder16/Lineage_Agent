import { motion, AnimatePresence } from 'motion/react';
import { Cloud, CloudOff, Check, Loader } from 'lucide-react';
import { useState, useEffect } from 'react';

interface ProgressSaveIndicatorProps {
  show: boolean;
  status: 'saving' | 'saved' | 'error';
  className?: string;
}

export function ProgressSaveIndicator({ show, status, className = '' }: ProgressSaveIndicatorProps) {
  const [displayStatus, setDisplayStatus] = useState<'saving' | 'saved' | 'error'>('saved');

  useEffect(() => {
    if (show) {
      setDisplayStatus(status);
    }
  }, [show, status]);

  const getIcon = () => {
    switch (displayStatus) {
      case 'saving':
        return <Loader className="w-3 h-3 animate-spin" />;
      case 'saved':
        return <Check className="w-3 h-3" />;
      case 'error':
        return <CloudOff className="w-3 h-3" />;
      default:
        return <Cloud className="w-3 h-3" />;
    }
  };

  const getColors = () => {
    switch (displayStatus) {
      case 'saving':
        return 'bg-blue-500/90 text-white';
      case 'saved':
        return 'bg-green-500/90 text-white';
      case 'error':
        return 'bg-red-500/90 text-white';
      default:
        return 'bg-gray-500/90 text-white';
    }
  };

  const getText = () => {
    switch (displayStatus) {
      case 'saving':
        return 'Saving...';
      case 'saved':
        return 'Saved';
      case 'error':
        return 'Error';
      default:
        return 'Saved';
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={`fixed top-20 right-4 z-50 ${className}`}
        >
          <div className={`
            flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium
            backdrop-blur-xl border border-white/20 shadow-lg
            ${getColors()}
          `}>
            {getIcon()}
            <span>{getText()}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Hook for managing save status
export function useSaveStatus() {
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saved');
  const [showIndicator, setShowIndicator] = useState(false);

  const triggerSave = () => {
    setSaveStatus('saving');
    setShowIndicator(true);

    // Simulate save process
    setTimeout(() => {
      setSaveStatus('saved');
      
      // Hide indicator after showing "saved" for a moment
      setTimeout(() => {
        setShowIndicator(false);
      }, 1500);
    }, 800);
  };

  const triggerError = () => {
    setSaveStatus('error');
    setShowIndicator(true);
    
    // Hide error after 3 seconds
    setTimeout(() => {
      setShowIndicator(false);
    }, 3000);
  };

  return {
    saveStatus,
    showIndicator,
    triggerSave,
    triggerError
  };
}