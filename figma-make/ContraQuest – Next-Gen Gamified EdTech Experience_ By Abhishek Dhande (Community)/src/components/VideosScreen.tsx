import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Search, 
  Filter, 
  Bell, 
  User, 
  Play, 
  Pause, 
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface VideosScreenProps {
  onBack: () => void;
}

interface Video {
  id: string;
  title: string;
  subject: string;
  duration: string;
  instructor: string;
  thumbnail: string;
  progress?: number;
  views: string;
  uploadedAt: string;
  description: string;
}

interface MiniPlayerState {
  video: Video | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

const categories = [
  { id: 'all', name: 'All' },
  { id: 'mathematics', name: 'Mathematics' },
  { id: 'science', name: 'Science' },
  { id: 'english', name: 'English' },
  { id: 'social-studies', name: 'Social Studies' }
];

const videoData: Video[] = [
  {
    id: '1',
    title: 'Introduction to Algebra',
    subject: 'Mathematics',
    duration: '10 min',
    instructor: 'Prof. Sharma',
    thumbnail: 'https://images.unsplash.com/photo-1561089489-f13d5e730d72?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYXRoZW1hdGljcyUyMGxlc3NvbiUyMGJsYWNrYm9hcmR8ZW58MXx8fHwxNzU3NTIxMTg0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    progress: 65,
    views: '2.3K',
    uploadedAt: '2 days ago',
    description: 'Learn the fundamentals of algebra with step-by-step explanations.'
  },
  {
    id: '2',
    title: 'Chemical Reactions Explained',
    subject: 'Science',
    duration: '15 min',
    instructor: 'Dr. Patel',
    thumbnail: 'https://images.unsplash.com/photo-1608037222011-cbf484177126?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzY2llbmNlJTIwbGFib3JhdG9yeSUyMGV4cGVyaW1lbnR8ZW58MXx8fHwxNzU3NDAxNzYxfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    views: '1.8K',
    uploadedAt: '1 day ago',
    description: 'Understanding how different chemicals interact and react with each other.'
  },
  {
    id: '3',
    title: 'Shakespeare\'s Romeo and Juliet',
    subject: 'English',
    duration: '20 min',
    instructor: 'Ms. Johnson',
    thumbnail: 'https://images.unsplash.com/photo-1597149305811-97fb60e49e6f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbmdsaXNoJTIwbGl0ZXJhdHVyZSUyMGJvb2tzfGVufDF8fHx8MTc1NzQ4NzQwNnww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    progress: 30,
    views: '3.1K',
    uploadedAt: '3 days ago',
    description: 'Deep dive into Shakespeare\'s most famous tragedy and its themes.'
  },
  {
    id: '4',
    title: 'World Geography: Continents',
    subject: 'Social Studies',
    duration: '12 min',
    instructor: 'Mr. Davis',
    thumbnail: 'https://images.unsplash.com/photo-1617480088906-60b89b36f305?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb2NpYWwlMjBzdHVkaWVzJTIwZ2VvZ3JhcGh5JTIwbWFwfGVufDF8fHx8MTc1NzUyMTE5M3ww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    views: '1.5K',
    uploadedAt: '4 days ago',
    description: 'Explore the seven continents and their unique characteristics.'
  },
  {
    id: '5',
    title: 'Quadratic Equations Made Easy',
    subject: 'Mathematics',
    duration: '18 min',
    instructor: 'Prof. Kumar',
    thumbnail: 'https://images.unsplash.com/photo-1584644769698-4762ca337c17?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzdHVkZW50JTIwbGVhcm5pbmclMjBvbmxpbmV8ZW58MXx8fHwxNzU3NTEyOTY3fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    progress: 80,
    views: '2.7K',
    uploadedAt: '1 week ago',
    description: 'Master quadratic equations with practical examples and solutions.'
  },
  {
    id: '6',
    title: 'Physics: Laws of Motion',
    subject: 'Science',
    duration: '14 min',
    instructor: 'Dr. Wilson',
    thumbnail: 'https://images.unsplash.com/photo-1563807893528-313039d9761f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZWFjaGVyJTIwY2xhc3Nyb29tJTIwcHJlc2VudGF0aW9ufGVufDF8fHx8MTc1NzUyMTIwMHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    views: '4.2K',
    uploadedAt: '5 days ago',
    description: 'Understand Newton\'s three laws of motion with real-world examples.'
  }
];

export function VideosScreen({ onBack }: VideosScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [filteredVideos, setFilteredVideos] = useState(videoData);
  const [miniPlayer, setMiniPlayer] = useState<MiniPlayerState>({
    video: null,
    isPlaying: false,
    currentTime: 0,
    duration: 100
  });
  const [showFilter, setShowFilter] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Filter videos based on search and category
  useEffect(() => {
    let filtered = videoData;
    
    if (searchQuery) {
      filtered = filtered.filter(video => 
        video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        video.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        video.instructor.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (activeCategory !== 'all') {
      filtered = filtered.filter(video => 
        video.subject.toLowerCase().replace(' ', '-') === activeCategory
      );
    }
    
    setFilteredVideos(filtered);
  }, [searchQuery, activeCategory]);



  const getSubjectColor = (subject: string) => {
    switch (subject.toLowerCase()) {
      case 'mathematics':
        return 'from-blue-500 to-blue-600';
      case 'science':
        return 'from-green-500 to-green-600';
      case 'english':
        return 'from-purple-500 to-purple-600';
      case 'social studies':
        return 'from-orange-500 to-orange-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const handleVideoClick = (video: Video) => {
    setMiniPlayer({
      video,
      isPlaying: true,
      currentTime: video.progress || 0,
      duration: 100
    });
  };

  const toggleMiniPlayer = () => {
    setMiniPlayer(prev => ({
      ...prev,
      isPlaying: !prev.isPlaying
    }));
  };

  const closeMiniPlayer = () => {
    setMiniPlayer({
      video: null,
      isPlaying: false,
      currentTime: 0,
      duration: 100
    });
  };

  const scrollCategories = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-[#ADC8FF]/10 via-white/50 to-white">
      {/* Sticky Header */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-lg border-b border-white/20">
        {/* Top Bar */}
        <div className="flex items-center gap-3 p-4">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onBack}
            className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md border border-white/50"
          >
            <ArrowLeft className="w-5 h-5 text-[#091A7A]" />
          </motion.button>

          {/* Search Bar */}
          <div className="flex-1 relative">
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10">
              <Search className="w-4 h-4 text-[#091A7A]/50" />
            </div>
            <input
              type="text"
              placeholder="Search Learning Videos…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 bg-gray-100/90 backdrop-blur-sm rounded-full border border-gray-300/60 text-sm text-[#091A7A] placeholder-[#091A7A]/50 focus:outline-none focus:ring-2 focus:ring-[#ADC8FF] focus:border-transparent"
            />
          </div>

          {/* Right Icons */}
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowFilter(!showFilter)}
              className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md border border-white/50"
            >
              <Filter className="w-4 h-4 text-[#091A7A]" />
            </motion.button>
            
            <motion.button
              whileTap={{ scale: 0.95 }}
              className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md border border-white/50"
            >
              <Bell className="w-4 h-4 text-[#091A7A]" />
            </motion.button>
            
            <motion.button
              whileTap={{ scale: 0.95 }}
              className="w-10 h-10 bg-gradient-to-br from-[#091A7A] to-[#1a2b8a] rounded-full flex items-center justify-center shadow-md"
            >
              <User className="w-4 h-4 text-white" />
            </motion.button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="relative px-4 pb-4">
          {/* Scroll Left Button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => scrollCategories('left')}
            className="absolute left-0 top-1/2 transform -translate-y-1/2 z-10 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md border border-white/50"
          >
            <ChevronLeft className="w-4 h-4 text-[#091A7A]" />
          </motion.button>

          {/* Scrollable Categories */}
          <div 
            ref={scrollContainerRef}
            className="flex gap-3 overflow-x-auto scrollbar-hide px-10"
          >
            {categories.map((category) => (
              <motion.button
                key={category.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveCategory(category.id)}
                className={`px-4 py-2 rounded-full whitespace-nowrap transition-all ${
                  activeCategory === category.id
                    ? 'bg-[#091A7A] text-white shadow-lg'
                    : 'bg-white/80 text-[#091A7A] border border-white/50'
                }`}
              >
                <span className="text-sm font-medium">{category.name}</span>
              </motion.button>
            ))}
          </div>

          {/* Scroll Right Button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => scrollCategories('right')}
            className="absolute right-0 top-1/2 transform -translate-y-1/2 z-10 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md border border-white/50"
          >
            <ChevronRight className="w-4 h-4 text-[#091A7A]" />
          </motion.button>
        </div>
      </div>

      {/* Video Feed */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="p-4 space-y-4">
          <AnimatePresence>
            {filteredVideos.map((video, index) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => handleVideoClick(video)}
                className="bg-white/90 backdrop-blur-sm rounded-3xl overflow-hidden shadow-lg border border-white/60 cursor-pointer hover:shadow-xl transition-all duration-300"
              >
                {/* Video Thumbnail */}
                <div className="relative aspect-video">
                  <ImageWithFallback
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200">
                    <div className="w-16 h-16 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg">
                      <Play className="w-8 h-8 text-[#091A7A] ml-1" fill="currentColor" />
                    </div>
                  </div>



                  {/* Duration Badge */}
                  <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/80 backdrop-blur-sm rounded-lg">
                    <span className="text-white text-xs font-medium">{video.duration}</span>
                  </div>

                  {/* Progress Bar */}
                  {video.progress && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                      <div 
                        className="h-full bg-[#ADC8FF] transition-all duration-300"
                        style={{ width: `${video.progress}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Video Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-[#091A7A] mb-2 line-clamp-2">
                    {video.title}
                  </h3>
                  
                  <div className="flex items-center gap-2 text-sm text-[#091A7A]/70 mb-2">
                    <span>{video.subject}</span>
                    <span>•</span>
                    <span>{video.duration}</span>
                    <span>•</span>
                    <span>By {video.instructor}</span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-[#091A7A]/50">
                    <span>{video.views} views</span>
                    <span>{video.uploadedAt}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredVideos.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <div className="w-16 h-16 bg-[#ADC8FF]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-[#091A7A]/50" />
              </div>
              <p className="text-[#091A7A]/70">No videos found</p>
              <p className="text-sm text-[#091A7A]/50 mt-1">Try adjusting your search or filters</p>
            </motion.div>
          )}
        </div>

        {/* Bottom padding for mini player */}
        <div className={miniPlayer.video ? "h-20" : "h-4"} />
      </div>

      {/* Mini Player */}
      <AnimatePresence>
        {miniPlayer.video && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-20 left-4 right-4 z-50"
          >
            <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-xl border border-white/60 overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                {/* Mini Thumbnail */}
                <div className="relative w-16 h-12 rounded-lg overflow-hidden flex-shrink-0">
                  <ImageWithFallback
                    src={miniPlayer.video.thumbnail}
                    alt={miniPlayer.video.title}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Video Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-[#091A7A] text-sm truncate">
                    {miniPlayer.video.title}
                  </h4>
                  <p className="text-xs text-[#091A7A]/70 truncate">
                    {miniPlayer.video.instructor}
                  </p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={toggleMiniPlayer}
                    className="w-10 h-10 bg-[#091A7A] rounded-full flex items-center justify-center"
                  >
                    {miniPlayer.isPlaying ? (
                      <Pause className="w-5 h-5 text-white" fill="currentColor" />
                    ) : (
                      <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                    )}
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={closeMiniPlayer}
                    className="w-8 h-8 bg-white/80 rounded-full flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-[#091A7A]" />
                  </motion.button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-1 bg-[#091A7A]/10">
                <motion.div
                  className="h-full bg-[#ADC8FF]"
                  style={{ width: `${miniPlayer.currentTime}%` }}
                  animate={{ width: miniPlayer.isPlaying ? `${Math.min(miniPlayer.currentTime + 1, 100)}%` : `${miniPlayer.currentTime}%` }}
                  transition={{ duration: 1, repeat: miniPlayer.isPlaying ? Infinity : 0 }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}