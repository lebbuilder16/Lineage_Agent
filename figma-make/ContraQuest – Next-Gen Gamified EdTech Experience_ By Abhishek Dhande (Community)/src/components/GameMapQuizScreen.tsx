import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Target, 
  BookOpen, 
  Puzzle, 
  Key, 
  Trophy, 
  Flame, 
  Star,
  CheckCircle,
  Circle,
  Sparkles
} from 'lucide-react';
import { QuizStatusUpdate } from './QuizStatusUpdate';

interface GameMapQuizScreenProps {
  onBack: () => void;
  onXPGain: (points: number) => void;
  onStreakIncrease: () => void;
  userXP: number;
  streakCount: number;
  selectedSubject?: {
    id: string;
    name: string;
    description: string;
    progress: number;
    icon: React.ReactNode;
    color: string;
  };
  onQuizCompletion: (data: {
    xpGained: number;
    completionTime: string;
    accuracy: number;
    totalQuestions: number;
    correctAnswers: number;
    stageName: string;
  }) => void;
}

interface Stage {
  id: number;
  title: string;
  icon: React.ReactNode;
  status: 'locked' | 'current' | 'completed';
  xpReward: number;
}

interface Question {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

// Subject-specific question sets
const subjectQuestions: Record<string, Record<number, Question[]>> = {
  math: {
  1: [
    {
      id: 1,
      question: "What is 15 + 27?",
      options: ["32", "42", "52", "62"],
      correctAnswer: 1,
      explanation: "15 + 27 = 42. When adding, line up the digits and add column by column."
    },
    {
      id: 2,
      question: "What is 8 × 7?",
      options: ["54", "56", "58", "64"],
      correctAnswer: 1,
      explanation: "8 × 7 = 56. This is a basic multiplication fact to memorize."
    },
    {
      id: 3,
      question: "What is 144 ÷ 12?",
      options: ["10", "11", "12", "13"],
      correctAnswer: 2,
      explanation: "144 ÷ 12 = 12. You can think of this as 'how many 12s make 144?'"
    },
    {
      id: 4,
      question: "What is 25% of 80?",
      options: ["15", "20", "25", "30"],
      correctAnswer: 1,
      explanation: "25% of 80 = 0.25 × 80 = 20. 25% is the same as 1/4."
    },
    {
      id: 5,
      question: "What is the area of a rectangle with length 6 and width 4?",
      options: ["20", "22", "24", "26"],
      correctAnswer: 2,
      explanation: "Area = length × width = 6 × 4 = 24 square units."
    }
  ],
  2: [
    {
      id: 1,
      question: "What is the square root of 64?",
      options: ["6", "7", "8", "9"],
      correctAnswer: 2,
      explanation: "√64 = 8, because 8 × 8 = 64."
    },
    {
      id: 2,
      question: "What is 2³?",
      options: ["6", "8", "9", "12"],
      correctAnswer: 1,
      explanation: "2³ = 2 × 2 × 2 = 8."
    },
    {
      id: 3,
      question: "What is the value of x in: 3x + 5 = 14?",
      options: ["2", "3", "4", "5"],
      correctAnswer: 1,
      explanation: "3x + 5 = 14, so 3x = 9, therefore x = 3."
    },
    {
      id: 4,
      question: "What is 45% of 200?",
      options: ["80", "85", "90", "95"],
      correctAnswer: 2,
      explanation: "45% of 200 = 0.45 × 200 = 90."
    },
    {
      id: 5,
      question: "What is the circumference of a circle with radius 5? (Use π ≈ 3.14)",
      options: ["31.4", "31.8", "32.2", "32.6"],
      correctAnswer: 0,
      explanation: "Circumference = 2πr = 2 × 3.14 × 5 = 31.4."
    }
  ],
  3: [
    {
      id: 1,
      question: "What is the derivative of x²?",
      options: ["x", "2x", "x²", "2x²"],
      correctAnswer: 1,
      explanation: "The derivative of x² is 2x using the power rule."
    },
    {
      id: 2,
      question: "What is sin(30°)?",
      options: ["0.5", "0.707", "0.866", "1"],
      correctAnswer: 0,
      explanation: "sin(30°) = 1/2 = 0.5."
    },
    {
      id: 3,
      question: "What is log₁₀(100)?",
      options: ["1", "2", "10", "100"],
      correctAnswer: 1,
      explanation: "log₁₀(100) = 2, because 10² = 100."
    },
    {
      id: 4,
      question: "What is the slope of the line y = 3x + 2?",
      options: ["2", "3", "5", "6"],
      correctAnswer: 1,
      explanation: "In the form y = mx + b, the slope is m = 3."
    },
    {
      id: 5,
      question: "What is ∫2x dx?",
      options: ["x²", "x² + C", "2x²", "2x² + C"],
      correctAnswer: 1,
      explanation: "∫2x dx = x² + C, where C is the constant of integration."
    }
  ],
  4: [
    {
      id: 1,
      question: "What is the limit of (x² - 1)/(x - 1) as x approaches 1?",
      options: ["0", "1", "2", "undefined"],
      correctAnswer: 2,
      explanation: "Factor: (x-1)(x+1)/(x-1) = x+1. As x→1, limit = 2."
    },
    {
      id: 2,
      question: "What is the second derivative of x³?",
      options: ["3x²", "6x", "6", "3x"],
      correctAnswer: 1,
      explanation: "First derivative: 3x², second derivative: 6x."
    },
    {
      id: 3,
      question: "What is cos(π/2)?",
      options: ["0", "1", "-1", "0.5"],
      correctAnswer: 0,
      explanation: "cos(π/2) = cos(90°) = 0."
    },
    {
      id: 4,
      question: "What is the area under y = x from 0 to 2?",
      options: ["1", "2", "3", "4"],
      correctAnswer: 1,
      explanation: "∫₀² x dx = [x²/2]₀² = 4/2 - 0 = 2."
    },
    {
      id: 5,
      question: "What is e^(ln(5))?",
      options: ["1", "e", "5", "ln(5)"],
      correctAnswer: 2,
      explanation: "e^(ln(x)) = x, so e^(ln(5)) = 5."
    }
  ],
  5: [
    {
      id: 1,
      question: "What is the divergence of vector field F = (x, y, z)?",
      options: ["1", "2", "3", "0"],
      correctAnswer: 2,
      explanation: "∇·F = ∂x/∂x + ∂y/∂y + ∂z/∂z = 1 + 1 + 1 = 3."
    },
    {
      id: 2,
      question: "What is the eigenvalue of matrix [[2,0],[0,3]] for eigenvector [1,0]?",
      options: ["0", "1", "2", "3"],
      correctAnswer: 2,
      explanation: "For eigenvector [1,0], A[1,0] = [2,0] = 2[1,0], so λ = 2."
    },
    {
      id: 3,
      question: "What is ∬ᴿ xy dA over region R: 0≤x≤1, 0≤y≤1?",
      options: ["1/2", "1/3", "1/4", "1"],
      correctAnswer: 2,
      explanation: "∫₀¹∫₀¹ xy dy dx = ∫₀¹ x[y²/2]₀¹ dx = ∫₀¹ x/2 dx = 1/4."
    },
    {
      id: 4,
      question: "What is the Fourier series coefficient a₀ for f(x) = 1 on [-π,π]?",
      options: ["0", "1", "2", "π"],
      correctAnswer: 1,
      explanation: "a₀ = (1/π)∫₋π^π 1 dx = (1/π)[x]₋π^π = 2π/π = 2, but a₀/2 = 1."
    },
    {
      id: 5,
      question: "What is the solution to the differential equation dy/dx = y?",
      options: ["y = x", "y = x²", "y = eˣ", "y = Ce^x"],
      correctAnswer: 3,
      explanation: "The general solution to dy/dx = y is y = Ce^x."
    }
  ]
  },
  english: {
    1: [
      {
        id: 1,
        question: "Which sentence is grammatically correct?",
        options: ["Me and John went to the store", "John and I went to the store", "John and me went to the store", "I and John went to the store"],
        correctAnswer: 1,
        explanation: "'John and I' is correct because 'I' is the subject pronoun used when you and another person are doing something."
      },
      {
        id: 2,
        question: "What is the past tense of 'run'?",
        options: ["runned", "ran", "running", "runs"],
        correctAnswer: 1,
        explanation: "The past tense of 'run' is 'ran'. 'Run' is an irregular verb."
      },
      {
        id: 3,
        question: "Which word is a synonym for 'happy'?",
        options: ["sad", "joyful", "angry", "tired"],
        correctAnswer: 1,
        explanation: "'Joyful' means the same as happy - both express a feeling of joy or contentment."
      },
      {
        id: 4,
        question: "What type of word is 'quickly' in the sentence 'She ran quickly'?",
        options: ["noun", "verb", "adjective", "adverb"],
        correctAnswer: 3,
        explanation: "'Quickly' is an adverb because it describes how the action (ran) was performed."
      },
      {
        id: 5,
        question: "Which sentence uses correct capitalization?",
        options: ["i love reading Books", "I love reading books", "I Love Reading Books", "i Love reading books"],
        correctAnswer: 1,
        explanation: "The pronoun 'I' should always be capitalized, but common nouns like 'books' should not be capitalized unless they start a sentence."
      }
    ],
    2: [
      {
        id: 1,
        question: "What is the main idea of a paragraph?",
        options: ["The first sentence", "The most important point", "The longest sentence", "The last sentence"],
        correctAnswer: 1,
        explanation: "The main idea is the most important point or central message that the paragraph is trying to convey."
      },
      {
        id: 2,
        question: "Which punctuation mark is used to show possession?",
        options: ["comma", "period", "apostrophe", "semicolon"],
        correctAnswer: 2,
        explanation: "An apostrophe (') is used to show possession, like in 'Sarah's book' or 'the dog's tail'."
      },
      {
        id: 3,
        question: "What is a metaphor?",
        options: ["A comparison using 'like' or 'as'", "A direct comparison without 'like' or 'as'", "A question that doesn't need an answer", "A repeated sound"],
        correctAnswer: 1,
        explanation: "A metaphor is a direct comparison between two things without using 'like' or 'as', such as 'Life is a journey'."
      },
      {
        id: 4,
        question: "Which is an example of alliteration?",
        options: ["The cat sat on the mat", "Peter Piper picked peppers", "She is as brave as a lion", "What time is it?"],
        correctAnswer: 1,
        explanation: "Alliteration is the repetition of the same sound at the beginning of words, like 'Peter Piper picked peppers'."
      },
      {
        id: 5,
        question: "What is the subject in the sentence 'The red car drove quickly'?",
        options: ["red", "car", "drove", "quickly"],
        correctAnswer: 1,
        explanation: "The subject is 'car' - it's what the sentence is about. 'The red car' is the complete subject, but 'car' is the simple subject."
      }
    ],
    3: [
      {
        id: 1,
        question: "What is the difference between 'there', 'their', and 'they're'?",
        options: ["They all mean the same thing", "'There' is a place, 'their' shows ownership, 'they're' means 'they are'", "Only 'there' is correct", "'Their' is always wrong"],
        correctAnswer: 1,
        explanation: "'There' refers to a place, 'their' shows possession (belonging to them), and 'they're' is a contraction of 'they are'."
      },
      {
        id: 2,
        question: "What is a thesis statement?",
        options: ["The first sentence of an essay", "The main argument or point of an essay", "The conclusion", "A question"],
        correctAnswer: 1,
        explanation: "A thesis statement is the main argument or central point that an essay will prove or discuss."
      },
      {
        id: 3,
        question: "Which sentence uses parallel structure?",
        options: ["I like reading, writing, and to swim", "I like reading, writing, and swimming", "I like to read, writing, and swim", "I like read, write, and swimming"],
        correctAnswer: 1,
        explanation: "Parallel structure uses the same grammatical form for items in a series. 'Reading, writing, and swimming' are all gerunds (-ing forms)."
      },
      {
        id: 4,
        question: "What is the purpose of a topic sentence?",
        options: ["To end a paragraph", "To introduce the main idea of a paragraph", "To provide evidence", "To ask a question"],
        correctAnswer: 1,
        explanation: "A topic sentence introduces the main idea of a paragraph and usually appears at the beginning."
      },
      {
        id: 5,
        question: "Which is an example of personification?",
        options: ["The wind whispered through the trees", "He is as tall as a tree", "The tree is green", "Trees grow in forests"],
        correctAnswer: 0,
        explanation: "Personification gives human qualities to non-human things. 'The wind whispered' gives the wind the human ability to whisper."
      }
    ],
    4: [
      {
        id: 1,
        question: "What is the difference between active and passive voice?",
        options: ["There is no difference", "Active voice emphasizes the doer, passive voice emphasizes the action", "Passive voice is always wrong", "Active voice uses more words"],
        correctAnswer: 1,
        explanation: "Active voice emphasizes who does the action ('John wrote the letter'), while passive voice emphasizes what was done ('The letter was written by John')."
      },
      {
        id: 2,
        question: "What is a complex sentence?",
        options: ["A long sentence", "A sentence with one independent clause and at least one dependent clause", "A sentence with two independent clauses", "A confusing sentence"],
        correctAnswer: 1,
        explanation: "A complex sentence contains one independent clause (complete thought) and at least one dependent clause (incomplete thought that depends on the main clause)."
      },
      {
        id: 3,
        question: "Which transition word shows contrast?",
        options: ["furthermore", "however", "therefore", "similarly"],
        correctAnswer: 1,
        explanation: "'However' is a transition word that shows contrast or opposition between ideas."
      },
      {
        id: 4,
        question: "What is the mood of a text?",
        options: ["The author's attitude", "The emotional atmosphere", "The main character's feelings", "The time of day"],
        correctAnswer: 1,
        explanation: "Mood is the emotional atmosphere or feeling that the reader gets from a text."
      },
      {
        id: 5,
        question: "Which is an example of dramatic irony?",
        options: ["A character says the opposite of what they mean", "The audience knows something a character doesn't", "A coincidence happens", "The ending is surprising"],
        correctAnswer: 1,
        explanation: "Dramatic irony occurs when the audience knows something that a character in the story does not know."
      }
    ],
    5: [
      {
        id: 1,
        question: "What is the difference between denotation and connotation?",
        options: ["They are the same", "Denotation is literal meaning, connotation is implied meaning", "Connotation is always negative", "Denotation is outdated"],
        correctAnswer: 1,
        explanation: "Denotation is the literal, dictionary definition of a word, while connotation is the emotional or cultural associations we have with that word."
      },
      {
        id: 2,
        question: "What is stream of consciousness in literature?",
        options: ["A type of poem", "A narrative technique showing continuous thoughts", "A writing error", "A type of essay"],
        correctAnswer: 1,
        explanation: "Stream of consciousness is a narrative technique that presents the continuous flow of a character's thoughts and feelings."
      },
      {
        id: 3,
        question: "What is the function of a semicolon?",
        options: ["To end a sentence", "To join two related independent clauses", "To show possession", "To indicate a pause"],
        correctAnswer: 1,
        explanation: "A semicolon joins two closely related independent clauses that could stand alone as separate sentences."
      },
      {
        id: 4,
        question: "What is epistolary writing?",
        options: ["Religious writing", "Writing in the form of letters or documents", "Poetry writing", "Scientific writing"],
        correctAnswer: 1,
        explanation: "Epistolary writing is composed of documents such as letters, diary entries, or other forms of correspondence."
      },
      {
        id: 5,
        question: "What is zeugma in rhetoric?",
        options: ["A type of rhyme", "Using one word to modify two others in different senses", "A writing mistake", "A type of metaphor"],
        correctAnswer: 1,
        explanation: "Zeugma is a rhetorical device where one word is used to modify two others in different senses, like 'He broke his vow and his mother's heart'."
      }
    ]
  },
  science: {
    1: [
      {
        id: 1,
        question: "What is the basic unit of life?",
        options: ["Atom", "Molecule", "Cell", "Organ"],
        correctAnswer: 2,
        explanation: "The cell is the basic unit of life. All living things are made up of one or more cells."
      },
      {
        id: 2,
        question: "What gas do plants absorb from the atmosphere during photosynthesis?",
        options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"],
        correctAnswer: 1,
        explanation: "Plants absorb carbon dioxide from the atmosphere and use it along with water and sunlight to produce glucose and oxygen."
      },
      {
        id: 3,
        question: "How many bones are in an adult human body?",
        options: ["206", "186", "226", "196"],
        correctAnswer: 0,
        explanation: "An adult human body has 206 bones. Babies are born with about 270 bones, but many fuse together as they grow."
      },
      {
        id: 4,
        question: "What is the chemical symbol for water?",
        options: ["H2O", "CO2", "O2", "NaCl"],
        correctAnswer: 0,
        explanation: "H2O is the chemical symbol for water, indicating it contains 2 hydrogen atoms and 1 oxygen atom."
      },
      {
        id: 5,
        question: "Which planet is closest to the Sun?",
        options: ["Venus", "Earth", "Mercury", "Mars"],
        correctAnswer: 2,
        explanation: "Mercury is the closest planet to the Sun in our solar system."
      }
    ],
    2: [
      {
        id: 1,
        question: "What is the process by which water changes from liquid to gas?",
        options: ["Condensation", "Evaporation", "Precipitation", "Freezing"],
        correctAnswer: 1,
        explanation: "Evaporation is the process where water changes from liquid to gas when heated."
      },
      {
        id: 2,
        question: "What type of energy is stored in food?",
        options: ["Kinetic energy", "Potential energy", "Chemical energy", "Thermal energy"],
        correctAnswer: 2,
        explanation: "Chemical energy is stored in the bonds of molecules in food and is released during digestion."
      },
      {
        id: 3,
        question: "What is the hardest natural substance on Earth?",
        options: ["Gold", "Iron", "Diamond", "Quartz"],
        correctAnswer: 2,
        explanation: "Diamond is the hardest natural substance on Earth, scoring 10 on the Mohs hardness scale."
      },
      {
        id: 4,
        question: "What organ in the human body produces insulin?",
        options: ["Liver", "Pancreas", "Kidney", "Heart"],
        correctAnswer: 1,
        explanation: "The pancreas produces insulin, which helps regulate blood sugar levels."
      },
      {
        id: 5,
        question: "What is the speed of light in a vacuum?",
        options: ["300,000 km/s", "150,000 km/s", "450,000 km/s", "600,000 km/s"],
        correctAnswer: 0,
        explanation: "The speed of light in a vacuum is approximately 300,000 kilometers per second (299,792,458 m/s to be exact)."
      }
    ],
    3: [
      {
        id: 1,
        question: "What is the powerhouse of the cell?",
        options: ["Nucleus", "Ribosome", "Mitochondria", "Chloroplast"],
        correctAnswer: 2,
        explanation: "Mitochondria are called the powerhouse of the cell because they produce ATP, the cell's main energy currency."
      },
      {
        id: 2,
        question: "What is the pH of pure water?",
        options: ["6", "7", "8", "9"],
        correctAnswer: 1,
        explanation: "Pure water has a pH of 7, which is neutral (neither acidic nor basic)."
      },
      {
        id: 3,
        question: "What law states that energy cannot be created or destroyed?",
        options: ["Newton's First Law", "Law of Conservation of Energy", "Einstein's Theory", "Boyle's Law"],
        correctAnswer: 1,
        explanation: "The Law of Conservation of Energy states that energy cannot be created or destroyed, only transformed from one form to another."
      },
      {
        id: 4,
        question: "What is the most abundant gas in Earth's atmosphere?",
        options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Argon"],
        correctAnswer: 2,
        explanation: "Nitrogen makes up about 78% of Earth's atmosphere, making it the most abundant gas."
      },
      {
        id: 5,
        question: "What is the process of cell division that produces gametes?",
        options: ["Mitosis", "Meiosis", "Binary fission", "Budding"],
        correctAnswer: 1,
        explanation: "Meiosis is the process of cell division that produces gametes (sex cells) with half the number of chromosomes."
      }
    ],
    4: [
      {
        id: 1,
        question: "What is the name of the theory that explains the origin of the universe?",
        options: ["Big Bang Theory", "Evolution Theory", "Relativity Theory", "Quantum Theory"],
        correctAnswer: 0,
        explanation: "The Big Bang Theory explains that the universe began from a very hot, dense point and has been expanding ever since."
      },
      {
        id: 2,
        question: "What is the study of heredity called?",
        options: ["Ecology", "Genetics", "Anatomy", "Physiology"],
        correctAnswer: 1,
        explanation: "Genetics is the branch of biology that studies heredity and the variation of inherited characteristics."
      },
      {
        id: 3,
        question: "What is the smallest particle of an element that retains its properties?",
        options: ["Molecule", "Atom", "Proton", "Electron"],
        correctAnswer: 1,
        explanation: "An atom is the smallest particle of an element that still retains the chemical properties of that element."
      },
      {
        id: 4,
        question: "What is the force that keeps planets in orbit around the Sun?",
        options: ["Magnetic force", "Electric force", "Gravitational force", "Nuclear force"],
        correctAnswer: 2,
        explanation: "Gravitational force is the attractive force between masses that keeps planets in orbit around the Sun."
      },
      {
        id: 5,
        question: "What is the process by which rocks are broken down into smaller pieces?",
        options: ["Erosion", "Weathering", "Deposition", "Sedimentation"],
        correctAnswer: 1,
        explanation: "Weathering is the process that breaks down rocks into smaller pieces through physical, chemical, or biological means."
      }
    ],
    5: [
      {
        id: 1,
        question: "What is the principle behind MRI imaging?",
        options: ["X-ray radiation", "Nuclear magnetic resonance", "Ultrasound waves", "Gamma radiation"],
        correctAnswer: 1,
        explanation: "MRI (Magnetic Resonance Imaging) uses nuclear magnetic resonance to create detailed images of the body's internal structures."
      },
      {
        id: 2,
        question: "What is the half-life of Carbon-14?",
        options: ["5,730 years", "1,000 years", "10,000 years", "100,000 years"],
        correctAnswer: 0,
        explanation: "Carbon-14 has a half-life of approximately 5,730 years, making it useful for dating organic materials."
      },
      {
        id: 3,
        question: "What is the term for the point where an enzyme binds to its substrate?",
        options: ["Allosteric site", "Active site", "Binding site", "Catalytic center"],
        correctAnswer: 1,
        explanation: "The active site is the specific region of an enzyme where the substrate binds and the catalytic reaction occurs."
      },
      {
        id: 4,
        question: "What is the uncertainty principle in quantum mechanics?",
        options: ["Energy is quantized", "You cannot know both position and momentum precisely", "Light behaves as both wave and particle", "Time is relative"],
        correctAnswer: 1,
        explanation: "Heisenberg's uncertainty principle states that you cannot simultaneously know both the exact position and momentum of a particle."
      },
      {
        id: 5,
        question: "What is the process called when a star collapses and becomes incredibly dense?",
        options: ["Supernova", "Black hole formation", "Neutron star formation", "All of the above"],
        correctAnswer: 3,
        explanation: "When a massive star collapses, it can become a supernova, and depending on its mass, form either a neutron star or a black hole."
      }
    ]
  },
  social: {
    1: [
      {
        id: 1,
        question: "What are the three branches of the U.S. government?",
        options: ["Federal, State, Local", "Executive, Legislative, Judicial", "President, Congress, Courts", "House, Senate, Cabinet"],
        correctAnswer: 1,
        explanation: "The three branches are Executive (President), Legislative (Congress), and Judicial (Courts), designed to provide checks and balances."
      },
      {
        id: 2,
        question: "Which continent is the largest by land area?",
        options: ["Africa", "North America", "Asia", "Europe"],
        correctAnswer: 2,
        explanation: "Asia is the largest continent by both land area and population."
      },
      {
        id: 3,
        question: "In what year did World War II end?",
        options: ["1944", "1945", "1946", "1947"],
        correctAnswer: 1,
        explanation: "World War II ended in 1945, with Germany surrendering in May and Japan surrendering in September."
      },
      {
        id: 4,
        question: "What is the capital of Canada?",
        options: ["Toronto", "Vancouver", "Ottawa", "Montreal"],
        correctAnswer: 2,
        explanation: "Ottawa is the capital city of Canada, located in the province of Ontario."
      },
      {
        id: 5,
        question: "Which ancient civilization built the pyramids at Giza?",
        options: ["Romans", "Greeks", "Egyptians", "Mesopotamians"],
        correctAnswer: 2,
        explanation: "The ancient Egyptians built the pyramids at Giza around 4,500 years ago as tombs for their pharaohs."
      }
    ],
    2: [
      {
        id: 1,
        question: "What document begins with 'We the People'?",
        options: ["Declaration of Independence", "Bill of Rights", "U.S. Constitution", "Articles of Confederation"],
        correctAnswer: 2,
        explanation: "The U.S. Constitution begins with 'We the People of the United States' in its preamble."
      },
      {
        id: 2,
        question: "Which river is the longest in the world?",
        options: ["Amazon", "Nile", "Mississippi", "Yangtze"],
        correctAnswer: 1,
        explanation: "The Nile River in Africa is generally considered the longest river in the world at about 4,135 miles."
      },
      {
        id: 3,
        question: "What was the main cause of the American Civil War?",
        options: ["Taxation", "Slavery", "Trade disputes", "Territory expansion"],
        correctAnswer: 1,
        explanation: "The primary cause of the American Civil War was disagreement over slavery and states' rights related to slavery."
      },
      {
        id: 4,
        question: "Which mountain range runs along the western coast of South America?",
        options: ["Rockies", "Himalayas", "Andes", "Alps"],
        correctAnswer: 2,
        explanation: "The Andes Mountains run along the western coast of South America and are the world's longest mountain range."
      },
      {
        id: 5,
        question: "Who was the first President of the United States?",
        options: ["Thomas Jefferson", "John Adams", "George Washington", "Benjamin Franklin"],
        correctAnswer: 2,
        explanation: "George Washington was the first President of the United States, serving from 1789 to 1797."
      }
    ],
    3: [
      {
        id: 1,
        question: "What is the Bill of Rights?",
        options: ["The first 10 amendments to the Constitution", "A list of presidential powers", "The Declaration of Independence", "A civil rights law"],
        correctAnswer: 0,
        explanation: "The Bill of Rights consists of the first 10 amendments to the U.S. Constitution, protecting individual freedoms."
      },
      {
        id: 2,
        question: "Which event sparked World War I?",
        options: ["Sinking of Lusitania", "Assassination of Archduke Franz Ferdinand", "German invasion of Belgium", "Russian Revolution"],
        correctAnswer: 1,
        explanation: "The assassination of Archduke Franz Ferdinand of Austria-Hungary in 1914 was the immediate trigger for World War I."
      },
      {
        id: 3,
        question: "What is latitude?",
        options: ["Distance east or west", "Distance north or south", "Height above sea level", "Time zone measurement"],
        correctAnswer: 1,
        explanation: "Latitude measures distance north or south of the equator, while longitude measures distance east or west."
      },
      {
        id: 4,
        question: "Which empire was ruled by Julius Caesar?",
        options: ["Greek Empire", "Roman Empire", "Byzantine Empire", "Persian Empire"],
        correctAnswer: 1,
        explanation: "Julius Caesar was a leader of the Roman Empire, though he lived during the late Roman Republic period."
      },
      {
        id: 5,
        question: "What is democracy?",
        options: ["Rule by the wealthy", "Rule by the people", "Rule by the military", "Rule by religious leaders"],
        correctAnswer: 1,
        explanation: "Democracy is a form of government where power is held by the people, either directly or through elected representatives."
      }
    ],
    4: [
      {
        id: 1,
        question: "What was the Industrial Revolution?",
        options: ["A political movement", "A period of rapid technological and economic change", "A war between countries", "A religious reformation"],
        correctAnswer: 1,
        explanation: "The Industrial Revolution was a period of rapid technological and economic change that began in the late 18th century."
      },
      {
        id: 2,
        question: "What is the difference between weather and climate?",
        options: ["There is no difference", "Weather is short-term, climate is long-term patterns", "Climate is short-term, weather is long-term", "Weather is only about rain"],
        correctAnswer: 1,
        explanation: "Weather refers to short-term atmospheric conditions, while climate refers to long-term weather patterns in a region."
      },
      {
        id: 3,
        question: "What was the Cold War?",
        options: ["A war fought in winter", "A period of tension between US and USSR", "A civil war", "A trade dispute"],
        correctAnswer: 1,
        explanation: "The Cold War was a period of political tension and rivalry between the United States and Soviet Union from 1945-1991."
      },
      {
        id: 4,
        question: "What is cultural diffusion?",
        options: ["The spread of cultural traits from one society to another", "The loss of culture", "The creation of new cultures", "The study of ancient cultures"],
        correctAnswer: 0,
        explanation: "Cultural diffusion is the process by which cultural traits, ideas, and practices spread from one society to another."
      },
      {
        id: 5,
        question: "What is gross domestic product (GDP)?",
        options: ["A country's population", "The total value of goods and services produced in a country", "A country's debt", "The number of exports"],
        correctAnswer: 1,
        explanation: "GDP measures the total monetary value of all goods and services produced within a country during a specific period."
      }
    ],
    5: [
      {
        id: 1,
        question: "What is the difference between capitalism and socialism?",
        options: ["No difference", "Capitalism emphasizes private ownership, socialism emphasizes public ownership", "They are both the same economic system", "Capitalism is only about money"],
        correctAnswer: 1,
        explanation: "Capitalism emphasizes private ownership and free markets, while socialism emphasizes public or collective ownership of resources."
      },
      {
        id: 2,
        question: "What is gerrymandering?",
        options: ["A type of election", "Manipulating electoral district boundaries for political advantage", "A voting method", "A campaign strategy"],
        correctAnswer: 1,
        explanation: "Gerrymandering is the practice of manipulating electoral district boundaries to give one political party an advantage."
      },
      {
        id: 3,
        question: "What is the significance of the Magna Carta?",
        options: ["It ended slavery", "It limited the power of the king", "It started democracy", "It created Parliament"],
        correctAnswer: 1,
        explanation: "The Magna Carta (1215) was significant because it limited the power of the English king and established that everyone, including rulers, is subject to the law."
      },
      {
        id: 4,
        question: "What is sustainable development?",
        options: ["Building more factories", "Development that meets present needs without compromising future generations", "Economic growth only", "Population control"],
        correctAnswer: 1,
        explanation: "Sustainable development meets the needs of the present without compromising the ability of future generations to meet their own needs."
      },
      {
        id: 5,
        question: "What is the European Union?",
        options: ["A military alliance", "A political and economic union of European countries", "A trade agreement", "A currency system"],
        correctAnswer: 1,
        explanation: "The European Union is a political and economic union of European countries that promotes cooperation and integration among member states."
      }
    ]
  }
};

// Default to math questions if no subject is specified
const stageQuestions: Record<number, Question[]> = subjectQuestions.math;

// Subject-specific stage configurations
const subjectStages: Record<string, Stage[]> = {
  math: [
    { id: 1, title: "Basic Arithmetic", icon: <Target className="w-6 h-6" />, status: 'current', xpReward: 50 },
    { id: 2, title: "Intermediate Math", icon: <BookOpen className="w-6 h-6" />, status: 'locked', xpReward: 75 },
    { id: 3, title: "Advanced Concepts", icon: <Puzzle className="w-6 h-6" />, status: 'locked', xpReward: 100 },
    { id: 4, title: "Expert Level", icon: <Key className="w-6 h-6" />, status: 'locked', xpReward: 125 },
    { id: 5, title: "Master Challenge", icon: <Trophy className="w-6 h-6" />, status: 'locked', xpReward: 150 }
  ],
  english: [
    { id: 1, title: "Grammar Basics", icon: <Target className="w-6 h-6" />, status: 'current', xpReward: 50 },
    { id: 2, title: "Reading & Writing", icon: <BookOpen className="w-6 h-6" />, status: 'locked', xpReward: 75 },
    { id: 3, title: "Literary Analysis", icon: <Puzzle className="w-6 h-6" />, status: 'locked', xpReward: 100 },
    { id: 4, title: "Advanced Composition", icon: <Key className="w-6 h-6" />, status: 'locked', xpReward: 125 },
    { id: 5, title: "Literary Mastery", icon: <Trophy className="w-6 h-6" />, status: 'locked', xpReward: 150 }
  ],
  science: [
    { id: 1, title: "Basic Science", icon: <Target className="w-6 h-6" />, status: 'current', xpReward: 50 },
    { id: 2, title: "Physical Science", icon: <BookOpen className="w-6 h-6" />, status: 'locked', xpReward: 75 },
    { id: 3, title: "Biology & Chemistry", icon: <Puzzle className="w-6 h-6" />, status: 'locked', xpReward: 100 },
    { id: 4, title: "Physics & Earth", icon: <Key className="w-6 h-6" />, status: 'locked', xpReward: 125 },
    { id: 5, title: "Advanced Science", icon: <Trophy className="w-6 h-6" />, status: 'locked', xpReward: 150 }
  ],
  social: [
    { id: 1, title: "Civics & Geography", icon: <Target className="w-6 h-6" />, status: 'current', xpReward: 50 },
    { id: 2, title: "American History", icon: <BookOpen className="w-6 h-6" />, status: 'locked', xpReward: 75 },
    { id: 3, title: "World Cultures", icon: <Puzzle className="w-6 h-6" />, status: 'locked', xpReward: 100 },
    { id: 4, title: "Government & Economics", icon: <Key className="w-6 h-6" />, status: 'locked', xpReward: 125 },
    { id: 5, title: "Global Studies", icon: <Trophy className="w-6 h-6" />, status: 'locked', xpReward: 150 }
  ]
};

const subjectNames: Record<string, string> = {
  math: "Math Journey",
  english: "English Journey", 
  science: "Science Journey",
  social: "Social Studies Journey"
};

export function GameMapQuizScreen({ 
  onBack, 
  onXPGain, 
  onStreakIncrease, 
  userXP, 
  streakCount,
  selectedSubject,
  onQuizCompletion
}: GameMapQuizScreenProps) {
  // Get subject-specific stages and questions
  const subjectId = selectedSubject?.id || 'math';
  const currentQuestions = subjectQuestions[subjectId] || subjectQuestions.math;
  const journeyName = subjectNames[subjectId] || "Math Journey";
  
  const [stages, setStages] = useState<Stage[]>(subjectStages[subjectId] || subjectStages.math);

  const [currentStage, setCurrentStage] = useState<number | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [stageScore, setStageScore] = useState(0);
  const [showStageComplete, setShowStageComplete] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const [sessionXP, setSessionXP] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [correctAnswersCount, setCorrectAnswersCount] = useState(0);

  const handleStageClick = (stageId: number) => {
    const stage = stages.find(s => s.id === stageId);
    if (stage && (stage.status === 'current' || stage.status === 'completed')) {
      setCurrentStage(stageId);
      setCurrentQuestion(0);
      setStageScore(0);
      setSelectedAnswer(null);
      setShowFeedback(false);
      setStartTime(new Date());
      setCorrectAnswersCount(0);
    }
  };

  const handleAnswerSelect = (answerIndex: number) => {
    if (showFeedback) return;
    setSelectedAnswer(answerIndex);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null || !currentStage) return;
    
    const questions = currentQuestions[currentStage];
    const currentQ = questions[currentQuestion];
    const isCorrect = selectedAnswer === currentQ.correctAnswer;
    
    setShowFeedback(true);
    
    if (isCorrect) {
      setStageScore(prev => prev + 1);
      setCorrectAnswersCount(prev => prev + 1);
      onXPGain(10);
      setSessionXP(prev => prev + 10);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 1000);
    }

    setTimeout(() => {
      if (currentQuestion < questions.length - 1) {
        setCurrentQuestion(prev => prev + 1);
        setSelectedAnswer(null);
        setShowFeedback(false);
      } else {
        completeStage();
      }
    }, 2500);
  };

  const completeStage = () => {
    if (!currentStage) return;
    
    const stage = stages.find(s => s.id === currentStage);
    if (!stage) return;

    // Mark current stage as completed
    setStages(prev => prev.map(s => {
      if (s.id === currentStage) {
        return { ...s, status: 'completed' as const };
      }
      if (s.id === currentStage + 1) {
        return { ...s, status: 'current' as const };
      }
      return s;
    }));

    // Award stage completion XP
    onXPGain(stage.xpReward);
    setSessionXP(prev => prev + stage.xpReward);
    onStreakIncrease();

    setShowStageComplete(true);
    
    // Only show full completion screen for final stage
    if (currentStage === 5) {
      setTimeout(() => {
        setShowStageComplete(false);
        
        // Calculate completion stats for the entire journey
        const endTime = new Date();
        const completionTimeMs = startTime ? endTime.getTime() - startTime.getTime() : 0;
        const minutes = Math.floor(completionTimeMs / 60000);
        const seconds = Math.floor((completionTimeMs % 60000) / 1000);
        const completionTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        const totalQuestions = Object.values(currentQuestions).flat().length;
        const accuracy = Math.round((correctAnswersCount / totalQuestions) * 100);
        
        // Trigger full journey completion screen
        onQuizCompletion({
          xpGained: sessionXP,
          completionTime,
          accuracy,
          totalQuestions,
          correctAnswers: correctAnswersCount,
          stageName: journeyName
        });
      }, 4000);
    }
  };

  const resetToMap = () => {
    setCurrentStage(null);
    setShowStageComplete(false);
    setCurrentQuestion(0);
    setSelectedAnswer(null);
    setShowFeedback(false);
    setStageScore(0);
  };

  const resetGame = () => {
    setStages(subjectStages[subjectId] || subjectStages.math);
    setShowVictory(false);
    setSessionXP(0);
    resetToMap();
  };

  // Enhanced Confetti Component
  const Confetti = () => (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {[...Array(40)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ 
            opacity: 1, 
            y: -20, 
            x: Math.random() * window.innerWidth,
            rotate: 0,
            scale: Math.random() * 0.5 + 0.5
          }}
          animate={{ 
            opacity: 0, 
            y: window.innerHeight + 100,
            rotate: Math.random() * 720 + 360,
            x: Math.random() * window.innerWidth
          }}
          transition={{ 
            duration: Math.random() * 2 + 2,
            delay: Math.random() * 1.5,
            ease: "easeOut"
          }}
          className={`absolute w-3 h-3 rounded-full ${
            i % 5 === 0 ? 'bg-yellow-400' :
            i % 5 === 1 ? 'bg-blue-400' :
            i % 5 === 2 ? 'bg-green-400' :
            i % 5 === 3 ? 'bg-purple-400' :
            'bg-pink-400'
          }`}
        />
      ))}
    </div>
  );



  if (showStageComplete && currentStage) {
    const stage = stages.find(s => s.id === currentStage);
    const nextStageAvailable = currentStage < 5;
    
    return (
      <div className="h-full bg-gradient-to-br from-[#ADC8FF]/20 via-white to-[#E8F2FF]/30 relative overflow-hidden">
        <Confetti />
        
        {/* Background Decorative Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-3xl">
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              rotate: [0, 360, 0],
              opacity: [0.1, 0.3, 0.1]
            }}
            transition={{ duration: 8, repeat: Infinity }}
            className="absolute -top-32 -right-32 w-80 h-80 bg-gradient-to-br from-yellow-400/20 to-orange-400/20 rounded-full blur-3xl"
          />
          <motion.div
            animate={{ 
              scale: [1, 1.1, 1],
              rotate: [0, -180, 0],
              opacity: [0.1, 0.2, 0.1]
            }}
            transition={{ duration: 10, repeat: Infinity, delay: 2 }}
            className="absolute -bottom-32 -left-32 w-96 h-96 bg-gradient-to-br from-green-400/20 to-blue-400/20 rounded-full blur-3xl"
          />
        </div>

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col items-center justify-center px-6">
          {/* Trophy/Success Animation */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ 
              type: "spring", 
              stiffness: 200, 
              damping: 15,
              delay: 0.3 
            }}
            className="mb-8"
          >
            <div className="relative">
              <div className={`w-32 h-32 rounded-full flex items-center justify-center shadow-2xl mt-8 ${
                correctAnswersCount >= 4 
                  ? "bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-yellow-500/25" 
                  : correctAnswersCount >= 2 
                  ? "bg-gradient-to-br from-green-400 to-green-600 shadow-green-500/25"
                  : "bg-gradient-to-br from-red-400 to-red-600 shadow-red-500/25"
              }`}>
                {correctAnswersCount >= 4 ? (
                  <Trophy className="w-16 h-16 text-white" />
                ) : correctAnswersCount >= 2 ? (
                  <Star className="w-16 h-16 text-white" />
                ) : (
                  <Target className="w-16 h-16 text-white" />
                )}
              </div>
              {/* Floating sparkles around trophy */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0"
              >
                <Sparkles className="absolute -top-4 left-4 w-6 h-6 text-yellow-400" />
                <Sparkles className="absolute top-4 -right-4 w-8 h-8 text-orange-400" />
                <Sparkles className="absolute -bottom-4 right-4 w-5 h-5 text-yellow-500" />
                <Sparkles className="absolute bottom-4 -left-4 w-6 h-6 text-orange-300" />
              </motion.div>
            </div>
          </motion.div>

          {/* Success Message */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-center mb-8"
          >
            <h1 className="text-4xl font-bold bg-gradient-to-r from-[#091A7A] to-[#4F8EFF] bg-clip-text text-transparent mb-3 text-center">
              {stageScore >= 2 ? `Level ${currentStage} Mastered` : "Good Try! Retry Again"}
            </h1>
            <p className="text-lg text-[#4F8EFF] font-medium">{stage?.title}</p>
          </motion.div>

          {/* Stats Card */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-white/95 backdrop-blur-xl rounded-3xl p-8 shadow-lg border border-white/40 mb-8 w-full max-w-sm"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Target className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="font-medium text-[#091A7A]">Score</span>
                </div>
                <span className="text-xl font-bold text-[#091A7A]">{stageScore}/5</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                    <Star className="w-5 h-5 text-yellow-600" />
                  </div>
                  <span className="font-medium text-[#091A7A]">XP Gained</span>
                </div>
                <span className="text-xl font-bold text-[#091A7A]">+{(stage?.xpReward || 0) + (stageScore * 10)}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                    <Flame className="w-5 h-5 text-orange-600" />
                  </div>
                  <span className="font-medium text-[#091A7A]">Streak</span>
                </div>
                <span className="text-xl font-bold text-[#091A7A]">{streakCount} days</span>
              </div>
            </div>
          </motion.div>

          {/* Action Buttons */}
          <div className="w-full max-w-sm space-y-4">
            <motion.button
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setShowStageComplete(false);
                if (stageScore >= 2 && nextStageAvailable) {
                  // Proceed to next stage
                  setCurrentStage(currentStage + 1);
                  setCurrentQuestion(0);
                  setStageScore(0);
                  setSelectedAnswer(null);
                  setShowFeedback(false);
                  setStartTime(new Date());
                  setCorrectAnswersCount(0);
                } else {
                  // Retry current stage
                  setCurrentQuestion(0);
                  setStageScore(0);
                  setSelectedAnswer(null);
                  setShowFeedback(false);
                  setStartTime(new Date());
                  setCorrectAnswersCount(0);
                }
              }}
              className="w-full bg-gradient-to-r from-[#091A7A] to-[#4F8EFF] text-white py-4 rounded-2xl font-semibold shadow-lg flex items-center justify-center gap-2"
            >
              <span>{stageScore >= 2 && nextStageAvailable ? "Next Stage" : "Retry Stage"}</span>
              <motion.div
                animate={{ x: [0, 4, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <ArrowLeft className="w-5 h-5 rotate-180" />
              </motion.div>
            </motion.button>
            
            <div className="flex gap-3 justify-center">
              {stageScore >= 2 ? (
                <>
                  <motion.button
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.1 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onBack}
                    className="flex-1 bg-white/90 backdrop-blur-xl border border-white/40 text-[#091A7A] py-3 rounded-2xl font-medium shadow-sm text-center"
                  >
                    Back
                  </motion.button>

                  <motion.button
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.2 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setShowStageComplete(false);
                      setCurrentQuestion(0);
                      setStageScore(0);
                      setSelectedAnswer(null);
                      setShowFeedback(false);
                      setStartTime(new Date());
                      setCorrectAnswersCount(0);
                    }}
                    className="flex-1 bg-white/90 backdrop-blur-xl border border-white/40 text-[#091A7A] py-3 rounded-2xl font-medium shadow-sm text-center"
                  >
                    Retry Stage
                  </motion.button>
                </>
              ) : (
                <>
                  <motion.button
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.1 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={resetToMap}
                    className="flex-1 bg-white/90 backdrop-blur-xl border border-white/40 text-[#091A7A] py-3 rounded-2xl font-medium shadow-sm text-center"
                  >
                    View Map
                  </motion.button>

                  <motion.button
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.2 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onBack}
                    className="flex-1 bg-white/90 backdrop-blur-xl border border-white/40 text-[#091A7A] py-3 rounded-2xl font-medium shadow-sm text-center"
                  >
                    Back
                  </motion.button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentStage) {
    const questions = currentQuestions[currentStage];
    const currentQ = questions[currentQuestion];
    const stage = stages.find(s => s.id === currentStage);
    
    return (
      <div className="h-full bg-gradient-to-b from-[#ADC8FF]/30 via-[#F8FBFF]/50 to-white relative">
        {showConfetti && <Confetti />}
        
        {/* Floating Back Button - Separate */}
        <div className="absolute top-6 left-6 z-30">
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={resetToMap}
            className="w-12 h-12 bg-white/95 backdrop-blur-xl rounded-full flex items-center justify-center shadow-lg border border-white/40"
          >
            <ArrowLeft className="w-5 h-5 text-[#091A7A]" />
          </motion.button>
        </div>

        {/* Modern Header Stats */}
        <div className="pt-20 px-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/95 backdrop-blur-xl rounded-3xl p-6 shadow-lg border border-white/40"
          >
            {/* Stage Info */}
            <div className="text-center mb-6">
              <div className="flex justify-center mb-6 mt-4">
                <div className="w-16 h-16 bg-gradient-to-br from-[#091A7A] to-[#4F8EFF] rounded-2xl flex items-center justify-center shadow-lg">
                  <div className="w-8 h-8 text-white flex items-center justify-center">{stage?.icon}</div>
                </div>
              </div>
              <h1 className="text-xl font-semibold text-[#091A7A] mb-1">{stage?.title}</h1>
              <p className="text-sm text-[#4F8EFF]">Stage {currentStage} • Question {currentQuestion + 1} of {questions.length}</p>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
                  className="h-full bg-gradient-to-r from-[#091A7A] to-[#4F8EFF] rounded-full"
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>

            {/* Stats Row */}
            <div className="flex items-center justify-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Star className="w-4 h-4 text-yellow-600" />
                </div>
                <span className="text-sm font-medium text-[#091A7A]">{userXP + sessionXP} XP</span>
              </div>
              <div className="w-px h-6 bg-gray-200"></div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Flame className="w-4 h-4 text-orange-600" />
                </div>
                <span className="text-sm font-medium text-[#091A7A]">{streakCount} day streak</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Question Content */}
        <div className="flex-1 px-6 pb-8 space-y-6">
          {/* Question Card */}
          <motion.div
            key={currentQuestion}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white/95 backdrop-blur-xl rounded-3xl p-8 shadow-lg border border-white/40"
          >
            <div className="text-center">
              <h2 className="text-lg font-medium text-[#091A7A] leading-relaxed">
                {currentQ.question}
              </h2>
            </div>
          </motion.div>

          {/* Answer Options */}
          <div className="space-y-3">
            {currentQ.options.map((option, index) => {
              let cardStyle = "bg-white/95 border-white/40";
              let textColor = "text-[#091A7A]";
              let iconBg = "bg-gray-100";
              let iconColor = "text-gray-400";
              
              if (showFeedback) {
                if (index === currentQ.correctAnswer) {
                  cardStyle = "bg-emerald-50/95 border-emerald-200/60";
                  textColor = "text-emerald-700";
                  iconBg = "bg-emerald-100";
                  iconColor = "text-emerald-600";
                } else if (index === selectedAnswer && index !== currentQ.correctAnswer) {
                  cardStyle = "bg-red-50/95 border-red-200/60";
                  textColor = "text-red-700";
                  iconBg = "bg-red-100";
                  iconColor = "text-red-600";
                }
              } else if (selectedAnswer === index) {
                cardStyle = "bg-[#091A7A]/10 border-[#091A7A]/30";
                textColor = "text-[#091A7A]";
                iconBg = "bg-[#091A7A]";
                iconColor = "text-white";
              }

              return (
                <motion.button
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  whileHover={{ scale: showFeedback ? 1 : 1.02, y: showFeedback ? 0 : -2 }}
                  whileTap={{ scale: showFeedback ? 1 : 0.98 }}
                  onClick={() => handleAnswerSelect(index)}
                  disabled={showFeedback}
                  className={`w-full p-5 rounded-2xl backdrop-blur-xl shadow-sm border transition-all duration-300 ${cardStyle}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-200 ${iconBg}`}>
                      <span className={`font-semibold text-sm ${iconColor}`}>
                        {String.fromCharCode(65 + index)}
                      </span>
                    </div>
                    <span className={`font-medium text-left flex-1 ${textColor}`}>
                      {option}
                    </span>
                    {showFeedback && index === currentQ.correctAnswer && (
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Feedback Card */}
          <AnimatePresence>
            {showFeedback && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -30 }}
                transition={{ delay: 0.2 }}
                className={`p-6 rounded-2xl backdrop-blur-xl border shadow-lg ${
                  selectedAnswer === currentQ.correctAnswer 
                    ? 'bg-emerald-50/95 border-emerald-200/60' 
                    : 'bg-red-50/95 border-red-200/60'
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    selectedAnswer === currentQ.correctAnswer ? 'bg-emerald-100' : 'bg-red-100'
                  }`}>
                    {selectedAnswer === currentQ.correctAnswer ? (
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Circle className="w-4 h-4 text-red-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-semibold text-sm mb-1 ${
                      selectedAnswer === currentQ.correctAnswer ? 'text-emerald-700' : 'text-red-700'
                    }`}>
                      {selectedAnswer === currentQ.correctAnswer ? 'Excellent! +10 XP' : 'Not quite right'}
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{currentQ.explanation}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit Button */}
          {!showFeedback && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="flex justify-center pt-4"
            >
              <motion.button
                whileHover={{ scale: selectedAnswer !== null ? 1.02 : 1 }}
                whileTap={{ scale: selectedAnswer !== null ? 0.98 : 1 }}
                onClick={handleSubmitAnswer}
                disabled={selectedAnswer === null}
                className={`px-12 py-4 rounded-2xl backdrop-blur-xl shadow-lg border transition-all duration-300 ${
                  selectedAnswer !== null
                    ? 'bg-[#091A7A] text-white border-[#091A7A] shadow-[#091A7A]/25'
                    : 'bg-white/70 text-gray-400 border-gray-200 cursor-not-allowed'
                }`}
              >
                <span className="font-semibold">
                  {selectedAnswer !== null ? 'Submit Answer' : 'Select an answer'}
                </span>
              </motion.button>
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  // Main Map View - Duolingo Style
  return (
    <div className="h-full bg-gradient-to-b from-[#ADC8FF] via-[#E8F2FF]/95 to-white relative overflow-hidden">
      {/* Subtle Background Elements */}
      <div className="absolute inset-0 opacity-20">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
          className="absolute top-20 right-16 w-20 h-20 bg-[#091A7A]/3 rounded-full"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 100, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-32 left-12 w-14 h-14 bg-[#4F8EFF]/3 rounded-full"
        />
      </div>

      {/* Header */}  
      <div className="relative z-10 p-6 border-b border-white/20 rounded-full">
        <div className="flex items-center justify-between">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onBack}
            className="w-10 h-10 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-card"
          >
            <ArrowLeft className="w-5 h-5 text-[#091A7A]" />
          </motion.button>
          
          <h1 className="text-main-heading text-[#091A7A]">{journeyName}</h1>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              <span className="text-subheading text-[#091A7A]">{userXP + sessionXP} XP</span>
            </div>
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" />
              <span className="text-subheading text-[#091A7A]">{streakCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Duolingo-Style Map */}
      <div className="flex-1 relative z-10 overflow-y-auto scrollbar-hide">
        <div className="max-w-sm mx-auto relative py-12">
          
          {/* Minimalist Connection Path */}
          <svg 
            className="absolute inset-0 w-full h-full pointer-events-none z-0" 
            viewBox="0 0 300 700"
            preserveAspectRatio="xMidYMin meet"
          >
            <defs>
              <linearGradient id="pathGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ADC8FF" stopOpacity="0.6" />
                <stop offset="50%" stopColor="#091A7A" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#ADC8FF" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            <motion.path
              d="M 150 80 
                 C 150 100, 120 140, 80 200
                 C 40 260, 120 280, 220 320  
                 C 320 360, 220 380, 80 440
                 C -60 500, 120 520, 150 560"
              stroke="url(#pathGradient)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2, ease: "easeInOut" }}
            />
          </svg>

          {/* Modern Stage Nodes */}
          <div className="relative z-10">
            {stages.map((stage, index) => {
              const positions = [
                { x: '50%', y: '80px', transform: 'translateX(-50%)' },
                { x: '25%', y: '200px', transform: 'translateX(-50%)' },
                { x: '75%', y: '320px', transform: 'translateX(-50%)' },
                { x: '25%', y: '440px', transform: 'translateX(-50%)' },
                { x: '50%', y: '560px', transform: 'translateX(-50%)' },
              ];

              const position = positions[index];

              return (
                <motion.div
                  key={stage.id}
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ 
                    delay: index * 0.2,
                    duration: 0.6,
                    ease: [0.25, 0.46, 0.45, 0.94]
                  }}
                  className="absolute"
                  style={{
                    left: position.x,
                    top: position.y,
                    transform: position.transform,
                  }}
                >
                  {/* Clean Modern Stage Button */}
                  <motion.button
                    whileHover={{ 
                      scale: stage.status !== 'locked' ? 1.08 : 1,
                      y: stage.status !== 'locked' ? -2 : 0,
                    }}
                    whileTap={{ scale: stage.status !== 'locked' ? 0.95 : 1 }}
                    onClick={() => handleStageClick(stage.id)}
                    disabled={stage.status === 'locked'}
                    className={`relative w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 backdrop-blur-md border ${
                      stage.status === 'completed' 
                        ? 'bg-gradient-to-br from-emerald-400/90 to-emerald-600/90 border-emerald-300/50 text-white shadow-lg shadow-emerald-500/25' 
                        : stage.status === 'current'
                        ? 'bg-gradient-to-br from-[#091A7A]/90 to-[#4F8EFF]/90 border-[#ADC8FF]/50 text-white shadow-lg shadow-[#091A7A]/25'
                        : 'bg-white/60 border-gray-200/50 text-gray-400 cursor-not-allowed shadow-sm'
                    }`}
                  >
                    {/* Modern Icon Display */}
                    {stage.status === 'completed' ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                      >
                        <CheckCircle className="w-7 h-7" />
                      </motion.div>
                    ) : (
                      <div className="relative">
                        <div className="w-6 h-6">{stage.icon}</div>
                        {stage.status === 'locked' && (
                          <div className="absolute inset-0 bg-white/20 rounded backdrop-blur-sm" />
                        )}
                      </div>
                    )}
                    
                    {/* Minimal Number Badge */}
                    <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-semibold shadow-sm ${
                      stage.status === 'completed' 
                        ? 'bg-emerald-500 text-white' 
                        : stage.status === 'current'
                        ? 'bg-[#091A7A] text-white'
                        : 'bg-gray-300 text-gray-600'
                    }`}>
                      {stage.id}
                    </div>
                    
                    {/* Subtle Glow for Current Stage */}
                    {stage.status === 'current' && (
                      <motion.div
                        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0, 0.4] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute inset-0 bg-[#ADC8FF] rounded-2xl -z-10"
                      />
                    )}

                    {/* Minimal Success Indicator */}
                    {stage.status === 'completed' && (
                      <motion.div
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute inset-0 bg-emerald-400/20 rounded-2xl -z-10"
                      />
                    )}
                  </motion.button>

                  {/* Clean Tooltip */}
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.2 + 0.6 }}
                    className={`absolute top-20 text-center z-20 ${
                      index === 2 || index === 4 ? 'right-0 transform translate-x-4' : 'left-1/2 transform -translate-x-1/2'
                    }`}
                  >
                    <div className={`px-3 py-2 rounded-xl backdrop-blur-md shadow-sm border text-xs ${
                      stage.status === 'completed' 
                        ? 'bg-emerald-50/90 border-emerald-200/50 text-emerald-700' 
                        : stage.status === 'current'
                        ? 'bg-white/90 border-[#ADC8FF]/50 text-[#091A7A]'
                        : 'bg-gray-50/90 border-gray-200/50 text-gray-500'
                    }`}>
                      <div className="font-medium mb-1">{stage.title}</div>
                      <div className="opacity-75">
                        {stage.status === 'locked' ? '🔒' : 
                         stage.status === 'completed' ? '✓ Complete' :
                         `${stage.xpReward} XP`}
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
          
          {/* Modern Progress Card */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5, duration: 0.8 }}
            className="mt-[680px] mx-4 p-6 bg-white/85 backdrop-blur-xl rounded-3xl border border-white/40 shadow-lg"
          >
            <div className="text-center space-y-4">
              <div>
                <h3 className="text-subheading text-[#091A7A] font-semibold mb-1">Your Progress</h3>
                <p className="text-small text-[#4F8EFF] opacity-80">{journeyName} Completion</p>
              </div>
              
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-[#091A7A] mb-1">
                    {stages.filter(s => s.status === 'completed').length}
                  </div>
                  <div className="text-small text-[#4F8EFF]">Complete</div>
                </div>
                <div className="w-px h-8 bg-gray-200"></div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-400 mb-1">
                    {stages.filter(s => s.status === 'locked').length}
                  </div>
                  <div className="text-small text-gray-400">Remaining</div>
                </div>
              </div>
              
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(stages.filter(s => s.status === 'completed').length / stages.length) * 100}%` }}
                  transition={{ delay: 2, duration: 1.5, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-[#091A7A] to-[#4F8EFF] rounded-full"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}