import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  BookOpen, 
  FileText, 
  Download, 
  Star,
  Clock,
  Eye,
  ChevronRight,
  Search,
  Filter
} from 'lucide-react';

interface StudyResourcesScreenProps {
  onBack: () => void;
}

interface Resource {
  id: string;
  title: string;
  type: 'pdf' | 'document' | 'notes';
  subject: string;
  size: string;
  downloads: number;
  rating: number;
  duration?: string;
  thumbnail: string;
  description: string;
}

const categories = [
  { id: 'all', name: 'All' },
  { id: 'mathematics', name: 'Mathematics' },
  { id: 'science', name: 'Science' },
  { id: 'english', name: 'English' },
  { id: 'social-studies', name: 'Social Studies' }
];

const resourcesData: Resource[] = [
  {
    id: '1',
    title: 'Algebra Fundamentals Study Guide',
    type: 'pdf',
    subject: 'Mathematics',
    size: '2.4 MB',
    downloads: 1250,
    rating: 4.8,
    thumbnail: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400&h=300&fit=crop',
    description: 'Complete guide covering all algebra basics with practice problems'
  },
  {
    id: '2',
    title: 'Chemistry Lab Safety Notes',
    type: 'notes',
    subject: 'Science',
    size: '1.1 MB',
    downloads: 890,
    rating: 4.6,
    thumbnail: 'https://images.unsplash.com/photo-1532634733-cae1395e440f?w=400&h=300&fit=crop',
    description: 'Essential lab safety protocols and procedures'
  },
  {
    id: '3',
    title: 'Essay Writing Techniques',
    type: 'document',
    subject: 'English',
    size: '3.2 MB',
    downloads: 2100,
    rating: 4.9,
    thumbnail: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400&h=300&fit=crop',
    description: 'Master the art of essay writing with proven techniques'
  },
  {
    id: '4',
    title: 'World History Timeline',
    type: 'pdf',
    subject: 'Social Studies',
    size: '4.8 MB',
    downloads: 1650,
    rating: 4.7,
    thumbnail: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=400&h=300&fit=crop',
    description: 'Visual timeline of major historical events'
  },
  {
    id: '5',
    title: 'Geometry Formulas Cheat Sheet',
    type: 'pdf',
    subject: 'Mathematics',
    size: '890 KB',
    downloads: 3200,
    rating: 5.0,
    thumbnail: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=400&h=300&fit=crop',
    description: 'Quick reference for all geometry formulas'
  },
  {
    id: '6',
    title: 'Physics Laws & Principles',
    type: 'notes',
    subject: 'Science',
    size: '1.8 MB',
    downloads: 1420,
    rating: 4.8,
    thumbnail: 'https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?w=400&h=300&fit=crop',
    description: 'Comprehensive overview of fundamental physics laws'
  }
];

export function StudyResourcesScreen({ onBack }: StudyResourcesScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [filteredResources, setFilteredResources] = useState(resourcesData);

  // Filter resources
  const handleFilter = (category: string) => {
    setActiveCategory(category);
    let filtered = resourcesData;
    
    if (searchQuery) {
      filtered = filtered.filter(resource => 
        resource.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resource.subject.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (category !== 'all') {
      filtered = filtered.filter(resource => 
        resource.subject.toLowerCase() === category
      );
    }
    
    setFilteredResources(filtered);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    handleFilter(activeCategory);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'pdf':
        return <FileText className="w-5 h-5" />;
      case 'document':
        return <BookOpen className="w-5 h-5" />;
      case 'notes':
        return <FileText className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

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

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-[#ADC8FF]/10 via-white/50 to-white">
      {/* Header */}
      <div className="bg-card-glass backdrop-blur-lg border-b border-white/20 p-4">
        <div className="flex items-center gap-3 mb-4">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onBack}
            className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md border border-white/50"
          >
            <ArrowLeft className="w-5 h-5 text-[#091A7A]" />
          </motion.button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#091A7A] to-[#1a2b8a] rounded-2xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-[#091A7A]">Study Resources</h1>
              <p className="text-xs text-[#091A7A]/70">Download study materials</p>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10">
            <Search className="w-4 h-4 text-[#091A7A]/50" />
          </div>
          <input
            type="text"
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 bg-white/90 backdrop-blur-sm rounded-full border border-white/60 text-sm text-[#091A7A] placeholder-[#091A7A]/50 focus:outline-none focus:ring-2 focus:ring-[#ADC8FF] focus:border-transparent"
          />
        </div>
      </div>

      {/* Category Filters */}
      <div className="px-4 py-3 border-b border-white/20">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {categories.map((category) => (
            <motion.button
              key={category.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleFilter(category.id)}
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
      </div>

      {/* Resources List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="p-4 space-y-3">
          <AnimatePresence>
            {filteredResources.map((resource, index) => (
              <motion.div
                key={resource.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.05 }}
                className="bg-card-glass backdrop-blur-lg rounded-3xl overflow-hidden shadow-card border border-white/20"
              >
                <div className="p-4">
                  <div className="flex gap-3">
                    {/* Resource Icon */}
                    <div className={`w-16 h-16 min-w-[4rem] bg-gradient-to-br ${getSubjectColor(resource.subject)} rounded-2xl flex items-center justify-center shadow-sm`}>
                      <div className="text-white">
                        {getTypeIcon(resource.type)}
                      </div>
                    </div>

                    {/* Resource Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-[#091A7A] mb-1 line-clamp-1">
                        {resource.title}
                      </h3>
                      <p className="text-xs text-[#091A7A]/70 mb-2 line-clamp-2">
                        {resource.description}
                      </p>
                      
                      {/* Meta Info */}
                      <div className="flex items-center gap-3 text-xs text-[#091A7A]/60">
                        <div className="flex items-center gap-1">
                          <Download className="w-3 h-3" />
                          <span>{resource.downloads}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-yellow-500" fill="currentColor" />
                          <span>{resource.rating}</span>
                        </div>
                        <span>{resource.size}</span>
                      </div>
                    </div>

                    {/* Download Button */}
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      className="w-10 h-10 min-w-[2.5rem] bg-[#091A7A] rounded-full flex items-center justify-center shadow-sm"
                    >
                      <Download className="w-4 h-4 text-white" />
                    </motion.button>
                  </div>

                  {/* Subject Tag */}
                  <div className="mt-3 inline-flex">
                    <span className="px-3 py-1 bg-white/60 rounded-full text-xs font-medium text-[#091A7A]">
                      {resource.subject}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredResources.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <div className="w-16 h-16 bg-[#ADC8FF]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-[#091A7A]/50" />
              </div>
              <p className="text-[#091A7A]/70">No resources found</p>
              <p className="text-sm text-[#091A7A]/50 mt-1">Try adjusting your search or filters</p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
