import { motion } from 'motion/react';
import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Mail, User, Lock, Sparkles } from 'lucide-react';
import Download1 from '../imports/Download1';

interface SignupScreenProps {
  onBack: () => void;
  onSignupComplete: () => void;
}

export function SignupScreen({ onBack, onSignupComplete }: SignupScreenProps) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSignup = async () => {
    if (!formData.fullName || !formData.email || !formData.password || !formData.confirmPassword || !agreedToTerms) {
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      return;
    }

    setIsLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      onSignupComplete();
    }, 2000);
  };

  const isFormValid = formData.fullName && formData.email && formData.password && 
                     formData.confirmPassword && formData.password === formData.confirmPassword && agreedToTerms;

  return (
    <div className="flex-1 flex flex-col relative">
      {/* Floating Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ 
              opacity: [0, 0.3, 0],
              scale: [0, 1, 0],
              x: [0, Math.random() * 200 - 100],
              y: [0, Math.random() * 300 - 150],
            }}
            transition={{
              duration: 4,
              delay: i * 0.5,
              repeat: Infinity,
              repeatDelay: 2
            }}
            className="absolute w-8 h-8 rounded-full bg-gradient-to-r from-[#ADC8FF] to-[#091A7A] opacity-20"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              filter: 'blur(4px)'
            }}
          />
        ))}
      </div>

      {/* Header */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="flex items-center justify-between p-6 pt-8 relative z-10"
      >
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="w-12 h-12 bg-card-glass border border-white/30 rounded-full flex items-center justify-center shadow-card animate-touch min-h-[44px] min-w-[44px] backdrop-blur-lg"
        >
          <ArrowLeft size={20} color="#091A7A" />
        </motion.button>
        
        <div className="flex-1 text-center">
          <motion.h2 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-main-heading"
            style={{
              fontSize: '24px',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #091A7A 0%, #ADC8FF 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: 'Lexend, sans-serif'
            }}
          >
            Create Account
          </motion.h2>
          <motion.p 
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-small opacity-70 mt-1"
          >
            Join the learning revolution
          </motion.p>
        </div>
        
        <div className="w-12" />
      </motion.div>

      {/* Animated Logo */}
      <div className="flex justify-center mb-8">
        <motion.div
          initial={{ scale: 0, rotateY: 180 }}
          animate={{ scale: 1, rotateY: 0 }}
          transition={{ 
            duration: 0.8, 
            delay: 0.4,
            type: "spring",
            bounce: 0.4
          }}
          className="relative"
        >
          {/* Glow Effect */}
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.6, 0.3]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute inset-0 w-20 h-20 bg-[#ADC8FF]/30 rounded-[20px] blur-lg"
          />
          
          {/* Main Logo Container */}
          <div className="relative w-20 h-20 bg-card-glass border border-white/30 rounded-[20px] p-4 shadow-elevated backdrop-blur-lg">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="w-full h-full text-[#091A7A]"
            >
              <Download1 />
            </motion.div>
          </div>

          {/* Sparkle Effects */}
          <Sparkles 
            size={16} 
            className="absolute -top-2 -right-2 text-[#ADC8FF] animate-pulse" 
          />
        </motion.div>
      </div>

      {/* Form Container */}
      <div className="flex-1 px-6">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="space-y-5"
        >
          {/* Full Name Input */}
          <motion.div
            animate={focusedField === 'fullName' ? { scale: 1.02 } : { scale: 1 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            <label className="text-small font-medium" style={{ color: '#091A7A' }}>Full Name</label>
            <div className="relative">
              <motion.div
                animate={focusedField === 'fullName' ? { scale: 1.1, color: '#ADC8FF' } : { scale: 1, color: '#6B7280' }}
                transition={{ duration: 0.2 }}
                className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10"
              >
                <User size={20} />
              </motion.div>
              <input
                type="text"
                placeholder="Enter your full name"
                value={formData.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
                onFocus={() => setFocusedField('fullName')}
                onBlur={() => setFocusedField(null)}
                className="w-full h-14 bg-card-glass border border-white/30 rounded-[20px] pl-12 pr-4 text-body placeholder-gray-400 backdrop-blur-lg shadow-card focus:outline-none focus:ring-2 focus:ring-[#ADC8FF]/50 focus:border-[#ADC8FF]/50 animate-touch min-h-[44px] transition-all duration-200"
                style={{ fontSize: '14px', fontFamily: 'Lexend, sans-serif' }}
              />
              {formData.fullName && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2"
                >
                  <div className="w-5 h-5 bg-gradient-to-br from-[#10B981] via-[#059669] to-[#047857] rounded-full flex items-center justify-center shadow-lg ring-2 ring-white/30 relative overflow-hidden">
                    {/* Subtle shine effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent rounded-full" />
                    
                    {/* Modern SVG checkmark */}
                    <svg 
                      width="12" 
                      height="10" 
                      viewBox="0 0 12 10" 
                      fill="none" 
                      className="relative z-10"
                    >
                      <path 
                        d="M1.5 5L4.5 8L10.5 2" 
                        stroke="white" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Email Input */}
          <motion.div
            animate={focusedField === 'email' ? { scale: 1.02 } : { scale: 1 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            <label className="text-small font-medium" style={{ color: '#091A7A' }}>Email Address</label>
            <div className="relative">
              <motion.div
                animate={focusedField === 'email' ? { scale: 1.1, color: '#ADC8FF' } : { scale: 1, color: '#6B7280' }}
                transition={{ duration: 0.2 }}
                className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10"
              >
                <Mail size={20} />
              </motion.div>
              <input
                type="email"
                placeholder="Enter your email address"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                className="w-full h-14 bg-card-glass border border-white/30 rounded-[20px] pl-12 pr-4 text-body placeholder-gray-400 backdrop-blur-lg shadow-card focus:outline-none focus:ring-2 focus:ring-[#ADC8FF]/50 focus:border-[#ADC8FF]/50 animate-touch min-h-[44px] transition-all duration-200"
                style={{ fontSize: '14px', fontFamily: 'Lexend, sans-serif' }}
              />
              {formData.email && formData.email.includes('@') && formData.email.includes('.') && (
                <motion.div
                  initial={{ scale: 0, rotate: 180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2"
                >
                  <div className="w-5 h-5 bg-gradient-to-br from-[#10B981] via-[#059669] to-[#047857] rounded-full flex items-center justify-center shadow-lg ring-2 ring-white/30 relative overflow-hidden">
                    {/* Subtle shine effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent rounded-full" />
                    
                    {/* Modern SVG checkmark */}
                    <svg 
                      width="12" 
                      height="10" 
                      viewBox="0 0 12 10" 
                      fill="none" 
                      className="relative z-10"
                    >
                      <path 
                        d="M1.5 5L4.5 8L10.5 2" 
                        stroke="white" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Password Input */}
          <motion.div
            animate={focusedField === 'password' ? { scale: 1.02 } : { scale: 1 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            <label className="text-small font-medium" style={{ color: '#091A7A' }}>Password</label>
            <div className="relative">
              <motion.div
                animate={focusedField === 'password' ? { scale: 1.1, color: '#ADC8FF' } : { scale: 1, color: '#6B7280' }}
                transition={{ duration: 0.2 }}
                className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10"
              >
                <Lock size={20} />
              </motion.div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Create a strong password"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                className="w-full h-14 bg-card-glass border border-white/30 rounded-[20px] pl-12 pr-12 text-body placeholder-gray-400 backdrop-blur-lg shadow-card focus:outline-none focus:ring-2 focus:ring-[#ADC8FF]/50 focus:border-[#ADC8FF]/50 animate-touch min-h-[44px] transition-all duration-200"
                style={{ fontSize: '14px', fontFamily: 'Lexend, sans-serif' }}
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 p-1 animate-touch min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[12px] hover:bg-white/10 transition-colors duration-200"
              >
                <motion.div
                  animate={{ rotate: showPassword ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {showPassword ? (
                    <EyeOff size={20} color="#6B7280" />
                  ) : (
                    <Eye size={20} color="#6B7280" />
                  )}
                </motion.div>
              </motion.button>
            </div>
            {formData.password && (
              <div className="flex space-x-1 mt-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                      formData.password.length >= i * 2 
                        ? i <= 2 ? 'bg-[#EF4444]' : i <= 3 ? 'bg-[#F59E0B]' : 'bg-[#10B981]'
                        : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
            )}
          </motion.div>

          {/* Confirm Password Input */}
          <motion.div
            animate={focusedField === 'confirmPassword' ? { scale: 1.02 } : { scale: 1 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            <label className="text-small font-medium" style={{ color: '#091A7A' }}>Confirm Password</label>
            <div className="relative">
              <motion.div
                animate={focusedField === 'confirmPassword' ? { scale: 1.1, color: '#ADC8FF' } : { scale: 1, color: '#6B7280' }}
                transition={{ duration: 0.2 }}
                className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10"
              >
                <Lock size={20} />
              </motion.div>
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                onFocus={() => setFocusedField('confirmPassword')}
                onBlur={() => setFocusedField(null)}
                className="w-full h-14 bg-card-glass border border-white/30 rounded-[20px] pl-12 pr-12 text-body placeholder-gray-400 backdrop-blur-lg shadow-card focus:outline-none focus:ring-2 focus:ring-[#ADC8FF]/50 focus:border-[#ADC8FF]/50 animate-touch min-h-[44px] transition-all duration-200"
                style={{ fontSize: '14px', fontFamily: 'Lexend, sans-serif' }}
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 p-1 animate-touch min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[12px] hover:bg-white/10 transition-colors duration-200"
              >
                <motion.div
                  animate={{ rotate: showConfirmPassword ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={20} color="#6B7280" />
                  ) : (
                    <Eye size={20} color="#6B7280" />
                  )}
                </motion.div>
              </motion.button>
              {formData.confirmPassword && formData.password === formData.confirmPassword && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute right-14 top-1/2 transform -translate-y-1/2"
                >
                  <div className="w-5 h-5 bg-gradient-to-br from-[#10B981] via-[#059669] to-[#047857] rounded-full flex items-center justify-center shadow-lg ring-2 ring-white/30 relative overflow-hidden">
                    {/* Subtle shine effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent rounded-full" />
                    
                    {/* Modern SVG checkmark */}
                    <svg 
                      width="12" 
                      height="10" 
                      viewBox="0 0 12 10" 
                      fill="none" 
                      className="relative z-10"
                    >
                      <path 
                        d="M1.5 5L4.5 8L10.5 2" 
                        stroke="white" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  </div>
                </motion.div>
              )}
            </div>
            {formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-tiny text-[#EF4444] mt-1 flex items-center space-x-1"
              >
                <span>•</span>
                <span>Passwords don't match</span>
              </motion.p>
            )}
          </motion.div>

          {/* Terms Checkbox */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="flex items-start space-x-3 mt-6 p-4 bg-gradient-to-r from-[#ADC8FF]/10 to-[#091A7A]/5 rounded-[16px] border border-white/20"
          >
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setAgreedToTerms(!agreedToTerms)}
              className="relative flex items-center justify-center p-3 animate-touch transition-all duration-200"
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              {/* Modern Animated Checkbox */}
              <motion.div 
                animate={{
                  background: agreedToTerms 
                    ? 'linear-gradient(135deg, #091A7A 0%, #4A5FC4 50%, #091A7A 100%)'
                    : 'rgba(255, 255, 255, 0.9)',
                  borderColor: agreedToTerms ? '#091A7A' : 'rgba(255, 255, 255, 0.3)',
                  scale: agreedToTerms ? 1.05 : 1
                }}
                transition={{ 
                  duration: 0.4, 
                  ease: [0.23, 1, 0.32, 1]
                }}
                className="w-4 h-4 border rounded-[6px] flex items-center justify-center shadow-card relative overflow-hidden"
              >
                {/* Animated Shine Effect */}
                {agreedToTerms && (
                  <motion.div
                    initial={{ x: '-120%', opacity: 0 }}
                    animate={{ x: '120%', opacity: [0, 1, 0] }}
                    transition={{ 
                      duration: 0.6,
                      delay: 0.1,
                      ease: "easeOut"
                    }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12"
                  />
                )}

                {/* Modern SVG Checkmark Animation */}
                {agreedToTerms && (
                  <motion.svg
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ 
                      scale: 1, 
                      opacity: 1,
                      rotate: [0, -5, 5, 0]
                    }}
                    transition={{ 
                      duration: 0.5,
                      delay: 0.1,
                      type: "spring",
                      bounce: 0.6
                    }}
                    width="10"
                    height="8"
                    viewBox="0 0 10 8"
                    fill="none"
                    className="relative z-10"
                  >
                    <motion.path
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{
                        pathLength: { duration: 0.4, delay: 0.2, ease: "easeInOut" },
                        opacity: { duration: 0.1, delay: 0.2 }
                      }}
                      d="M1 4L3.5 6.5L9 1"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </motion.svg>
                )}

                {/* Ripple Effect */}
                {agreedToTerms && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0.6 }}
                    animate={{ scale: 3, opacity: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="absolute inset-0 bg-[#091A7A]/20 rounded-full"
                  />
                )}
              </motion.div>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setAgreedToTerms(!agreedToTerms)}
              className="flex-1 text-left animate-touch"
            >
              <p className="text-small text-[#6B7280] leading-relaxed">
                I agree to the <span className="text-[#091A7A] font-medium">Terms of Service</span> and <span className="text-[#091A7A] font-medium">Privacy Policy</span>
              </p>
            </motion.button>
          </motion.div>

          {/* Register Button */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleSignup}
            disabled={!isFormValid || isLoading}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.5 }}
            className={`w-full h-16 rounded-[24px] font-semibold shadow-elevated animate-touch min-h-[44px] mt-8 relative overflow-hidden transition-all duration-300 flex items-center justify-center ${
              isFormValid && !isLoading
                ? 'bg-gradient-to-r from-[#091A7A] via-[#4A5FC4] to-[#091A7A] text-white hover:shadow-2xl'
                : 'bg-gradient-to-r from-gray-300 to-gray-200 text-gray-500'
            }`}
            style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'Lexend, sans-serif' }}
          >
            {/* Animated Background Shine */}
            {isFormValid && !isLoading && (
              <>
                <motion.div
                  animate={{
                    x: ['-120%', '120%']
                  }}
                  transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    repeatDelay: 1,
                    ease: "easeInOut"
                  }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12"
                />
                
                {/* Subtle Glow */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#ADC8FF]/20 via-transparent to-[#ADC8FF]/20 rounded-[24px]" />
              </>
            )}
            
            {/* Button Content */}
            <div className="relative z-10 flex items-center justify-center">
              {isLoading ? (
                <div className="flex items-center justify-center space-x-3">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full"
                  />
                  <span>Creating Account...</span>
                </div>
              ) : (
                <span>Create Account</span>
              )}
            </div>
          </motion.button>

          {/* Social Login */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.5 }}
            className="text-center mt-8"
          >
            {/* Divider */}
            <div className="flex items-center space-x-4 mb-6">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#ADC8FF]/50 to-transparent" />
              <motion.p 
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="text-small px-4 py-2 bg-card-glass border border-white/20 rounded-[12px] backdrop-blur-lg"
                style={{ 
                  fontSize: '14px', 
                  fontWeight: 500, 
                  color: '#091A7A',
                  fontFamily: 'Lexend, sans-serif'
                }}
              >
                Or continue with
              </motion.p>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#ADC8FF]/50 to-transparent" />
            </div>

            {/* Social Buttons - Only Google and Apple */}
            <div className="flex justify-center space-x-8">
              {[
                { 
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  ),
                  bg: 'bg-white border-gray-200/50',
                  shadow: 'shadow-lg'
                },
                { 
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                    </svg>
                  ),
                  bg: 'bg-black border-gray-800/50',
                  shadow: 'shadow-lg'
                }
              ].map((social, index) => (
                <motion.button
                  key={index}
                  whileTap={{ scale: 0.92 }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ 
                    delay: 1.4 + (index * 0.1),
                    duration: 0.5,
                    type: "spring",
                    bounce: 0.4
                  }}
                  className={`relative group w-14 h-14 ${social.bg} border rounded-full flex items-center justify-center ${social.shadow} animate-touch min-h-[44px] min-w-[44px] backdrop-blur-lg transition-all duration-300`}
                >
                  {/* Icon */}
                  <motion.div
                    whileTap={{ scale: 0.9 }}
                    className="flex items-center justify-center"
                  >
                    {social.icon}
                  </motion.div>

                  {/* Subtle Glow Effect */}
                  <motion.div
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-[#ADC8FF]/10 to-[#091A7A]/10 opacity-0 group-active:opacity-100 transition-opacity duration-200"
                  />
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Sign In Link */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6, duration: 0.5 }}
            className="text-center mt-8 mb-8"
          >
            <motion.div
              className="inline-flex items-center space-x-2 px-6 py-3 bg-card-glass border border-white/20 rounded-[16px] backdrop-blur-lg shadow-card"
              whileTap={{ scale: 0.98 }}
            >
              <p 
                className="text-small"
                style={{ 
                  fontSize: '14px', 
                  fontWeight: 400, 
                  color: '#091A7A',
                  fontFamily: 'Lexend, sans-serif'
                }}
              >
                Already have an account?
              </p>
              <motion.button
                whileTap={{ scale: 0.95 }}
                className="text-small font-medium animate-touch px-3 py-1 bg-gradient-to-r from-[#091A7A] to-[#ADC8FF] rounded-[12px] shadow-sm"
                style={{ 
                  fontSize: '14px', 
                  fontWeight: 600,
                  color: '#FFFFFF',
                  fontFamily: 'Lexend, sans-serif'
                }}
              >
                Sign in
              </motion.button>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}