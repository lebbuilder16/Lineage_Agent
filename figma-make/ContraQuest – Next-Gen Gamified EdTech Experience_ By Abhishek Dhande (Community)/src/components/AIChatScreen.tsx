import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Send, Brain, User, ShieldAlert, Hexagon, Activity, Sparkles } from 'lucide-react';

interface AIChatScreenProps {
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
  { icon: Hexagon, text: "Analyze a token address", category: "Audit" },
  { icon: ShieldAlert, text: "Latest rug pull patterns", category: "Intel" },
  { icon: Activity, text: "Explain the Death Clock", category: "Education" },
  { icon: Sparkles, text: "Find trending tokens", category: "Discovery" }
];

export function AIChatScreen({ onBack }: AIChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Lineage Agent initialized. I am your on-chain intelligence node. I can audit tokens, track deployer lineage, and detect rug pull patterns. What do you want to investigate?",
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

    const responseDelay = Math.random() * 1500 + 1000; 
    
    setTimeout(() => {
      const { response, followUpQuestions } = getAgentResponse(inputValue);
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

  const getAgentResponse = (userInput: string): { response: string; followUpQuestions: string[] } => {
    const input = userInput.toLowerCase();
    
    if (input.includes('analyze') || input.includes('token') || input.includes('audit') || input.includes('address')) {
      return {
        response: "I'm scanning the mempool for that pattern. To run a full audit, please provide the exact Solana contract address. I'll check liquidity locks, deployer history, and associated wallet clusters.",
        followUpQuestions: [
          "Check deployer's previous tokens",
          "What is the current liquidity?",
          "Run a Death Clock simulation"
        ]
      };
    }
    
    if (input.includes('rug') || input.includes('scam') || input.includes('pattern') || input.includes('warning')) {
      return {
        response: "Currently, the most common rug pattern is the 'Zombie Deployer': an established wallet that launches a clean token, builds trust, and then uses secondary funded wallets to drain liquidity across multiple smaller transactions.",
        followUpQuestions: [
          "How to detect Zombie Deployers?",
          "Show me recent flagged tokens",
          "What is bundle dumping?"
        ]
      };
    }

    if (input.includes('death clock') || input.includes('crash') || input.includes('probability')) {
      return {
        response: "The Death Clock is our proprietary neural engine. It compares real-time token metrics (liquidity flow, holder distribution velocity, social sentiment) against thousands of historical rugs to calculate an imminent crash probability.",
        followUpQuestions: [
          "Tokens with >90% crash risk",
          "How accurate is the Death Clock?",
          "Alert me on critical risks"
        ]
      };
    }
    
    return {
        response: "Processing query. My neural pathways are optimized for Solana network intelligence. I can analyze specific contracts, explain security concepts, or alert you to active network threats.",
        followUpQuestions: [
          "Explain bundle detected alert",
          "How do you trace wallets?",
          "Scan a new token"
        ]
    };
  };

  const TypingIndicator = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex justify-start mb-4"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center border border-secondary/30">
          <Brain className="w-4 h-4 text-secondary" />
        </div>
        <div className="bg-glass rounded-[var(--radius-standard)] rounded-tl-sm p-4">
          <div className="flex space-x-1.5">
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0 }}
              className="w-1.5 h-1.5 bg-secondary rounded-full shadow-glow"
            />
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
              className="w-1.5 h-1.5 bg-secondary rounded-full shadow-glow"
            />
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
              className="w-1.5 h-1.5 bg-secondary rounded-full shadow-glow"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen flex flex-col relative bg-background">
      {/* Aurora Ambient Background */}
      <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/20 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 left-0 w-[250px] h-[250px] bg-secondary/10 blur-[100px] rounded-full pointer-events-none" />
      
      {/* Header */}
      <div className="pt-12 pb-4 px-6 flex items-center gap-4 relative z-10 border-b border-white/5 bg-background/50 backdrop-blur-xl">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="w-10 h-10 bg-glass rounded-full flex items-center justify-center border border-white/10"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </motion.button>
        
        <div className="flex items-center gap-3 flex-1">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center border border-secondary/30">
              <Brain className="w-5 h-5 text-secondary" />
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-success rounded-full border-2 border-background shadow-[0_0_8px_var(--color-success)]" />
          </div>
          <div>
            <h1 className="text-subheading text-white leading-tight">Agent Alpha</h1>
            <p className="text-[10px] text-success font-medium uppercase tracking-widest mt-0.5">Neural Core Online</p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide relative z-10 flex flex-col">
        {/* Suggested Topics */}
        <AnimatePresence>
          {messages.length === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, height: 0, marginTop: 0, marginBottom: 0 }}
              className="mb-8"
            >
              <p className="text-tiny text-white/50 text-center mb-4 uppercase tracking-widest font-semibold">
                Suggested Directives
              </p>
              <div className="grid grid-cols-2 gap-2">
                {suggestedTopics.map((topic, index) => (
                  <motion.button
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setInputValue(topic.text)}
                    className="p-3 bg-glass border border-white/5 rounded-[var(--radius-standard)] flex flex-col items-center justify-center text-center gap-2 group"
                  >
                    <topic.icon className="w-5 h-5 text-secondary group-active:scale-90 transition-transform" />
                    <p className="text-[11px] text-white/80 font-medium leading-tight">{topic.text}</p>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {messages.map((message, index) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex mb-6 ${message.isUser ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] flex items-end gap-2 ${message.isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mb-1 ${
                message.isUser ? 'bg-primary border border-primary' : 'bg-secondary/20 border border-secondary/30'
              }`}>
                {message.isUser ? (
                  <User className="w-3 h-3 text-white" />
                ) : (
                  <Brain className="w-3 h-3 text-secondary" />
                )}
              </div>
              
              <div className={`p-4 rounded-[var(--radius-standard)] text-[13px] leading-relaxed ${
                message.isUser
                  ? 'bg-primary text-white rounded-br-sm shadow-lg'
                  : 'bg-glass border border-white/5 text-white/90 rounded-bl-sm'
              }`}>
                {message.text}
                
                {/* Suggestions */}
                {!message.isUser && message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
                    {message.suggestedQuestions.map((q, i) => (
                      <motion.button
                        key={i}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setInputValue(q)}
                        className="block w-full text-left p-2 rounded-lg bg-white/5 active:bg-white/10 text-secondary text-[11px] transition-colors border border-white/5"
                      >
                        {q}
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
        
        <AnimatePresence>
          {isTyping && <TypingIndicator />}
        </AnimatePresence>
        
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-background/80 backdrop-blur-xl border-t border-white/5 relative z-20 pb-8">
        <div className="flex items-center gap-2 bg-glass border border-white/10 rounded-full p-1 pl-4">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Query the intel node..."
            className="flex-1 bg-transparent border-none text-white text-body placeholder:text-white/30 focus:outline-none"
            disabled={isTyping}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isTyping}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              inputValue.trim() && !isTyping
                ? 'bg-secondary text-primary'
                : 'bg-white/5 text-white/20'
            }`}
          >
            <Send className="w-4 h-4 ml-0.5" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}