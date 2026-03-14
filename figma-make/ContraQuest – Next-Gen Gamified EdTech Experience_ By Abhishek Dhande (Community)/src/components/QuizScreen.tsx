import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Clock, Star, CheckCircle, XCircle } from 'lucide-react';

interface QuizScreenProps {
  onBack: () => void;
  onXPGain: (points: number) => void;
  onStreakIncrease: () => void;
}

interface Question {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
}

const quizQuestions: Question[] = [
  {
    id: 1,
    question: "What is 15 × 8?",
    options: ["110", "120", "130", "140"],
    correctAnswer: 1
  },
  {
    id: 2,
    question: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Saturn"],
    correctAnswer: 1
  },
  {
    id: 3,
    question: "What is the capital of Australia?",
    options: ["Sydney", "Melbourne", "Canberra", "Perth"],
    correctAnswer: 2
  }
];

export function QuizScreen({ onBack, onXPGain, onStreakIncrease }: QuizScreenProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [quizCompleted, setQuizCompleted] = useState(false);

  const question = quizQuestions[currentQuestion];

  // Timer effect
  useEffect(() => {
    if (showResult || quizCompleted) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Time's up - auto submit current answer or move to next question
          setShowResult(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentQuestion, showResult, quizCompleted]);

  // Auto advance after showing result when time runs out
  useEffect(() => {
    if (showResult && timeLeft === 0) {
      const autoAdvanceTimer = setTimeout(() => {
        handleNextQuestion();
      }, 2000); // Show result for 2 seconds before advancing

      return () => clearTimeout(autoAdvanceTimer);
    }
  }, [showResult, timeLeft]);

  const handleAnswerSelect = (answerIndex: number) => {
    if (showResult) return;
    setSelectedAnswer(answerIndex);
  };

  const handleNextQuestion = () => {
    if (selectedAnswer === question.correctAnswer) {
      setScore(prev => prev + 1);
    }

    setShowResult(false);
    setSelectedAnswer(null);
    
    if (currentQuestion < quizQuestions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
      setTimeLeft(30);
    } else {
      setQuizCompleted(true);
      const xpGained = score * 50 + (selectedAnswer === question.correctAnswer ? 50 : 0);
      onXPGain(xpGained);
      if (score >= 2) {
        onStreakIncrease();
      }
    }
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) return;
    setShowResult(true);
  };

  if (quizCompleted) {
    return (
      <div className="p-6 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onBack}
            className="w-12 h-12 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg border border-white/50"
          >
            <ArrowLeft className="w-5 h-5 text-[#091A7A]" />
          </motion.button>
          <h1 className="text-2xl font-bold text-[#091A7A]">Quiz Complete!</h1>
        </div>

        {/* Results */}
        <div className="flex-1 flex flex-col items-center justify-center space-y-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="w-32 h-32 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-full flex items-center justify-center shadow-xl"
          >
            <Star className="w-16 h-16 text-white" fill="currentColor" />
          </motion.div>

          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold text-[#091A7A]">{score}/3</h2>
            <p className="text-lg text-[#091A7A]/70">Great job!</p>
            <div className="px-6 py-3 bg-gradient-to-r from-green-100 to-green-50 rounded-2xl border border-green-200">
              <p className="text-green-700 font-semibold">+{score * 50} XP Earned!</p>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onBack}
            className="w-full py-4 bg-gradient-to-r from-[#091A7A] to-[#1a2b8a] text-white font-semibold rounded-2xl shadow-lg"
          >
            Continue Learning
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="w-12 h-12 bg-card-glass backdrop-blur-lg rounded-full flex items-center justify-center shadow-card border border-white/20 animate-button"
        >
          <ArrowLeft className="w-5 h-5 text-[#091A7A]" />
        </motion.button>
        
        <motion.div 
          animate={{ 
            scale: timeLeft <= 5 ? [1, 1.1, 1] : 1,
            backgroundColor: timeLeft <= 5 ? ['rgba(255,255,255,0.9)', 'rgba(239,68,68,0.2)', 'rgba(255,255,255,0.9)'] : 'rgba(255,255,255,0.9)'
          }}
          transition={{ 
            duration: timeLeft <= 5 ? 0.5 : 0,
            repeat: timeLeft <= 5 ? Infinity : 0 
          }}
          className="flex items-center gap-2 px-4 py-2 bg-card-glass backdrop-blur-lg rounded-[50px] border border-white/20"
        >
          <Clock className={`w-4 h-4 ${timeLeft <= 5 ? 'text-[#EF4444]' : 'text-[#091A7A]'}`} />
          <span className={`text-small font-medium ${timeLeft <= 5 ? 'text-[#EF4444]' : 'text-[#091A7A]'}`}>{timeLeft}s</span>
        </motion.div>
      </div>

      {/* Progress */}
      <div className="mb-8">
        <div className="flex justify-between text-small text-[#6B7280] mb-3">
          <span>Question {currentQuestion + 1} of {quizQuestions.length}</span>
          <span className="font-medium text-[#091A7A]">{Math.round((currentQuestion / quizQuestions.length) * 100)}%</span>
        </div>
        <div className="h-3 bg-white/40 rounded-[50px] overflow-hidden border border-white/20">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${((currentQuestion + 1) / quizQuestions.length) * 100}%` }}
            className="h-full bg-gradient-to-r from-[#091A7A] to-[#3B82F6] rounded-[50px]"
          />
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 space-y-6">
        <motion.div
          key={currentQuestion}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="p-6 bg-white/80 backdrop-blur-sm rounded-3xl border border-white/60 shadow-lg"
        >
          <h2 className="text-xl font-bold text-[#091A7A] mb-6">{question.question}</h2>
          
          <div className="space-y-3">
            {question.options.map((option, index) => (
              <motion.button
                key={index}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => handleAnswerSelect(index)}
                className={`w-full p-4 text-left rounded-2xl border-2 transition-all ${
                  selectedAnswer === index
                    ? showResult
                      ? index === question.correctAnswer
                        ? 'bg-green-100 border-green-300 text-green-800'
                        : 'bg-red-100 border-red-300 text-red-800'
                      : 'bg-[#ADC8FF]/30 border-[#091A7A] text-[#091A7A]'
                    : showResult && index === question.correctAnswer
                      ? 'bg-green-100 border-green-300 text-green-800'
                      : 'bg-white/60 border-white/40 text-[#091A7A] hover:bg-[#ADC8FF]/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{option}</span>
                  {showResult && (
                    <>
                      {index === question.correctAnswer && (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      )}
                      {selectedAnswer === index && index !== question.correctAnswer && (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                    </>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Action Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={showResult ? handleNextQuestion : handleSubmitAnswer}
          disabled={selectedAnswer === null && !showResult}
          className={`w-full py-4 font-semibold rounded-full shadow-lg transition-all text-center ${
            selectedAnswer === null && !showResult
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-[#091A7A] to-[#1a2b8a] text-white'
          }`}
        >
          {showResult 
            ? currentQuestion < quizQuestions.length - 1 
              ? 'Next Question' 
              : 'Finish Quiz'
            : 'Submit Answer'
          }
        </motion.button>
      </div>
    </div>
  );
}