
export enum QuestionType {
  MCQ = 'multiple_choice',
  SITUATION = 'situation',
  SHORT_ANSWER = 'short_answer'
}

export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard'
}

export enum EducationLevel {
  PRIMARY = 'Tiểu học - C1',
  SECONDARY = 'Trung học cơ sở - C2',
  HIGH_SCHOOL = 'Trung học phổ thông - C3',
  UNIVERSITY = 'Đại học',
  OTHER = 'Khác'
}

export enum LanguageMode {
  GENERAL = 'Chế độ kiểm tra chung',
  VOCABULARY = 'Chế độ từ vựng',
  GRAMMAR = 'Chế độ ngữ pháp',
  READING = 'Chế độ đọc hiểu'
}

export enum QuestionCategory {
  VOCABULARY = 'Vocabulary',
  GRAMMAR = 'Grammar',
  READING = 'Reading',
  PRONUNCIATION = 'Pronunciation',
  WORD_STRESS = 'Word Stress',
  COMMUNICATION = 'Communication',
  SENTENCE_TRANSFORMATION = 'Sentence Transformation',
  ERROR_IDENTIFICATION = 'Error Identification'
}

export interface Question {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  content: string;
  options: string[]; // For MCQ (luôn có 5 đáp án theo yêu cầu trước)
  correctAnswer: string;
  explanation: string;
  tag: string;
  imageIndex?: number; // Chỉ số của hình ảnh trong mảng mediaFiles ban đầu
  imageBox?: number[]; // Tọa độ bounding box [ymin, xmin, ymax, xmax]
}

export interface Student {
  id: string;
  name: string;
  phone?: string;
  score: number;
  hasPlayed: boolean;
}

export interface LessonContent {
  raw: string;
  parsed: {
    concepts: string[];
    formulas: string[];
    commonMistakes: string[];
    summary: string;
    flashcards?: { front: string; back: string }[];
  };
  mediaFiles?: {data: string, mimeType: string}[];
}

export interface GameHistory {
  studentName: string;
  questionContent: string;
  isCorrect: boolean | null;
  timestamp: number;
}

export interface ExamResult {
  id: string;
  name: string;
  className: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  timestamp: number;
  sessionId?: string;
  helpCount?: number;
  details?: {
    questionId: string;
    questionContent: string;
    options: string[];
    correctAnswer: string;
    studentAnswer: string;
    isCorrect: boolean;
    explanation: string;
    imageIndex?: number;
    imageBox?: number[];
  }[];
}
