import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Play, Clock, Star, Lock, ChevronRight, CheckCircle, Users } from 'lucide-react';
import profileImage from 'figma:asset/1627f3a870e9b56d751d07f53392d7a84aa55817.png';

interface Subject {
  id: string;
  name: string;
  description: string;
  progress: number;
  icon: React.ReactNode;
  color: string;
}

interface SubjectDetailScreenProps {
  subject: Subject;
  onBack: () => void;
  onStartQuiz: () => void;
  onLessonClick?: (lessonTitle: string) => void;
}

interface Chapter {
  id: string;
  title: string;
  duration: string;
  progress: number;
  isUnlocked: boolean;
  isCompleted: boolean;
}

interface Unit {
  id: string;
  title: string;
  chapters: Chapter[];
  progress: number;
}

// Mock teacher data
const teachers = [
  { id: 1, name: 'Dr. Sarah Wilson', avatar: 'https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=128&h=128&fit=crop&crop=faces&facepad=3' },
  { id: 2, name: 'Prof. Michael Chen', avatar: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=128&h=128&fit=crop&crop=faces&facepad=3' },
  { id: 3, name: 'Ms. Emily Davis', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=128&h=128&fit=crop&crop=faces&facepad=3' },
  { id: 4, name: 'Dr. James Rodriguez', avatar: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=128&h=128&fit=crop&crop=faces&facepad=3' },
  { id: 5, name: 'Prof. Lisa Thompson', avatar: 'https://images.unsplash.com/photo-1614289371518-722f2615943d?w=128&h=128&fit=crop&crop=faces&facepad=3' },
  { id: 6, name: 'Dr. Alex Kumar', avatar: 'https://images.unsplash.com/photo-1507591064344-4c6ce005b128?w=128&h=128&fit=crop&crop=faces&facepad=3' }
];

// Mock units and chapters data
const getUnitsData = (subjectName: string): Unit[] => {
  const mathUnits: Unit[] = [
    {
      id: 'unit1',
      title: 'Algebra & Geometry',
      progress: 60,
      chapters: [
        { id: 'ch1', title: 'Introduction to Algebra', duration: '12 min', progress: 100, isUnlocked: true, isCompleted: true },
        { id: 'ch2', title: 'Linear Equations', duration: '15 min', progress: 80, isUnlocked: true, isCompleted: false },
        { id: 'ch3', title: 'Quadratic Equations', duration: '18 min', progress: 40, isUnlocked: true, isCompleted: false }
      ]
    },
    {
      id: 'unit2',
      title: 'Trigonometry & Statistics',
      progress: 20,
      chapters: [
        { id: 'ch4', title: 'Basics of Trigonometry', duration: '14 min', progress: 20, isUnlocked: true, isCompleted: false },
        { id: 'ch5', title: 'Probability & Statistics', duration: '16 min', progress: 0, isUnlocked: false, isCompleted: false }
      ]
    }
  ];

  const englishUnits: Unit[] = [
    {
      id: 'unit1',
      title: 'Grammar & Vocabulary',
      progress: 75,
      chapters: [
        { id: 'ch1', title: 'Parts of Speech', duration: '10 min', progress: 100, isUnlocked: true, isCompleted: true },
        { id: 'ch2', title: 'Sentence Structure', duration: '13 min', progress: 90, isUnlocked: true, isCompleted: false },
        { id: 'ch3', title: 'Advanced Grammar', duration: '17 min', progress: 35, isUnlocked: true, isCompleted: false }
      ]
    },
    {
      id: 'unit2',
      title: 'Literature & Writing',
      progress: 30,
      chapters: [
        { id: 'ch4', title: 'Creative Writing', duration: '20 min', progress: 60, isUnlocked: true, isCompleted: false },
        { id: 'ch5', title: 'Poetry Analysis', duration: '15 min', progress: 0, isUnlocked: false, isCompleted: false }
      ]
    }
  ];

  const scienceUnits: Unit[] = [
    {
      id: 'unit1',
      title: 'Physics & Chemistry',
      progress: 50,
      chapters: [
        { id: 'ch1', title: 'Matter & Energy', duration: '14 min', progress: 100, isUnlocked: true, isCompleted: true },
        { id: 'ch2', title: 'Chemical Reactions', duration: '16 min', progress: 25, isUnlocked: true, isCompleted: false },
        { id: 'ch3', title: 'Forces & Motion', duration: '18 min', progress: 25, isUnlocked: true, isCompleted: false }
      ]
    },
    {
      id: 'unit2',
      title: 'Biology & Earth Science',
      progress: 15,
      chapters: [
        { id: 'ch4', title: 'Cell Biology', duration: '12 min', progress: 30, isUnlocked: true, isCompleted: false },
        { id: 'ch5', title: 'Ecosystems', duration: '15 min', progress: 0, isUnlocked: false, isCompleted: false }
      ]
    }
  ];

  const socialUnits: Unit[] = [
    {
      id: 'unit1',
      title: 'World History',
      progress: 45,
      chapters: [
        { id: 'ch1', title: 'Ancient Civilizations', duration: '16 min', progress: 100, isUnlocked: true, isCompleted: true },
        { id: 'ch2', title: 'Medieval Period', duration: '14 min', progress: 35, isUnlocked: true, isCompleted: false },
        { id: 'ch3', title: 'Modern Era', duration: '18 min', progress: 0, isUnlocked: true, isCompleted: false }
      ]
    },
    {
      id: 'unit2',
      title: 'Geography & Culture',
      progress: 25,
      chapters: [
        { id: 'ch4', title: 'World Geography', duration: '13 min', progress: 50, isUnlocked: true, isCompleted: false },
        { id: 'ch5', title: 'Cultural Studies', duration: '17 min', progress: 0, isUnlocked: false, isCompleted: false }
      ]
    }
  ];

  switch (subjectName.toLowerCase()) {
    case 'mathematics':
      return mathUnits;
    case 'english':
      return englishUnits;
    case 'science':
      return scienceUnits;
    case 'social studies':
      return socialUnits;
    default:
      return mathUnits;
  }
};

const getSubjectDescription = (subjectName: string): string => {
  switch (subjectName.toLowerCase()) {
    case 'mathematics':
      return 'Algebra, Geometry & Trigonometry – Grade 10';
    case 'english':
      return 'Grammar, Literature & Writing – Grade 10';
    case 'science':
      return 'Physics, Chemistry & Biology – Grade 10';
    case 'social studies':
      return 'History, Geography & Culture – Grade 10';
    default:
      return 'Education you can believe in';
  }
};

const getCurrentChapter = (units: Unit[]) => {
  for (const unit of units) {
    for (const chapter of unit.chapters) {
      if (!chapter.isCompleted && chapter.isUnlocked) {
        return { unit: unit.title, chapter: chapter.title, progress: chapter.progress };
      }
    }
  }
  return { unit: units[0].title, chapter: units[0].chapters[0].title, progress: units[0].chapters[0].progress };
};

export function SubjectDetailScreen({ subject, onBack, onStartQuiz, onLessonClick }: SubjectDetailScreenProps) {
  const [expandedUnits, setExpandedUnits] = useState<string[]>(['unit1']);
  
  const units = getUnitsData(subject.name);
  const subjectDescription = getSubjectDescription(subject.name);
  const currentChapter = getCurrentChapter(units);
  const totalProgress = Math.round(units.reduce((sum, unit) => sum + unit.progress, 0) / units.length);
  const totalVideos = units.reduce((sum, unit) => sum + unit.chapters.length, 0);
  const totalDuration = units.reduce((sum, unit) => sum + unit.chapters.length * 15, 0); // Approximate total duration

  const toggleUnit = (unitId: string) => {
    setExpandedUnits(prev => 
      prev.includes(unitId) 
        ? prev.filter(id => id !== unitId)
        : [...prev, unitId]
    );
  };

  return (
    <div className="h-full bg-gradient-to-b from-[#ADC8FF] via-[#E8F2FF]/95 to-white">
      {/* Header Section */}
      <div className="relative">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#ADC8FF]/30 via-transparent to-transparent" />
        
        <div className="relative px-6 pt-4 pb-6">
          {/* Top Navigation */}
          <div className="flex items-center justify-between mb-6">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onBack}
              className="w-12 h-12 bg-white/95 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg border border-white/40"
            >
              <ArrowLeft className="w-5 h-5 text-[#4F8EFF]" />
            </motion.button>
            
            <h1 className="text-section-header text-[#4F8EFF]/80">Course Details</h1>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-12 h-12 bg-white/95 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg border border-white/40"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#091A7A] to-[#4F8EFF] flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full" />
              </div>
            </motion.button>
          </div>

          {/* Subject Banner Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/90 backdrop-blur-md rounded-3xl p-6 shadow-xl border border-white/50 mb-6"
          >
            <div className="flex items-start gap-4 mb-4">
              <div className={`w-16 h-16 bg-gradient-to-br ${subject.color} rounded-3xl flex items-center justify-center shadow-lg`}>
                {subject.icon}
              </div>
              
              <div className="flex-1">
                <h1 className="text-main-heading text-[#4F8EFF] mb-2">{subject.name}</h1>
                <p className="text-small text-[#6B8EFF]/80 mb-3">{subjectDescription}</p>
                
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#6B8EFF]/60" />
                    <span className="text-tiny text-[#6B8EFF]/70">{Math.floor(totalDuration / 60)}h {totalDuration % 60}min</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500 fill-current" />
                    <span className="text-tiny font-medium text-[#4F8EFF]">4.9</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Overall Progress */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-subheading text-[#4F8EFF]">Overall Progress</span>
                <span className="text-subheading font-semibold text-[#4F8EFF]">{totalProgress}%</span>
              </div>
              
              <div className="h-3 bg-[#ADC8FF]/30 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${totalProgress}%` }}
                  transition={{ delay: 0.3, duration: 1.2, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-[#4F8EFF] to-[#7BA7FF] rounded-full shadow-sm"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-tiny text-[#6B8EFF]/70">Course Content</span>
                <span className="text-tiny text-[#6B8EFF]/80">{totalVideos} Videos</span>
              </div>
            </div>
          </motion.div>

          {/* Teachers Section */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <Users className="w-4 h-4 text-[#6B8EFF]/70" />
              <span className="text-small text-[#6B8EFF]/70">Instructors</span>
            </div>
            <div className="flex items-center">
              {teachers.slice(0, 5).map((teacher, index) => (
                <motion.div
                  key={teacher.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="relative"
                  style={{ marginLeft: index > 0 ? '-12px' : '0' }}
                >
                  <img
                    src={index === 0 ? profileImage : teacher.avatar}
                    alt={teacher.name}
                    className="w-11 h-11 rounded-full border-3 border-white shadow-lg object-cover object-[center_20%]"
                  />
                </motion.div>
              ))}
              <div 
                className="w-11 h-11 bg-white/95 backdrop-blur-md rounded-full border-3 border-white shadow-lg flex items-center justify-center"
                style={{ marginLeft: '-12px' }}
              >
                <span className="text-xs font-semibold text-[#4F8EFF]">+{teachers.length - 5}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Continue Learning Button */}
      <div className="px-6 mb-6">
        <motion.button
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={onStartQuiz}
          className="w-full bg-subject-gradient text-[#4F8EFF] rounded-3xl p-5 shadow-xl border border-white/40 backdrop-blur-lg"
        >
          <div className="flex items-center justify-between">
            <div className="text-left">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-white/30 rounded-xl flex items-center justify-center">
                  <Play className="w-4 h-4 text-[#4F8EFF]" />
                </div>
                <span className="text-subheading font-semibold">Continue Learning</span>
              </div>
              <p className="text-small text-[#4F8EFF]/80 font-medium">
                {currentChapter.unit}: {currentChapter.chapter}
              </p>
              <p className="text-small text-[#4F8EFF]/70 font-medium">
                {currentChapter.progress}% completed
              </p>
            </div>
            <div className="w-14 h-14 bg-white backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30 shadow-lg">
              <Play className="w-6 h-6 text-[#4F8EFF]" />
            </div>
          </div>
        </motion.button>
      </div>

      {/* Units & Lessons */}
      <div className="flex-1 px-6 pb-6">
        <div className="space-y-6">
          {units.map((unit, unitIndex) => {
            const isExpanded = expandedUnits.includes(unit.id);
            
            return (
              <motion.div
                key={unit.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: unitIndex * 0.1 }}
                className="bg-white/95 backdrop-blur-xl rounded-3xl overflow-hidden shadow-elevated border border-white/60 ring-1 ring-[#ADC8FF]/20"
                whileHover={{ 
                  scale: 1.01,
                  boxShadow: "0 25px 50px rgba(9, 26, 122, 0.3), 0 0 0 1px rgba(173, 200, 255, 0.4)"
                }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                {/* Unit Header */}
                <motion.button
                  whileHover={{ backgroundColor: 'rgba(173, 200, 255, 0.08)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => toggleUnit(unit.id)}
                  className="w-full p-6 flex items-center justify-between relative overflow-hidden"
                >
                  {/* Subtle gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[#ADC8FF]/5 via-transparent to-[#ADC8FF]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  <div className="text-left relative z-10">
                    <div className="flex items-center gap-4 mb-3">
                      <div className="w-10 h-10 bg-[#ADC8FF] rounded-full flex items-center justify-center border border-white/30 shadow-lg ring-1 ring-[#ADC8FF]/30">
                        <span className="text-small font-semibold text-[#091A7A]">{unitIndex + 1}</span>
                      </div>
                      <span className="text-body font-semibold text-[#091A7A]/80">Unit {unitIndex + 1}</span>
                    </div>
                    <h3 className="text-subheading text-[#4F8EFF] mb-2">{unit.title}</h3>
                    <div className="flex items-center gap-4">
                      <div className="h-2.5 w-24 bg-[#ADC8FF]/30 rounded-full overflow-hidden shadow-inner">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${unit.progress}%` }}
                          transition={{ delay: 0.5, duration: 1, ease: "easeOut" }}
                          className="h-full bg-gradient-to-r from-[#4F8EFF] to-[#7BA7FF] rounded-full shadow-sm"
                        />
                      </div>
                      <span className="text-small font-semibold text-[#091A7A]">{unit.progress}%</span>
                    </div>
                  </div>
                  <motion.div
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="w-12 h-12 bg-[#ADC8FF]/15 rounded-full flex items-center justify-center border border-white/40 shadow-sm relative z-10"
                    whileHover={{ backgroundColor: 'rgba(173, 200, 255, 0.25)' }}
                  >
                    <ChevronRight className="w-5 h-5 text-[#091A7A]/70" />
                  </motion.div>
                </motion.button>

                {/* Unit Chapters */}
                <motion.div
                  initial={false}
                  animate={{ height: isExpanded ? 'auto' : 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="px-6 pb-6 space-y-4">
                    {/* Subtle separator */}
                    <div className="h-px bg-gradient-to-r from-transparent via-[#ADC8FF]/30 to-transparent mb-4" />
                    
                    {unit.chapters.map((chapter, chapterIndex) => (
                      <motion.div
                        key={chapter.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: chapterIndex * 0.08 }}
                        className="bg-white/90 backdrop-blur-sm rounded-2xl p-5 border border-white/70 shadow-card ring-1 ring-[#ADC8FF]/10 relative overflow-hidden"
                        whileHover={{ 
                          scale: 1.02,
                          boxShadow: "0 8px 25px rgba(9, 26, 122, 0.15)"
                        }}
                        transition={{ duration: 0.2 }}
                      >
                        {/* Subtle background pattern */}
                        <div className="absolute inset-0 bg-gradient-to-br from-[#ADC8FF]/3 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        
                        <div className="flex items-center justify-between relative z-10">
                          <div className="flex items-center gap-4 flex-1">
                            <div className="w-11 h-11 bg-gradient-to-br from-[#ADC8FF]/40 to-[#ADC8FF]/20 rounded-full flex items-center justify-center border border-white/50 shadow-sm">
                              <span className="text-small font-semibold text-[#091A7A]">{chapterIndex + 1}</span>
                            </div>
                            
                            <div className="flex-1">
                              <h4 className="text-subheading text-[#091A7A] mb-1.5 font-medium">{chapter.title}</h4>
                              <div className="flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5 text-[#6B8EFF]/70" />
                                <span className="text-small text-[#091A7A]/60 font-medium">{chapter.duration}</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {chapter.isCompleted ? (
                              <div className="w-9 h-9 bg-green-50 rounded-full flex items-center justify-center border border-green-200 shadow-sm">
                                <CheckCircle className="w-4.5 h-4.5 text-green-600" />
                              </div>
                            ) : chapter.isUnlocked ? (
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => onLessonClick?.(chapter.title)}
                                className="w-9 h-9 bg-gradient-to-br from-[#4F8EFF] to-[#7BA7FF] rounded-full flex items-center justify-center shadow-lg border border-white/30"
                              >
                                <Play className="w-3.5 h-3.5 text-white" />
                              </motion.button>
                            ) : (
                              <div className="w-9 h-9 bg-gray-50 rounded-full flex items-center justify-center border border-gray-200 shadow-sm">
                                <Lock className="w-4 h-4 text-gray-400" />
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {chapter.progress > 0 && !chapter.isCompleted && (
                          <div className="mt-4">
                            <div className="h-2 bg-[#ADC8FF]/25 rounded-full overflow-hidden shadow-inner">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${chapter.progress}%` }}
                                transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
                                className="h-full bg-gradient-to-r from-[#4F8EFF] to-[#7BA7FF] rounded-full shadow-sm"
                              />
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}