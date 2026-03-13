import { useState } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  Volume2, 
  Maximize, 
  ThumbsUp, 
  ThumbsDown, 
  Bookmark, 
  Star,
  UserPlus
} from 'lucide-react';

interface LessonPlayerScreenProps {
  onBack: () => void;
  onTakeQuiz: () => void;
  lessonTitle?: string;
  teacherName?: string;
  teacherImage?: string;
}

interface Teacher {
  name: string;
  designation: string;
  rating: number;
  avatar: string;
  followers: string;
}

export function LessonPlayerScreen({ 
  onBack, 
  onTakeQuiz, 
  lessonTitle = "Introduction to Algebra",
  teacherName = "Dr. Sarah Wilson"
}: LessonPlayerScreenProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [progress, setProgress] = useState(35); // Video progress percentage

  const teacher: Teacher = {
    name: teacherName,
    designation: "Mathematics Professor",
    rating: 4.8,
    avatar: "https://images.unsplash.com/photo-1511629091441-ee46146481b6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvbmxpbmUlMjBlZHVjYXRpb24lMjB0ZWFjaGVyJTIwcHJvZmVzc29yfGVufDF8fHx8MTc1NzUzNzU0MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    followers: "12.5K"
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleLike = () => {
    if (isDisliked) setIsDisliked(false);
    setIsLiked(!isLiked);
  };

  const handleDislike = () => {
    if (isLiked) setIsLiked(false);
    setIsDisliked(!isDisliked);
  };

  const handleSave = () => {
    setIsSaved(!isSaved);
  };

  const handleFollow = () => {
    setIsFollowing(!isFollowing);
  };

  return (
    <div className="h-full bg-gradient-to-b from-[#ADC8FF] via-[#E8F2FF]/95 to-white">
      {/* Video Player Section */}
      <div className="relative">
        {/* Video Container */}
        <div className="relative w-full aspect-video bg-black">
          {/* Lesson Thumbnail Background - Default State */}
          <div className="absolute inset-0">
            {/* Lesson Thumbnail Background */}
            <div 
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url('https://images.unsplash.com/photo-1560785472-2f186f554644?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYXRoZW1hdGljcyUyMGxlc3NvbiUyMGFsZ2VicmElMjBlcXVhdGlvbnN8ZW58MXx8fHwxNzU3NTM4NzY4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral')`
              }}
            />
            
            {/* Thumbnail Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
            
            {/* Lesson Title Overlay */}
            <div className="absolute bottom-16 left-4 right-4">
              <div className="bg-black/60 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                <h3 className="text-white font-semibold text-lg mb-1">Introduction to Algebra</h3>
                <p className="text-white/80 text-sm">Learn the fundamentals of algebraic equations</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span className="text-white/60 text-xs">7:20 duration</span>
                </div>
              </div>
            </div>
            
            {/* Central Play Button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handlePlayPause}
                className="w-20 h-20 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-2xl border-4 border-white/50"
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 text-[#091A7A] ml-1" />
                ) : (
                  <Play className="w-8 h-8 text-[#091A7A] ml-1" />
                )}
              </motion.button>
            </div>
          </div>

          {/* Video Controls Overlay - Show on Hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300">
            {/* Top Controls */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onBack}
                className="w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/20"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/20"
              >
                <Maximize className="w-5 h-5 text-white" />
              </motion.button>
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-4 left-4 right-4 z-10">
              {/* Progress Bar */}
              <div className="w-full h-1 bg-white/30 rounded-full mb-3 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="h-full bg-white rounded-full"
                />
              </div>
              
              {/* Control Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handlePlayPause}
                    className="w-8 h-8 flex items-center justify-center"
                  >
                    {isPlaying ? (
                      <Pause className="w-6 h-6 text-white" />
                    ) : (
                      <Play className="w-6 h-6 text-white" />
                    )}
                  </motion.button>
                  
                  <span className="text-white text-sm font-medium">2:35 / 7:20</span>
                </div>
                
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-8 h-8 flex items-center justify-center"
                >
                  <Volume2 className="w-6 h-6 text-white" />
                </motion.button>
              </div>
            </div>
          </div>
        </div>

        {/* Lesson Title Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6">
          <h1 className="text-white font-semibold text-lg mb-1">{lessonTitle}</h1>
          <p className="text-white/80 text-sm">Mathematics • Grade 10</p>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 px-6">
        {/* Engagement Buttons */}
        <div className="flex items-center gap-4 py-4 border-b border-white/20">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleLike}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-200 ${
              isLiked 
                ? 'bg-[#4F8EFF] border-[#4F8EFF] text-white' 
                : 'bg-white/90 border-white/40 text-[#4F8EFF] hover:bg-[#4F8EFF]/10'
            }`}
          >
            <ThumbsUp className="w-4 h-4" />
            <span className="text-sm font-medium">1.2K</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDislike}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-200 ${
              isDisliked 
                ? 'bg-gray-500 border-gray-500 text-white' 
                : 'bg-white/90 border-white/40 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ThumbsDown className="w-4 h-4" />
            <span className="text-sm font-medium">23</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSave}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-200 ${
              isSaved 
                ? 'bg-amber-500 border-amber-500 text-white' 
                : 'bg-white/90 border-white/40 text-amber-600 hover:bg-amber-50'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span className="text-sm font-medium">{isSaved ? 'Saved' : 'Save'}</span>
          </motion.button>
        </div>

        {/* Teacher Info Section */}
        <div className="py-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={teacher.avatar}
                alt={teacher.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-lg"
              />
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-subheading text-[#091A7A] font-semibold">{teacher.name}</h3>
                <div className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                  <span className="text-tiny text-[#091A7A] font-medium">{teacher.rating}</span>
                </div>
              </div>
              <p className="text-small text-[#6B8EFF]/80">{teacher.designation}</p>
              <p className="text-tiny text-[#6B8EFF]/60">{teacher.followers} followers</p>
            </div>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleFollow}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 ${
                isFollowing
                  ? 'bg-gray-100 text-gray-600 border border-gray-200'
                  : 'bg-[#4F8EFF] text-white border border-[#4F8EFF] hover:bg-[#3B7FFF]'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span className="text-sm font-medium">
                {isFollowing ? 'Following' : 'Follow'}
              </span>
            </motion.button>
          </div>
        </div>

        {/* Lesson Summary Section */}
        <div className="pb-6">
          <h3 className="text-subheading text-[#091A7A] font-semibold mb-3">Lesson Summary</h3>
          <div className="bg-white/90 backdrop-blur-md rounded-2xl p-4 border border-white/50 shadow-card">
            <p className="text-body text-[#4F8EFF] leading-relaxed">
              In this lesson, you'll learn how to solve quadratic equations using step-by-step methods. 
              We'll cover the quadratic formula, factoring techniques, and completing the square method. 
              You'll also see real-world examples of how quadratic equations are used in physics and engineering.
            </p>
            
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-[#ADC8FF]/30 text-[#091A7A] text-tiny font-medium rounded-full">
                Quadratic Formula
              </span>
              <span className="px-3 py-1 bg-[#ADC8FF]/30 text-[#091A7A] text-tiny font-medium rounded-full">
                Factoring
              </span>
              <span className="px-3 py-1 bg-[#ADC8FF]/30 text-[#091A7A] text-tiny font-medium rounded-full">
                Real Applications
              </span>
            </div>
          </div>
        </div>

        {/* Bottom spacing for fixed quiz button */}
        <div className="pb-28"></div>
      </div>

      {/* Fixed Bottom Quiz Button */}
      <div className="fixed bottom-8 left-8 right-8">
        <motion.button
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={onTakeQuiz}
          className="w-full bg-[#ADC8FF] text-[#091A7A] rounded-full p-4 shadow-lg"
        >
          <div className="flex items-center justify-center">
            <span className="text-subheading font-semibold text-[#091A7A]">Take Quiz for this Lesson</span>
          </div>
        </motion.button>
      </div>

    </div>
  );
}