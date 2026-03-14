import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Send, Bot, User, Lightbulb, BookOpen, Calculator, Atom, Sparkles } from 'lucide-react';

interface AITutorScreenProps {
  onBack: () => void;
}

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  suggestedQuestions?: string[];
}

const suggestedTopics = [
  { icon: Calculator, text: "Help me with algebra problems", category: "Math" },
  { icon: Atom, text: "Explain how atoms work", category: "Science" },
  { icon: BookOpen, text: "Grammar and writing tips", category: "English" },
  { icon: Lightbulb, text: "Better study techniques", category: "Study Tips" }
];

export function AITutorScreen({ onBack }: AITutorScreenProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hello! I'm your AI learning assistant. I'm here to help you with any subject - math, science, english, history, or study strategies. What would you like to explore today?",
      isUser: false,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate realistic AI response delay
    const responseDelay = Math.random() * 1500 + 1000; // 1-2.5 seconds
    
    setTimeout(() => {
      const { response, followUpQuestions } = getSmartAIResponse(inputValue);
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: response,
        isUser: false,
        timestamp: new Date(),
        suggestedQuestions: followUpQuestions
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsTyping(false);
    }, responseDelay);
  };

  const getSmartAIResponse = (userInput: string): { response: string; followUpQuestions: string[] } => {
    const input = userInput.toLowerCase();
    
    // Math responses
    if (input.includes('math') || input.includes('algebra') || input.includes('equation') || input.includes('solve') || input.includes('calculus') || input.includes('geometry')) {
      const mathResponses = [
        "I'd love to help with math! For algebra, think of equations like balanced scales - whatever you do to one side, do to the other. Math is all about patterns and logical thinking.",
        "Math can be challenging but rewarding! Let's break it down step by step. Remember: every problem has a solution, and practice builds confidence.",
        "Great choice! Math builds logical thinking and problem-solving skills. The key is understanding the 'why' behind each step, not just memorizing formulas."
      ];
      const mathQuestions = [
        "Show me a step-by-step algebra solution",
        "Explain fractions with real examples",
        "How do I tackle word problems?",
        "What are some math study tips?",
        "Help with geometry concepts"
      ];
      return {
        response: mathResponses[Math.floor(Math.random() * mathResponses.length)],
        followUpQuestions: mathQuestions.slice(0, 3)
      };
    }
    
    // Science responses
    if (input.includes('science') || input.includes('atom') || input.includes('chemistry') || input.includes('physics') || input.includes('biology') || input.includes('molecule')) {
      const scienceResponses = [
        "Science is amazing! 🔬 The natural world is full of fascinating patterns. From atoms to ecosystems, everything connects in beautiful ways. Science teaches us to observe, question, and discover.",
        "I love science questions! Science helps us understand how our world works - from the tiniest particles to the vastness of space. It's all about curiosity and exploration!",
        "Science is the art of discovery! Remember the scientific method: observe, hypothesize, experiment, analyze, conclude. Every great discovery started with a question."
      ];
      const scienceQuestions = [
        "How do atoms form molecules?",
        "Explain photosynthesis simply",
        "What makes planets orbit the sun?",
        "How does DNA work?",
        "Why do chemical reactions happen?"
      ];
      return {
        response: scienceResponses[Math.floor(Math.random() * scienceResponses.length)],
        followUpQuestions: scienceQuestions.slice(0, 3)
      };
    }
    
    // English/Language responses
    if (input.includes('english') || input.includes('grammar') || input.includes('writing') || input.includes('essay') || input.includes('literature')) {
      const englishResponses = [
        "English is the art of communication! 📝 Good writing starts with clear thinking. Whether it's grammar, essays, or creative writing, language is your tool for sharing ideas with the world.",
        "Language is powerful! Great writing combines clear structure with engaging content. Remember: write for your reader, revise ruthlessly, and read everything aloud.",
        "Grammar can be tricky, but it's the foundation of clear communication. Think of grammar rules as tools that help your ideas shine, not barriers to creativity!"
      ];
      const englishQuestions = [
        "How to write strong paragraphs?",
        "Fix my grammar mistakes",
        "Make my writing more engaging",
        "Understand literary themes",
        "Improve my vocabulary"
      ];
      return {
        response: englishResponses[Math.floor(Math.random() * englishResponses.length)],
        followUpQuestions: englishQuestions.slice(0, 3)
      };
    }
    
    // Study techniques
    if (input.includes('study') || input.includes('technique') || input.includes('learn') || input.includes('memory') || input.includes('focus') || input.includes('concentration')) {
      const studyResponses = [
        "Smart studying beats hard studying every time! 🧠 The best techniques: Pomodoro (25 min focus, 5 min break), active recall (test yourself), and spaced repetition (review over time).",
        "Great question! Effective learning happens when you engage multiple senses and make connections. Try teaching concepts to others - if you can explain it, you understand it!",
        "Learning how to learn is the most valuable skill! Focus on understanding over memorization, take regular breaks, and connect new information to what you already know."
      ];
      const studyQuestions = [
        "What's the Pomodoro Technique?",
        "How to improve memory retention?",
        "Best ways to take notes?",
        "Overcome procrastination tips",
        "Create effective study schedules"
      ];
      return {
        response: studyResponses[Math.floor(Math.random() * studyResponses.length)],
        followUpQuestions: studyQuestions.slice(0, 3)
      };
    }
    
    // History responses
    if (input.includes('history') || input.includes('historical') || input.includes('past') || input.includes('civilization') || input.includes('war') || input.includes('ancient')) {
      const response = "History helps us understand the present! 📚 Every event connects to others in fascinating ways. History isn't just dates and names - it's the story of human choices, consequences, and progress.";
      const historyQuestions = [
        "How did ancient civilizations develop?",
        "Why do historical patterns repeat?",
        "What caused major world wars?",
        "How to remember historical dates?",
        "Connect history to current events"
      ];
      return {
        response,
        followUpQuestions: historyQuestions.slice(0, 3)
      };
    }
    
    // Social Studies
    if (input.includes('social') || input.includes('geography') || input.includes('culture') || input.includes('government') || input.includes('economics')) {
      const response = "Social studies explores how people and societies work! 🌍 From geography to cultures to government systems - it's all about understanding human relationships and our shared world.";
      const socialQuestions = [
        "How do governments work?",
        "What shapes different cultures?",
        "Explain supply and demand",
        "How geography affects society",
        "Understanding world religions"
      ];
      return {
        response,
        followUpQuestions: socialQuestions.slice(0, 3)
      };
    }
    
    // Homework help
    if (input.includes('homework') || input.includes('assignment') || input.includes('project')) {
      const response = "I'm here to guide you through your homework! 📖 Remember, the goal is learning and understanding, not just getting answers. Let's break down your assignment step by step.";
      const homeworkQuestions = [
        "How to start a research project?",
        "Break down complex assignments",
        "Time management for homework",
        "When to ask for help?",
        "Make homework less stressful"
      ];
      return {
        response,
        followUpQuestions: homeworkQuestions.slice(0, 3)
      };
    }
    
    // Test/exam preparation
    if (input.includes('test') || input.includes('exam') || input.includes('quiz') || input.includes('preparation')) {
      const response = "Test prep is all about strategy! 📝 Focus on understanding concepts deeply, practice with variety, manage your time well, and take care of your physical and mental health.";
      const testQuestions = [
        "Create effective study guides",
        "Manage test anxiety",
        "Best review strategies",
        "Time management during exams",
        "What to do the night before?"
      ];
      return {
        response,
        followUpQuestions: testQuestions.slice(0, 3)
      };
    }
    
    // General/default responses
    const generalResponses = [
      "That's a thoughtful question! I'd love to help you explore that topic further. Learning is most effective when we're genuinely curious and engaged.",
      "Interesting! Learning is all about curiosity, and you're asking great questions. The best discoveries often start with wondering 'what if' or 'why does this happen?'",
      "I'm excited to help you learn! 🌟 Every question is a step toward deeper understanding. Knowledge builds on itself - each thing you learn makes the next thing easier.",
      "Great question! The best learning happens when we're genuinely curious. Remember: there are no silly questions, only opportunities to grow your understanding!"
    ];
    
    const generalQuestions = [
      "How to become a better learner?",
      "What study method works best?",
      "How to stay motivated to learn?",
      "Connect topics across subjects",
      "Build critical thinking skills"
    ];
    
    return {
      response: generalResponses[Math.floor(Math.random() * generalResponses.length)],
      followUpQuestions: generalQuestions.slice(0, 3)
    };
  };

  const handleTopicClick = (topic: string) => {
    setInputValue(topic);
  };

  const TypingIndicator = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex justify-start"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#ADC8FF] to-[#6B8FFF] flex items-center justify-center">
          <Bot className="w-4 h-4 text-[#091A7A]" />
        </div>
        <div className="bg-white/80 border border-white/60 rounded-2xl rounded-tl-md p-4">
          <div className="flex space-x-1">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0 }}
              className="w-2 h-2 bg-[#091A7A]/60 rounded-full"
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
              className="w-2 h-2 bg-[#091A7A]/60 rounded-full"
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
              className="w-2 h-2 bg-[#091A7A]/60 rounded-full"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-[#ADC8FF]/10 to-white/95">
      {/* Header */}
      <div className="relative overflow-hidden">
        {/* Ambient Background Layers */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#ADC8FF]/20 via-white/95 to-[#6B8FFF]/15" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/40 to-white/60" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        
        {/* Main Header Content */}
        <div className="flex items-center justify-between p-5 backdrop-blur-xl border-b border-white/20">
          {/* Back Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onBack}
            className="w-11 h-11 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg border border-white/40"
          >
            <ArrowLeft className="w-5 h-5 text-[#091A7A]" />
          </motion.button>
          
          {/* Center - AI Info */}
          <div className="flex items-center gap-3">
            {/* AI Avatar */}
            <div className="relative w-12 h-12 bg-gradient-to-br from-[#ADC8FF] to-[#6B8FFF] rounded-2xl flex items-center justify-center shadow-lg">
              <Bot className="w-6 h-6 text-[#091A7A]" />
              <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white" />
            </div>
            
            {/* Title */}
            <div className="text-center">
              <h1 className="text-xl font-semibold text-[#091A7A]">AI Tutor</h1>
              <p className="text-xs text-[#091A7A]/60">Online • Ready to help</p>
            </div>
          </div>
          
          {/* Right Side - Sparkles Icon */}
          <div className="w-11 h-11 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-[#ADC8FF]" />
          </div>
        </div>
        
        {/* Bottom accent line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#ADC8FF]/30 to-transparent" />
      </div>

      {/* Suggested Topics - Only show at start */}
      <AnimatePresence>
        {messages.length === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-6 space-y-4"
          >
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-[#091A7A]/70">Quick start topics:</p>
              <p className="text-xs text-[#091A7A]/50">Tap any topic below or ask me anything!</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {suggestedTopics.map((topic, index) => (
                <motion.button
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleTopicClick(topic.text)}
                  className="p-3 bg-card-glass backdrop-blur-sm rounded-2xl border border-white/20 shadow-card hover:shadow-interactive transition-all duration-300 flex flex-col items-center justify-center text-center group"
                >
                  <topic.icon className="w-5 h-5 mb-2 text-[#091A7A] group-hover:scale-110 transition-transform" />
                  <p className="text-xs font-medium text-[#091A7A] mb-1">{topic.text}</p>
                  <span className="text-xs text-[#091A7A]/50 bg-[#ADC8FF]/20 px-2 py-0.5 rounded-full">
                    {topic.category}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
        {messages.map((message, index) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] ${message.isUser ? 'order-1' : 'order-2'}`}>
              <div className={`flex items-start gap-3 ${message.isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.isUser 
                    ? 'bg-[#091A7A]' 
                    : 'bg-gradient-to-br from-[#ADC8FF] to-[#6B8FFF]'
                }`}>
                  {message.isUser ? (
                    <User className="w-4 h-4 text-white" />
                  ) : (
                    <Bot className="w-4 h-4 text-[#091A7A]" />
                  )}
                </div>
                
                <div className={`p-4 rounded-2xl shadow-sm ${
                  message.isUser
                    ? 'bg-[#091A7A] text-white rounded-tr-md'
                    : 'bg-white/90 text-[#091A7A] rounded-tl-md border border-white/60'
                }`}>
                  <div className="text-sm leading-relaxed">{message.text}</div>
                  <div className={`text-xs mt-2 ${
                    message.isUser ? 'text-white/70' : 'text-[#091A7A]/50'
                  }`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  
                  {/* Suggested Questions */}
                  {!message.isUser && message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-xs text-[#091A7A]/60 mb-2">💡 You might also ask:</div>
                      <div className="flex flex-wrap gap-2">
                        {message.suggestedQuestions.map((question, qIndex) => (
                          <motion.button
                            key={qIndex}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: qIndex * 0.1 }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setInputValue(question)}
                            className="px-3 py-2 bg-[#ADC8FF]/20 hover:bg-[#ADC8FF]/30 border border-[#ADC8FF]/40 rounded-full text-xs text-[#091A7A] transition-all duration-200 hover:shadow-sm"
                          >
                            {question}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
        
        <AnimatePresence>
          {isTyping && <TypingIndicator />}
        </AnimatePresence>
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-6 bg-white/90 backdrop-blur-sm border-t border-white/30">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder="Ask me anything about your studies..."
              className="w-full p-4 pr-12 bg-white/90 border-2 border-[#ADC8FF]/60 rounded-2xl text-[#091A7A] placeholder-[#091A7A]/75 focus:outline-none focus:ring-2 focus:ring-[#ADC8FF] focus:border-[#ADC8FF] focus:placeholder-[#091A7A]/60 transition-all duration-200 resize-none"
              disabled={isTyping}
            />
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isTyping}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-200 ${
              inputValue.trim() && !isTyping
                ? 'bg-gradient-to-br from-[#091A7A] to-[#1a2b8a] text-white hover:shadow-xl'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Send className="w-5 h-5" />
          </motion.button>
        </div>
        <p className="text-xs text-[#091A7A]/40 mt-2 text-center">
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}