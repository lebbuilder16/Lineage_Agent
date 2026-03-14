import { motion } from 'motion/react';
import { useState } from 'react';

interface FrameExporterProps {
  showContent?: boolean;
  children?: React.ReactNode;
}

export function FrameExporter({ showContent = false, children }: FrameExporterProps) {
  const [showInstructions, setShowInstructions] = useState(false);

  const exportAsPNG = () => {
    // Browser-based export instructions
    setShowInstructions(true);
    
    // Auto-hide instructions after 15 seconds
    setTimeout(() => {
      setShowInstructions(false);
    }, 15000);
  };

  const copyFrameCode = () => {
    const frameCode = `<!-- iPhone 14 Frame Template -->
<div class="relative w-[428px] h-[926px] bg-gradient-to-br from-pink-100 via-pink-50 to-pink-200 rounded-[3.5rem] shadow-2xl">
  <!-- Frame Reflection/Highlight -->
  <div class="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-transparent rounded-[3.5rem]"></div>
  <div class="absolute inset-0 bg-gradient-to-tl from-white/5 via-transparent to-transparent rounded-[3.5rem]"></div>
  
  <!-- Side Buttons -->
  <div class="absolute -left-0.5 top-[180px] w-2 h-12 bg-pink-300 rounded-r-md shadow-inner"></div>
  <div class="absolute -left-0.5 top-[210px] w-2 h-12 bg-pink-300 rounded-r-md shadow-inner"></div>
  <div class="absolute -right-0.5 top-[200px] w-2 h-16 bg-pink-300 rounded-l-md shadow-inner"></div>
  
  <!-- Inner Bezel -->
  <div class="absolute inset-2 bg-black rounded-[3.2rem] shadow-inner">
    <!-- Dynamic Island -->
    <div class="absolute top-2 left-1/2 transform -translate-x-1/2 w-[126px] h-[37px] bg-black rounded-full shadow-lg z-50">
      <div class="absolute top-[8px] left-1/2 transform -translate-x-1/2 w-[50px] h-[3px] bg-gray-900 rounded-full"></div>
      <div class="absolute top-[6px] left-1/2 transform -translate-x-1/2 translate-x-[18px] w-[6px] h-[6px] bg-gray-800 rounded-full ring-1 ring-gray-700"></div>
    </div>
    
    <!-- Screen Area -->
    <div class="absolute inset-1 bg-white rounded-[3rem] overflow-hidden shadow-inner border border-gray-200/20">
      <!-- Your content goes here -->
    </div>
  </div>
  
  <!-- Outer Frame Edge Highlights -->
  <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent rounded-[3.5rem]"></div>
</div>`;
    
    navigator.clipboard.writeText(frameCode).then(() => {
      alert('✅ Frame HTML copied to clipboard!');
    }).catch(() => {
      // Fallback for older browsers
      console.log('Frame code ready to copy:', frameCode);
      alert('📋 Frame code logged to console - please copy manually');
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-pink-50 to-purple-50 flex flex-col items-center justify-center p-4 md:p-8">
      {/* Export Controls */}
      <div className="mb-8 flex flex-wrap gap-4 justify-center">
        <motion.button
          onClick={exportAsPNG}
          whileTap={{ scale: 0.95 }}
          className="px-6 py-4 bg-card-glass border border-white/20 backdrop-blur-lg rounded-[20px] shadow-card animate-touch min-h-[44px] min-w-[44px]"
          style={{ color: 'var(--color-primary)' }}
        >
          <span className="text-section-header">📱 Export Instructions</span>
        </motion.button>
        
        <motion.button
          onClick={copyFrameCode}
          whileTap={{ scale: 0.95 }}
          className="px-6 py-4 bg-glass border border-white/20 backdrop-blur-lg rounded-[20px] shadow-card animate-touch min-h-[44px] min-w-[44px]"
          style={{ color: 'var(--color-primary)' }}
        >
          <span className="text-section-header">📋 Copy HTML</span>
        </motion.button>
        
        <motion.button
          onClick={() => {
            const frameCode = `<!-- iPhone 14 Frame Template -->
<div class="relative w-[428px] h-[926px] bg-gradient-to-br from-pink-100 via-pink-50 to-pink-200 rounded-[3.5rem] shadow-2xl">
  <!-- Frame content as above -->
</div>`;
            const blob = new Blob([frameCode], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'iphone-frame-template.html';
            a.click();
            URL.revokeObjectURL(url);
          }}
          whileTap={{ scale: 0.95 }}
          className="px-6 py-4 bg-card-glass border border-white/20 backdrop-blur-lg rounded-[20px] shadow-card animate-touch min-h-[44px] min-w-[44px]"
          style={{ color: 'var(--color-primary)' }}
        >
          <span className="text-section-header">💾 Download</span>
        </motion.button>
      </div>

      {/* Export Instructions Overlay */}
      {showInstructions && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowInstructions(false)}
        >
          <motion.div
            initial={{ y: 20 }}
            animate={{ y: 0 }}
            className="bg-card-glass border border-white/20 backdrop-blur-lg rounded-[20px] p-6 max-w-lg w-full shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-main-heading mb-4">📱 Export as PNG Instructions</h2>
            
            <div className="space-y-4">
              <div className="bg-glass border border-white/20 p-3 rounded-[12px]">
                <h3 className="text-subheading mb-2">🚀 Quick Method (Recommended)</h3>
                <ol className="space-y-1 text-small">
                  <li>1. Right-click on the phone frame below</li>
                  <li>2. Select "Inspect Element" or press F12</li>
                  <li>3. Find the phone frame element in DevTools</li>
                  <li>4. Right-click → "Screenshot Node"</li>
                  <li>5. Save the PNG file</li>
                </ol>
              </div>
              
              <div className="bg-glass border border-white/20 p-3 rounded-[12px]">
                <h3 className="text-subheading mb-2">📷 Browser Screenshot</h3>
                <ol className="space-y-1 text-small">
                  <li>1. Press Ctrl+Shift+I (Windows) or Cmd+Opt+I (Mac)</li>
                  <li>2. Click the camera icon in DevTools</li>
                  <li>3. Choose "Capture full size screenshot"</li>
                  <li>4. Crop to the phone frame area</li>
                </ol>
              </div>
              
              <div className="bg-glass border border-white/20 p-3 rounded-[12px]">
                <h3 className="text-subheading mb-2">⚡ Pro Tip</h3>
                <p className="text-small">For transparent background, run this in console first:</p>
                <code className="block bg-card-glass p-2 rounded-[8px] mt-1 text-tiny font-mono">
                  document.body.style.background = 'transparent'
                </code>
              </div>
            </div>
            
            <motion.button
              onClick={() => setShowInstructions(false)}
              whileTap={{ scale: 0.95 }}
              className="w-full mt-4 px-4 py-3 bg-card-glass border border-white/20 backdrop-blur-lg rounded-[20px] shadow-card animate-touch min-h-[44px]"
              style={{ color: 'var(--color-primary)' }}
            >
              <span className="text-section-header">Got it! ✅</span>
            </motion.button>
          </motion.div>
        </motion.div>
      )}

      {/* Export Quality Info */}
      <div className="mb-6 text-center max-w-lg bg-card-glass border border-white/20 backdrop-blur-lg rounded-[20px] p-4 shadow-card">
        <p className="text-body">
          📐 <span className="text-subheading">Export Size:</span> 428×926px (iPhone 14 exact)<br/>
          🎨 <span className="text-subheading">Background:</span> Transparent PNG<br/>
          💻 <span className="text-subheading">Compatible:</span> Figma, Sketch, Adobe XD
        </p>
      </div>

      {/* iPhone Frame for Export */}
      <div 
        id="iphone-frame-export"
        className="relative scale-[0.7] origin-center"
        style={{ 
          filter: 'drop-shadow(0 25px 50px rgba(0, 0, 0, 0.15))'
        }}
      >
        {/* Device Shadow Layers */}
        <div className="absolute inset-0 bg-black/20 rounded-[3.5rem] blur-3xl transform translate-y-12 scale-110" />
        <div className="absolute inset-0 bg-black/15 rounded-[3.5rem] blur-2xl transform translate-y-8 scale-105" />
        <div className="absolute inset-0 bg-black/10 rounded-[3.5rem] blur-xl transform translate-y-4 scale-102" />
        
        {/* iPhone 14 Frame - Outer Shell */}
        <div className="relative w-[428px] h-[926px] bg-gradient-to-br from-pink-100 via-pink-50 to-pink-200 rounded-[3.5rem] shadow-2xl">
          {/* Frame Reflection/Highlight */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-transparent rounded-[3.5rem] pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-tl from-white/5 via-transparent to-transparent rounded-[3.5rem] pointer-events-none" />
          
          {/* Side Buttons */}
          {/* Volume Buttons */}
          <div className="absolute -left-0.5 top-[180px] w-2 h-12 bg-pink-300 rounded-r-md shadow-inner" />
          <div className="absolute -left-0.5 top-[210px] w-2 h-12 bg-pink-300 rounded-r-md shadow-inner" />
          
          {/* Power Button */}
          <div className="absolute -right-0.5 top-[200px] w-2 h-16 bg-pink-300 rounded-l-md shadow-inner" />
          
          {/* Inner Bezel */}
          <div className="absolute inset-2 bg-black rounded-[3.2rem] shadow-inner">
            
            {/* iPhone 16 Dynamic Island */}
            <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-[126px] h-[37px] bg-black rounded-full shadow-lg z-50">
              {/* Speaker Grille */}
              <div className="absolute top-[8px] left-1/2 transform -translate-x-1/2 w-[50px] h-[3px] bg-gray-900 rounded-full" />
              {/* Front Camera */}
              <div className="absolute top-[6px] left-1/2 transform -translate-x-1/2 translate-x-[18px] w-[6px] h-[6px] bg-gray-800 rounded-full ring-1 ring-gray-700" />
            </div>
            
            {/* Screen Area with proper inner bezel */}
            <div className="absolute inset-1 bg-white rounded-[3rem] overflow-hidden flex flex-col shadow-inner border border-gray-200/20">
              {showContent && children ? (
                children
              ) : (
                <div className="flex-1 bg-gradient-to-b from-[#ADC8FF] via-[#E8F2FF]/95 to-white flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-glass border border-white/20 rounded-full mx-auto mb-4 flex items-center justify-center shadow-card">
                      <span className="text-main-heading">📱</span>
                    </div>
                    <p className="text-subheading">Your Content Here</p>
                    <p className="text-small mt-1">Perfect iPhone 14 Template</p>
                  </div>
                </div>
              )}
              
              {/* iPhone Home Indicator */}
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-50">
                <div className="w-36 h-1 bg-black/60 rounded-full shadow-sm" />
              </div>
            </div>
          </div>
          
          {/* Outer Frame Edge Highlights */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent rounded-[3.5rem] pointer-events-none" />
        </div>
        
        {/* Ambient Screen Glow */}
        <div className="absolute inset-3 bg-gradient-to-br from-blue-100/20 via-transparent to-transparent rounded-[3rem] pointer-events-none blur-sm" />
        
        {/* Frame Edge Details */}
        <div className="absolute inset-0 rounded-[3.5rem] ring-1 ring-white/10 pointer-events-none" />
      </div>

      {/* Instructions */}
      <div className="mt-8 max-w-2xl text-center bg-card-glass border border-white/20 backdrop-blur-lg rounded-[20px] p-6 shadow-card space-y-2">
        <p className="text-small"><span className="text-subheading">🚀 Quick Export:</span> Click "Export Instructions" for step-by-step guide</p>
        <p className="text-small"><span className="text-subheading">🎨 Design Software:</span> Perfect for Figma, Sketch, Adobe XD mockups</p>
        <p className="text-small"><span className="text-subheading">📏 Dimensions:</span> 428×926px (iPhone 14 exact size)</p>
        <p className="text-small"><span className="text-subheading">💡 Pro Tip:</span> Save as component/symbol for reusable templates</p>
      </div>
    </div>
  );
}