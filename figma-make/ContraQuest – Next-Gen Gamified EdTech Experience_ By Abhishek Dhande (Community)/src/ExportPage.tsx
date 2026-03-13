import { motion } from 'motion/react';
import { FrameExporter } from './components/FrameExporter';

// Export page that matches your app's design system
export default function ExportPage() {
  const handleBackToApp = () => {
    window.location.pathname = '/';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-pink-50 to-purple-50">
      {/* Back to App Button */}
      <div className="fixed top-4 left-4 z-50">
        <motion.button
          onClick={handleBackToApp}
          whileTap={{ scale: 0.95 }}
          className="px-4 py-3 bg-card-glass border border-white/20 backdrop-blur-lg rounded-[20px] shadow-card animate-touch min-h-[44px] min-w-[44px]"
          style={{ color: 'var(--color-primary)' }}
        >
          <span className="text-section-header">← Back to App</span>
        </motion.button>
      </div>

      <FrameExporter />
    </div>
  );
}