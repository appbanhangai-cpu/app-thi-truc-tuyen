
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  BookOpen, 
  Users, 
  RotateCw, 
  Settings, 
  Upload, 
  Play, 
  Plus, 
  Trophy, 
  CheckCircle,
  CheckCircle2,
  XCircle,
  FileText, 
  Trash2, 
  Edit2, 
  AlertCircle, 
  Clock, 
  X, 
  File, 
  ListFilter, 
  Info, 
  Sparkles, 
  FileUp, 
  Loader2, 
  ChevronDown, 
  ChevronUp, 
  Settings2, 
  HelpCircle, 
  GraduationCap, 
  Key, 
  ExternalLink,
  Target,
  Star,
  PartyPopper,
  Timer,
  ClipboardCheck,
  Camera,
  Copy,
  Frown,
  TrendingUp,
  Globe,
  Layers,
  Image as ImageIcon,
  ZoomIn,
  Eye,
  Link as LinkIcon,
  RefreshCcw,
  Download,
  Cloud,
  Monitor,
  Zap,
  Brain,
  ArrowRight,
  Shuffle,
  CreditCard,
  Activity,
  Table,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, ImageRun } from 'docx';
import { Difficulty, Question, QuestionType, Student, LessonContent, GameHistory, ExamResult, EducationLevel, LanguageMode, QuestionCategory } from './types.ts';
import { extractAndAnalyzeLesson, generateQuestions, extractStudents, extractQuestionsFromPDF } from './services/geminiService.ts';
import Wheel from './components/Wheel.tsx';
import QuestionCard, { LatexRenderer } from './components/QuestionCard.tsx';
import Flashcard from './components/Flashcard.tsx';
import { MonitoringTab, CameraMonitor } from './components/Monitoring.tsx';
import ExamTab from './components/ExamTab.tsx';
import * as XLSX from 'xlsx';
import { safeJsonParse } from './utils.ts';

interface UploadedFile {
  name: string;
  type: string;
  data?: string; // Base64 cho ảnh/PDF
  textContent?: string; // Nội dung văn bản trích xuất từ .docx hoặc .txt
}

const base64ToArrayBuffer = (base64: string) => {
  try {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (e) {
    console.error("Error converting base64 to ArrayBuffer:", e);
    return new ArrayBuffer(0);
  }
};

const getApiBase = () => {
  // Use relative paths by default for better compatibility with proxies/iframes
  // We ensure it starts with a slash if needed, but empty string is usually fine for same-origin
  return '';
};

const API_BASE = getApiBase();

// Helper function for safe JSON fetching
async function safeFetchJson(url: string, options?: RequestInit, retries = 2) {
  const fetchOptions: RequestInit = {
    ...options,
    mode: 'cors',
    credentials: 'omit',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options?.headers,
    }
  };
  
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    if (i > 0) {
      console.log(`[Network] Retry ${i}/${retries} for ${url}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * i));
    }

    try {
      const res = await fetch(url, fetchOptions);
      const contentType = res.headers.get("content-type") || "";
      const text = await res.text();
      
      console.log(`[Network] Response from ${url} (Attempt ${i+1}):`, {
        status: res.status,
        contentType,
        textPreview: text.substring(0, 100)
      });

      if (!res.ok) {
        lastError = new Error(`Server error ${res.status}: ${res.statusText}`);
        continue;
      }

      if (!contentType.includes("application/json")) {
        const preview = text.trim().substring(0, 100).replace(/<[^>]*>?/gm, '');
        console.error(`[Network] Non-JSON response from ${url}:`, { contentType, preview });
        lastError = new Error(`Dữ liệu không phải JSON (${contentType}). Nội dung: "${preview}..." (Status: ${res.status})`);
        continue;
      }

      const data = safeJsonParse(text, null);
      if (data === null) {
        lastError = new Error("Không thể phân tích dữ liệu JSON từ máy chủ");
        continue;
      }
      return data;
    } catch (e: any) {
      console.error(`[Network] Attempt ${i+1} failed for ${url}:`, e.message);
      lastError = e;
    }
  }
  
  throw lastError || new Error(`Không thể kết nối tới ${url} sau ${retries} lần thử`);
}

const CroppedImage: React.FC<{ src: string, box: number[], alt: string, className?: string }> = ({ src, box, alt, className }) => {
  const [ymin, xmin, ymax, xmax] = box;
  const width = xmax - xmin;
  const height = ymax - ymin;

  if (width <= 0 || height <= 0) return <img src={src} alt={alt} className={className} />;

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ aspectRatio: `${width}/${height}` }}>
      <img
        src={src}
        alt={alt}
        className="absolute max-w-none"
        style={{
          top: `${-(ymin / height) * 100}%`,
          left: `${-(xmin / width) * 100}%`,
          width: `${(1000 / width) * 100}%`,
          height: `${(1000 / height) * 100}%`,
        }}
      />
    </div>
  );
};

const categoryTooltips: Record<string, string> = {
  [QuestionCategory.VOCABULARY]: "Kiểm tra vốn từ vựng, nghĩa của từ và cách dùng từ.",
  [QuestionCategory.GRAMMAR]: "Kiểm tra các cấu trúc ngữ pháp, thì của động từ, v.v.",
  [QuestionCategory.READING]: "Đọc đoạn văn và trả lời các câu hỏi liên quan.",
  [QuestionCategory.PRONUNCIATION]: "Kiểm tra cách phát âm các nguyên âm, phụ âm.",
  [QuestionCategory.WORD_STRESS]: "Kiểm tra vị trí trọng âm của từ.",
  [QuestionCategory.COMMUNICATION]: "Các tình huống giao tiếp, đáp lại lời nói.",
  [QuestionCategory.SENTENCE_TRANSFORMATION]: "Viết lại câu sao cho nghĩa không đổi.",
  [QuestionCategory.ERROR_IDENTIFICATION]: "Tìm và sửa lỗi sai trong câu."
};

const categoryTranslations: Record<string, string> = {
  [QuestionCategory.VOCABULARY]: "Từ vựng",
  [QuestionCategory.GRAMMAR]: "Ngữ pháp",
  [QuestionCategory.READING]: "Đọc hiểu",
  [QuestionCategory.PRONUNCIATION]: "Phát âm",
  [QuestionCategory.WORD_STRESS]: "Trọng âm",
  [QuestionCategory.COMMUNICATION]: "Giao tiếp",
  [QuestionCategory.SENTENCE_TRANSFORMATION]: "Viết lại câu",
  [QuestionCategory.ERROR_IDENTIFICATION]: "Tìm lỗi sai"
};

const App: React.FC = () => {
  // State cho Cột Bài học
  const [lessonRaw, setLessonRaw] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [lessonParsed, setLessonParsed] = useState<LessonContent | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [questionConfig, setQuestionConfig] = useState({
    count: 50,
    difficulty: Difficulty.MEDIUM,
    mcqRatio: 70,
    keywords: '',
    language: 'auto', // 'auto' | 'vi' | 'en'
    optionsCount: 4, // Mặc định là 4 theo yêu cầu mới
    subject: 'Anh văn',
    educationLevel: EducationLevel.HIGH_SCHOOL,
    languageMode: LanguageMode.GENERAL,
    questionCategories: [QuestionCategory.VOCABULARY, QuestionCategory.GRAMMAR],
    shuffleAnswers: true,
    flashcards: true
  });
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [isEnteringHintsPass, setIsEnteringHintsPass] = useState(false);
  const [hintsPassInput, setHintsPassInput] = useState('');

  // State cho Cột Học sinh
  const [className, setClassName] = useState('CÔ HUYỀN PRO');
  const [students, setStudents] = useState<Student[]>([]);
  const [rawStudentInput, setRawStudentInput] = useState('');
  const [isProcessingStudents, setIsProcessingStudents] = useState(false);
  const [isInitialDataLoaded, setIsInitialDataLoaded] = useState(false);

  // State cho Cột Game
  const [questionBank, setQuestionBank] = useState<Question[]>([]);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  const [currentQuestionSet, setCurrentQuestionSet] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [gameHistory, setGameHistory] = useState<GameHistory[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };
  const [timeLeft, setTimeLeft] = useState(0);
  const [showBankPreview, setShowBankPreview] = useState(false);
  const [isUploadingBank, setIsUploadingBank] = useState(false);
  const [turnFinished, setTurnFinished] = useState(false);

  // State cho Bài thi & Bảng điểm
  const [examResults, setExamResults] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return localStorage.getItem('currentSessionId') || `Đợt thi ${new Date().toLocaleString()}`;
  });
  const [isStudentMode, setIsStudentMode] = useState(false);
  const [studentLoginInfo, setStudentLoginInfo] = useState({ name: '', class: '' });
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [selectedResultDetail, setSelectedResultDetail] = useState<ExamResult | null>(null);
  const [showOnlyIncorrect, setShowOnlyIncorrect] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState({ name: '', class: '' });
  const [pendingDownloadType, setPendingDownloadType] = useState<'word' | 'pdf' | 'json' | null>(null);
  const [isLoadingBank, setIsLoadingBank] = useState(false);
  const [showCopyPasswordInput, setShowCopyPasswordInput] = useState(false);
  const [copyPassword, setCopyPassword] = useState('');
  
  // Setup Settings
  const [showSetup, setShowSetup] = useState(false);
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [testStatus, setTestStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });
  
  // Fetch initial config
  useEffect(() => {
    fetch(`${API_BASE}/api/config/sheet`)
      .then(res => res.json())
      .then(data => {
        if (data.url) setGoogleSheetUrl(data.url);
      })
      .catch(err => console.error("Error fetching sheet config:", err));
  }, []);

  const handleSaveConfig = async () => {
    try {
      await fetch(`${API_BASE}/api/config/sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: googleSheetUrl })
      });
      setShowSetup(false);
    } catch (err) {
      console.error("Error saving sheet config:", err);
      setShowSetup(false);
    }
  };
  const [questionsPerTurn, setQuestionsPerTurn] = useState(1);
  const [examMode, setExamMode] = useState(false);
  const [isLinkTransferred, setIsLinkTransferred] = useState(false);
  const [isGoogleAuthenticated, setIsGoogleAuthenticated] = useState(false);

  useEffect(() => {
    const checkGoogleAuth = async () => {
      try {
        const res = await fetch('/api/auth/google/status');
        const data = await res.json();
        setIsGoogleAuthenticated(data.authenticated);
      } catch (e) {
        console.error('Error checking Google auth:', e);
      }
    };
    checkGoogleAuth();

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        setIsGoogleAuthenticated(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleGoogleDriveExport = async () => {
    if (!isGoogleAuthenticated) {
      try {
        const res = await fetch('/api/auth/google/url');
        const data = await res.json();
        if (!res.ok) {
          alert(`Lỗi kết nối: ${data.error || 'Không thể lấy URL xác thực'}`);
          return;
        }
        const { url } = data;
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        window.open(url, 'Google Auth', `width=${width},height=${height},left=${left},top=${top}`);
      } catch (e) {
        console.error('Error getting auth URL:', e);
        alert('Không thể kết nối Google Drive. Vui lòng kiểm tra cấu hình API.');
      }
      return;
    }

    // Upload
    try {
      const filename = `BangDiem_${currentSessionId.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
      const res = await fetch('/api/drive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          content: examResults
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Đã lưu file "${filename}" vào Google Drive thành công!`);
      } else {
        alert('Lỗi khi lưu vào Google Drive: ' + (data.error || 'Unknown error'));
        if (res.status === 401) setIsGoogleAuthenticated(false);
      }
    } catch (e) {
      console.error('Error uploading to Drive:', e);
      alert('Lỗi khi lưu vào Google Drive');
    }
  };
  const [isExamActive, setIsExamActive] = useState(false);
  const [exitPassword, setExitPassword] = useState('');
  const [examStudentInfo, setExamStudentInfo] = useState({ name: '', class: '', subject: 'Hóa học', id: '' });
  const [examTimeLimit, setExamTimeLimit] = useState(15); // phút
  const [examQuestionCount, setExamQuestionCount] = useState(100); // số câu hỏi trong bài thi
  const [allowTranslation, setAllowTranslation] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [questionsUsedHelp, setQuestionsUsedHelp] = useState<string[]>([]);
  const [hasSelectedKey, setHasSelectedKey] = useState(false);
  const [sharedAppUrl, setSharedAppUrl] = useState('');

  // Tự động khởi tạo Shared App URL từ origin hiện tại
  useEffect(() => {
    const currentUrl = window.location.origin;
    if (currentUrl.includes('-dev-')) {
      setSharedAppUrl(currentUrl.replace('-dev-', '-pre-'));
    } else {
      setSharedAppUrl(currentUrl);
    }
  }, []);

  // Tự động đồng bộ số câu hỏi trong bài thi với số câu trong ngân hàng khi ngân hàng thay đổi
  useEffect(() => {
    // Chỉ tự động đồng bộ nếu KHÔNG phải chế độ học sinh (để tránh ghi đè cấu hình từ URL)
    if (!isStudentMode && questionBank.length > 0) {
      setExamQuestionCount(questionBank.length);
    }
  }, [questionBank.length, isStudentMode]);
  
  // State cho Giám sát
  const [activeTab, setActiveTab] = useState<'dashboard' | 'monitoring' | 'exam' | 'flashcards'>('dashboard');
  const [monitoredStudents, setMonitoredStudents] = useState<any[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  // Persist student state to handle accidental reloads
  useEffect(() => {
    if (isStudentMode && currentStudent && isExamActive && !turnFinished) {
      const state = {
        currentStudent,
        className,
        currentQuestionSet,
        currentQuestionIndex,
        timeLeft,
        isExamActive,
        turnFinished,
        studentLoginInfo,
        questionsUsedHelp
      };
      sessionStorage.setItem('student_exam_state', JSON.stringify(state));
    } else if (turnFinished) {
      sessionStorage.removeItem('student_exam_state');
    }
  }, [isStudentMode, currentStudent, isExamActive, className, currentQuestionSet, currentQuestionIndex, timeLeft, turnFinished, studentLoginInfo, questionsUsedHelp]);

  // Restore student state on mount if in student mode
  useEffect(() => {
    if (isStudentMode && !isExamActive) {
      const saved = sessionStorage.getItem('student_exam_state');
      if (saved && saved !== 'undefined' && saved !== 'null') {
        try {
          const state = safeJsonParse(saved, null);
          if (state && state.isExamActive && !state.turnFinished) {
            setCurrentStudent(state.currentStudent);
            setClassName(state.className);
            setCurrentQuestionSet(state.currentQuestionSet);
            setCurrentQuestionIndex(state.currentQuestionIndex);
            setTimeLeft(state.timeLeft);
            setIsExamActive(state.isExamActive);
            setTurnFinished(state.turnFinished);
            setStudentLoginInfo(state.studentLoginInfo);
            if (state.questionsUsedHelp) {
              setQuestionsUsedHelp(state.questionsUsedHelp);
            }
          }
        } catch (e) {
          console.error("Failed to restore state", e);
        }
      }
    }
  }, [isStudentMode, isExamActive]);

  // Refs
  const timerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const studentFileInputRef = useRef<HTMLInputElement>(null);
  const bankFileInputRef = useRef<HTMLInputElement>(null);
  const navScrollRef = useRef<HTMLDivElement>(null);

  const scrollNavToEnd = () => {
    if (navScrollRef.current) {
      navScrollRef.current.scrollTo({
        left: navScrollRef.current.scrollWidth,
        behavior: 'smooth'
      });
    }
  };

  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  // WebSocket connection logic
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let isCleanup = false;

    const connect = () => {
      if (isCleanup) return;
      
      if (isStudentMode && !isExamActive) {
        setWsStatus('disconnected');
        return;
      }

      setWsStatus('connecting');
    // WebSocket URL construction
    let wsUrl = '';
    if (window.location.hostname.includes('vercel.app')) {
      // Trên Vercel, trỏ thẳng về Cloud Run WebSocket để tránh lỗi proxy
      const cloudRunHost = 'ais-dev-53njposzv3owjn5x4fdyjc-413987094370.asia-southeast1.run.app';
      wsUrl = `wss://${cloudRunHost}/ws`;
      console.log(`[WebSocket] Vercel detected, using direct Cloud Run WS: ${wsUrl}`);
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      wsUrl = `${protocol}//${host}/ws`;
      console.log(`[WebSocket] Using direct URL: ${wsUrl}`);
    }
      
      socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        if (isCleanup) {
          socket?.close();
          return;
        }
        console.log("[WS] Connected successfully");
        setWsStatus('connected');
        
        if (!isStudentMode && (activeTab === 'monitoring' || isExamActive)) {
          console.log("[WS] Sending teacher_init");
          socket?.send(JSON.stringify({ type: 'teacher_init' }));
        } else if (isStudentMode && isExamActive && currentStudent) {
          console.log("[WS] Sending student_join for:", currentStudent.name);
          socket?.send(JSON.stringify({
            type: 'student_join',
            studentId: currentStudent.id,
            name: currentStudent.name,
            className: className
          }));
        }
      };

      socket.onmessage = (event) => {
        try {
          const rawData = event.data;
          const data = safeJsonParse(rawData, null);
          if (!data) return;
          
          if (data.type === 'monitor_init') {
            console.log("[WS] monitor_init received with", data.students.length, "students");
            setMonitoredStudents(data.students);
          } else if (data.type === 'monitor_update') {
            setMonitoredStudents(prev => {
              const index = prev.findIndex(s => s.studentId === data.studentId);
              if (index !== -1) {
                const next = [...prev];
                const updatedFrame = data.frame || next[index].lastFrame;
                next[index] = { 
                  ...next[index], 
                  ...data, 
                  lastFrame: updatedFrame,
                  lastUpdate: Date.now() 
                };
                return next;
              }
              return [...prev, { ...data, lastFrame: data.frame, lastUpdate: Date.now() }];
            });
          } else if (data.type === 'student_left') {
            setMonitoredStudents(prev => prev.filter(s => s.studentId !== data.studentId));
          }
        } catch (e) {
          console.error("WS Message Error:", e, event.data);
        }
      };

      socket.onclose = (event) => {
        if (isCleanup) return;
        console.log("[WS] Disconnected. Code:", event.code, "Reason:", event.reason);
        setWsStatus('disconnected');
        // Reconnect after 3 seconds
        reconnectTimeout = setTimeout(connect, 3000);
      };

      socket.onerror = (err) => {
        console.error("[WS] Socket error:", err);
        setWsStatus('disconnected');
        socket?.close();
      };
    };

    connect();

    return () => {
      console.log("[WS] Cleaning up socket connection");
      isCleanup = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) socket.close();
    };
  }, [activeTab, isStudentMode, isExamActive, currentStudent?.id, className]);

  const handleCameraFrame = useCallback((frame: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN && isExamActive && currentStudent) {
      socketRef.current.send(JSON.stringify({
        type: 'student_frame',
        studentId: currentStudent.id,
        name: currentStudent.name,
        className: className,
        frame
      }));
    }
  }, [isExamActive, currentStudent, className]);

  // Kiểm tra pathname cho chế độ học sinh
  useEffect(() => {
    const isExamPath = window.location.pathname === '/exam' || window.location.pathname === '/exam/';
    
    if (isExamPath) {
      setIsStudentMode(true);
      
      // Read query parameters for exam configuration
      const params = new URLSearchParams(window.location.search);
      const count = params.get('count');
      const time = params.get('time');
      if (count) setExamQuestionCount(parseInt(count));
      if (time) setExamTimeLimit(parseInt(time));
      
      // Fetch bank if in student mode
      fetchBankFromServer();
    }
    
    // Load exam results from server periodically if in teacher mode
    if (!isExamPath) {
      fetchBankFromServer();
      fetchResultsFromServer();
      const interval = setInterval(fetchResultsFromServer, 5000); // Poll every 5s for better responsiveness
      return () => clearInterval(interval);
    }
  }, []);

  const fetchBankFromServer = async () => {
    setIsLoadingBank(true);
    console.log(`[Debug] fetchBankFromServer called. API_BASE: ${API_BASE}`);
    try {
      const apiUrl = `${API_BASE}/api/bank`;
      console.log("BANK URL:", apiUrl);
      const data = await safeFetchJson(apiUrl);
      
      if (!data) {
        console.warn("[Debug] No data returned from fetchBankFromServer");
        setIsInitialDataLoaded(true);
        return;
      }

      // Sync lessonParsed even if bank is empty
      if (data.lessonParsed) {
        console.log("[Debug] Setting lessonParsed from server:", data.lessonParsed.title);
        setLessonParsed(data.lessonParsed);
      }
      
      if (data.allowTranslation !== undefined) setAllowTranslation(data.allowTranslation);
      if (data.currentSessionId) {
        setCurrentSessionId(data.currentSessionId);
        localStorage.setItem('currentSessionId', data.currentSessionId);
      }

      // Normalize data as requested
      const raw = data;
      const questions: Question[] = 
        (Array.isArray(raw) ? raw :
        Array.isArray(raw?.questionBank) ? raw.questionBank :
        Array.isArray(raw?.questions) ? raw.questions :
        Array.isArray(raw?.bank) ? raw.bank :
        Array.isArray(raw?.data) ? raw.data :
        []).map((q: any, idx: number) => ({
          ...q,
          id: q.id || `q-${idx}-${Date.now()}`
        }));

      console.log("RAW BANK RESPONSE:", raw);
      console.log("NORMALIZED QUESTIONS:", questions);
      console.log("QUESTIONS LENGTH:", questions.length);

      if (questions.length > 0) {
        setQuestionBank(questions);
      } else {
        console.warn("[Debug] Question bank is empty after normalization. Raw data:", raw);
      }
      setIsInitialDataLoaded(true);
    } catch (e: any) {
      console.error("Error fetching bank:", e.message);
      setIsInitialDataLoaded(true);
    } finally {
      setIsLoadingBank(false);
    }
  };

  useEffect(() => {
    console.log("[Debug] examResults changed:", examResults);
  }, [examResults]);

  const fetchResultsFromServer = async () => {
    try {
      const data = await safeFetchJson(`${API_BASE}/api/results`);
      console.log(`[Debug] Fetched ${data?.length || 0} results from server`);
      setExamResults(Array.isArray(data) ? data : []);
    } catch (e: any) {
      console.error("Error fetching results:", e.message);
    }
  };

  const saveBankToServer = async (bank: Question[], parsed: LessonContent | null, translation?: boolean, sessionId?: string) => {
    try {
      const bankUrl = `${API_BASE}/api/bank`;
      console.log("BANK URL:", bankUrl);
      await safeFetchJson(bankUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          questionBank: bank, 
          lessonParsed: parsed,
          allowTranslation: translation !== undefined ? translation : allowTranslation,
          currentSessionId: sessionId || currentSessionId
        })
      });
    } catch (e: any) {
      console.error("Error saving bank:", e.message);
    }
  };

  const [isSavingResult, setIsSavingResult] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSavedResultId, setLastSavedResultId] = useState<string | null>(null);

  const saveResultToServer = async (result: any, force = false) => {
    // Nếu đã lưu thành công ID này rồi thì không lưu lại trừ khi ép buộc
    if (lastSavedResultId === result.id && !force && syncStatus === 'success') {
      console.log("[Debug] Result already synced successfully.");
      return true;
    }

    if (isSavingResult && !force) return false;
    
    setIsSavingResult(true);
    setSyncStatus('syncing');
    setSyncError(null);
    
    try {
      console.log("[Debug] saveResultToServer - Sending result:", result);
      const data = await safeFetchJson(`${API_BASE}/api/submit-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      });
      console.log("[Debug] saveResultToServer - API Response:", data);
      
      if (data && data.success) {
        console.log(`[Debug] Result saved successfully. Sheet Sync: ${data.sheetSync}`);
        setSyncStatus('success');
        setLastSavedResultId(result.id);
        return true;
      } else {
        const errorMsg = data?.sheetSync || "Lỗi không xác định";
        console.error(`[Debug] Server error saving result: ${errorMsg}`);
        setSyncStatus('error');
        setSyncError(errorMsg);
        return false;
      }
    } catch (e: any) {
      console.error("[Debug] saveResultToServer - Error:", e.message);
      setSyncStatus('error');
      setSyncError(e.message);
      return false;
    } finally {
      setIsSavingResult(false);
    }
  };

  const syncStartToServer = async (student: Student) => {
    try {
      console.log(`[Debug] syncStartToServer - Recording start for: ${student.name}`);
      await fetch(`${API_BASE}/api/start-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: student.id,
          name: student.name,
          className: className || student.phone // phone field is used for class in student mode
        })
      });
    } catch (e: any) {
      console.error("[Debug] syncStartToServer - Error:", e.message);
    }
  };

  // Sync allowTranslation when changed by teacher
  useEffect(() => {
    if (!isStudentMode && isInitialDataLoaded) {
      saveBankToServer(questionBank, lessonParsed, allowTranslation);
    }
  }, [allowTranslation, isInitialDataLoaded]);

  const resetServerData = async () => {
    try {
      await safeFetchJson(`${API_BASE}/api/reset`, { method: 'DELETE' });
    } catch (e: any) {
      console.error("Error resetting server:", e.message);
    }
  };

  // Kiểm tra trạng thái API Key
  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setHasSelectedKey(hasKey);
      }
    };
    checkKey();
  }, [showSetup]);

  const handleSelectApiKey = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setHasSelectedKey(true);
    }
  };

  // FIX: Hàm tạo dự án mới (Reset toàn bộ app) đảm bảo hoạt động
  const handleNewProject = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (window.confirm("Bạn có chắc chắn muốn tạo dự án mới? Toàn bộ dữ liệu bài học, học sinh và ngân hàng câu hỏi hiện tại sẽ bị xóa sạch.")) {
      resetServerData();
      setLessonRaw('');
      setUploadedFiles([]);
      setLessonParsed(null);
      setQuestionBank([]);
      setStudents([]);
      setRawStudentInput('');
      setGameHistory([]);
      setCurrentStudent(null);
      setCurrentQuestionSet([]);
      setCurrentQuestionIndex(0);
      setTurnFinished(false);
      setIsExamActive(false);
      setIsLinkTransferred(false);
      setTimeLeft(0);
      if (timerRef.current) clearInterval(timerRef.current);
      
      // Reset file inputs
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (studentFileInputRef.current) studentFileInputRef.current.value = '';
    }
  };

  const handleSelectExamTab = () => {
    setActiveTab('exam');
    setExamMode(true);
    
    // Tự động kích hoạt Chuyển Link
    let currentUrl = window.location.origin;
    if (currentUrl.includes('-dev-')) {
      currentUrl = currentUrl.replace('-dev-', '-pre-');
    }
    setSharedAppUrl(currentUrl);
    setIsLinkTransferred(true);
    
    // Hiệu ứng cuộn đến tab exam nếu cần (cho mobile)
    if (navScrollRef.current) {
      navScrollRef.current.scrollTo({ left: 1000, behavior: 'smooth' });
    }
  };

  const handleCopyExamLink = () => {
    // Ưu tiên sử dụng sharedAppUrl nếu có, nếu không dùng origin hiện tại
    let baseUrl = sharedAppUrl && sharedAppUrl.trim() !== '' ? sharedAppUrl : window.location.origin;
    
    // Đảm bảo baseUrl không có trailing slash và không có /exam ở cuối
    baseUrl = baseUrl.trim().replace(/\/$/, '').replace(/\/exam$/, '');
    
    // Thêm các tham số cấu hình vào link
    const finalUrl = `${baseUrl}/exam?count=${examQuestionCount}&time=${examTimeLimit}`;
    
    const copyToClipboard = (text: string) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          document.body.removeChild(textArea);
          return Promise.resolve();
        } catch (err) {
          document.body.removeChild(textArea);
          return Promise.reject(err);
        }
      }
    };

    copyToClipboard(finalUrl)
      .then(() => {
        alert("Đã sao chép link bài kiểm tra!\n\nLink: " + finalUrl);
      })
      .catch((err) => {
        console.error('Copy failed', err);
        prompt("Vui lòng sao chép link sau đây:", finalUrl);
      });
  };

  const handleSecureCopyLink = () => {
    setShowCopyPasswordInput(true);
  };

  const handleCopyPasswordChange = (val: string) => {
    setCopyPassword(val);
    if (val === '2021') {
      handleCopyExamLink();
      setCopyPassword('');
      setShowCopyPasswordInput(false);
    }
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = studentLoginInfo.name.trim();
    const trimmedClass = studentLoginInfo.class.trim();
    
    if (!trimmedName || !trimmedClass) {
      alert("Vui lòng nhập đầy đủ Tên và Lớp!");
      return;
    }

    // Luôn fetch lại bank mới nhất từ server trước khi thi
    setIsLoadingBank(true);
    const apiUrl = `${API_BASE}/api/bank`;
    console.log(`[Debug] Student login fetching bank from: ${apiUrl}`);
    console.log(`[Debug] API_BASE: ${API_BASE}`);
    
    try {
      const data = await safeFetchJson(apiUrl);
      
      // Normalize data as requested
      const raw = data;
      const questions: Question[] = 
        (Array.isArray(raw) ? raw :
        Array.isArray(raw?.questionBank) ? raw.questionBank :
        Array.isArray(raw?.questions) ? raw.questions :
        Array.isArray(raw?.bank) ? raw.bank :
        Array.isArray(raw?.data) ? raw.data :
        []).map((q: any, idx: number) => ({
          ...q,
          id: q.id || `q-${idx}-${Date.now()}`
        }));

      console.log("RAW BANK RESPONSE:", raw);
      console.log("NORMALIZED QUESTIONS:", questions);
      console.log("QUESTIONS LENGTH:", questions.length);

      if (questions.length === 0) {
        alert("Bạn hãy TẢI LÊN NGÂN HÀNG CÂU HỎI File.JSON trước khi bấm BẮT ĐẦU");
        return;
      }

      setQuestionBank(questions);
      if (data.lessonParsed) setLessonParsed(data.lessonParsed);
      if (data.currentSessionId) {
        setCurrentSessionId(data.currentSessionId);
        localStorage.setItem('currentSessionId', data.currentSessionId);
      }

      // Tạo học sinh ảo cho bài thi
      const newStudent: Student = {
        id: 'student-' + Date.now(),
        name: trimmedName,
        score: 0,
        hasPlayed: false,
        phone: trimmedClass
      };

      setCurrentStudent(newStudent);
      setClassName(trimmedClass);
      setStudentLoginInfo({ name: trimmedName, class: trimmedClass });
      
      // Ghi nhận bắt đầu thi lên Sheet
      syncStartToServer(newStudent);
      
      // Bắt đầu bài thi
      console.log("Student starting exam:", { name: trimmedName, class: trimmedClass, count: examQuestionCount });
      
      const count = Math.min(examQuestionCount, questions.length);
      const shuffled = [...questions].sort(() => Math.random() - 0.5).slice(0, count);
      
      setCurrentQuestionSet(shuffled);
      setQuestionsUsedHelp([]);
      setCurrentQuestionIndex(0);
      setTurnFinished(false);
      setIsExamActive(true);
      setTimeLeft(examTimeLimit * 60);
    } catch (err: any) {
      console.error("Login error details:", err);
      alert(`Lỗi kết nối máy chủ: ${err.message}. URL: ${apiUrl}. Vui lòng thử lại!`);
    } finally {
      setIsLoadingBank(false);
    }
  };

  const handleDownloadIncorrect = async (result: ExamResult) => {
    const incorrects = result.details?.filter(d => !d.isCorrect) || [];
    if (incorrects.length === 0) {
      alert("Không có câu trả lời sai nào để tải xuống!");
      return;
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: "KẾT QUẢ CÁC CÂU SAI",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Học sinh: `, bold: true }),
              new TextRun(result.name.toUpperCase()),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Lớp: `, bold: true }),
              new TextRun(result.className),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Điểm: `, bold: true }),
              new TextRun(result.score.toFixed(1)),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Ngày thi: `, bold: true }),
              new TextRun(new Date(result.timestamp).toLocaleString()),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "--------------------------------------------------" }),
          new Paragraph({ text: "" }),
          ...incorrects.flatMap((d, idx) => [
            new Paragraph({
              children: [
                new TextRun({ text: `CÂU ${idx + 1}: `, bold: true }),
                new TextRun(d.questionContent),
              ],
            }),
            ...d.options.map((opt, oIdx) => 
              new Paragraph({
                text: `${String.fromCharCode(65 + oIdx)}. ${opt}`,
                indent: { left: 720 },
              })
            ),
            ...(d.imageIndex !== undefined && d.imageIndex !== null && lessonParsed?.mediaFiles?.[d.imageIndex] ? [
              new Paragraph({
                children: [
                  new ImageRun({
                    data: base64ToArrayBuffer(lessonParsed.mediaFiles[d.imageIndex].data),
                    transformation: {
                      width: 400,
                      height: 300,
                    },
                  } as any),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 200 },
              })
            ] : []),
            new Paragraph({
              children: [
                new TextRun({ text: "=> Đáp án đúng: ", bold: true, color: "008000" }),
                new TextRun(d.correctAnswer),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "=> Bạn đã chọn: ", bold: true, color: "FF0000" }),
                new TextRun(d.studentAnswer),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "=> Giải thích: ", bold: true, italics: true }),
                new TextRun(d.explanation),
              ],
            }),
            new Paragraph({ text: "" }),
            new Paragraph({ text: "--------------------------------------------------" }),
            new Paragraph({ text: "" }),
          ]),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const namePart = result.name.replace(/\s+/g, '_');
    const classPart = result.className.replace(/\s+/g, '_');
    const countPart = `${incorrects.length}CauSai`;
    link.download = `KetQua_CauSai_${namePart}_${classPart}_${countPart}_${new Date().getTime()}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    if (examResults.length === 0) {
      alert("Chưa có dữ liệu bảng điểm để xuất!");
      return;
    }

    const data = examResults.map((r, idx) => ({
      "STT": idx + 1,
      "Đợt thi": r.sessionId || 'Đợt thi cũ',
      "Họ và Tên": r.name,
      "Lớp": r.className,
      "Số câu đúng": `${r.correctAnswers}/${r.totalQuestions}`,
      "Điểm số": r.score.toFixed(1),
      "Thời gian nộp": new Date(r.timestamp).toLocaleString('vi-VN')
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BangDiem");
    const classPart = className.replace(/\s+/g, '_');
    XLSX.writeFile(wb, `BangDiem_Thi_${classPart}_Ngay_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`);
  };

  const handleExportJSON = () => {
    if (examResults.length === 0) {
      alert("Chưa có dữ liệu bảng điểm để xuất!");
      return;
    }

    const dataStr = JSON.stringify(examResults, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const classPart = className.replace(/\s+/g, '_');
    link.download = `BangDiem_Thi_${classPart}_Ngay_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Xử lý tải file bài học
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: UploadedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isImage = file.type.startsWith('image/');
      const isPDF = file.type === 'application/pdf';
      const isWord = file.name.endsWith('.docx');
      const isText = file.type === 'text/plain' || file.name.endsWith('.txt');
      
      let base64 = '';
      let textContent = '';

      try {
        if (isImage || isPDF) {
          base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1]); 
            };
            reader.readAsDataURL(file);
          });
        } else if (isWord) {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          textContent = result.value;
        } else if (isText) {
          textContent = await file.text();
        }

        newFiles.push({
          name: file.name,
          type: file.type || (isWord ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/plain'),
          data: base64 || undefined,
          textContent: textContent || undefined
        });
      } catch (err) {
        console.error(`Lỗi xử lý file ${file.name}:`, err);
        alert(`Không thể đọc file ${file.name}. Vui lòng kiểm tra lại định dạng.`);
      }
    }
    setUploadedFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Trích xuất và phân tích bài học
  const handleExtractLesson = async () => {
    const hasAnyContent = lessonRaw.trim() || uploadedFiles.some(f => f.data || f.textContent);
    if (!hasAnyContent) {
      alert('Vui lòng nhập văn bản hoặc tải file bài học.');
      return;
    }
    
    setIsExtracting(true);
    setLoadingMessage('AI đang đọc và phân tích nội dung bài học...');
    try {
      const mediaFiles = uploadedFiles
        .filter(f => f.data)
        .map(f => ({ data: f.data!, mimeType: f.type }));

      const docxAndTxtContent = uploadedFiles
        .filter(f => f.textContent)
        .map(f => `[Từ file ${f.name}]:\n${f.textContent}`)
        .join('\n\n');

      const combinedText = `${lessonRaw}\n\n${docxAndTxtContent}`;

      if (mediaFiles.length > 0) {
        setLoadingMessage('AI đang xử lý hình ảnh và tài liệu đính kèm...');
      }

      const result = await extractAndAnalyzeLesson(combinedText, mediaFiles);
      setLoadingMessage('Đang hoàn tất việc trích xuất kiến thức trọng tâm...');
      const parsedData = { 
        raw: combinedText, 
        parsed: result,
        mediaFiles // Lưu cả media files (base64) để dùng sau này
      };
      setLessonParsed(parsedData);
      
      // Chỉ lưu lessonParsed lên server, không gửi bank (để tránh ghi đè bank cũ bằng mảng rỗng)
      try {
        const bankUrl = `${API_BASE}/api/bank`;
        console.log("BANK URL:", bankUrl);
        await safeFetchJson(bankUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonParsed: parsedData })
        });
      } catch (e) {
        console.error("Error saving lesson to server:", e);
      }
    } catch (err: any) {
      console.error(err);
      const errorMsg = err.message || 'Lỗi không xác định';
      alert(questionConfig.language === 'en' 
        ? `Error analyzing lesson: ${errorMsg}\nPlease try again.` 
        : `Có lỗi xảy ra khi phân tích bài học: ${errorMsg}\nVui lòng thử lại.`);
    } finally {
      setIsExtracting(false);
    }
  };

  // Xử lý tải file học sinh
  const handleStudentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingStudents(true);
    try {
      const mediaFiles: {data: string, mimeType: string}[] = [];
      let combinedText = "";

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.endsWith('.docx')) {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          combinedText += `\n[Nội dung từ ${file.name}]:\n${result.value}\n`;
        } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
          const base64: string = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1]);
            };
            reader.readAsDataURL(file);
          });
          mediaFiles.push({ data: base64, mimeType: file.type });
        } else {
          try {
            const text = await file.text();
            combinedText += `\n[Nội dung từ ${file.name}]:\n${text}\n`;
          } catch (err) {
            combinedText += `\n[File: ${file.name} (định dạng không hỗ trợ trực tiếp)]\n`;
          }
        }
      }

      const extracted = await extractStudents(combinedText, mediaFiles);
      
      if (extracted.length > 0) {
        const newStudents: Student[] = extracted.map((item, i) => ({
          id: `s-ai-${Date.now()}-${i}`,
          name: item.name,
          phone: item.phone || undefined,
          score: 0,
          hasPlayed: false
        }));
        setStudents(prev => [...prev, ...newStudents]);
      } else {
        alert("Không tìm thấy tên học sinh nào trong các file đã chọn.");
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi khi xử lý file danh sách.");
    } finally {
      setIsProcessingStudents(false);
      if (studentFileInputRef.current) studentFileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerateBank = async () => {
    if (!lessonParsed) {
      alert('Vui lòng phân tích bài học trước.');
      return;
    }
    setIsGeneratingQuestions(true);
    setLoadingMessage('AI đang thiết kế các câu hỏi dựa trên bài học...');
    try {
      if (questionConfig.keywords) {
        setLoadingMessage(`AI đang tập trung vào các từ khóa: ${questionConfig.keywords}...`);
      }
      
      // Truyền cả lesson data và mediaFiles vào generator
      const questions = await generateQuestions(
        lessonParsed.parsed, 
        {
          count: questionConfig.count,
          difficulty: questionConfig.difficulty,
          mcqRatio: questionConfig.mcqRatio,
          keywords: questionConfig.keywords,
          language: questionConfig.language,
          optionsCount: questionConfig.optionsCount,
          subject: questionConfig.subject,
          educationLevel: questionConfig.educationLevel,
          languageMode: questionConfig.languageMode,
          questionCategories: questionConfig.questionCategories
        },
        lessonParsed.mediaFiles
      );
      
      setLoadingMessage('Đang kiểm tra tính chính xác và định dạng LaTeX...');
      
      if (questions && questions.length > 0) {
        setQuestionBank(questions);
        saveBankToServer(questions, lessonParsed);
        setShowBankPreview(true);
        alert(questionConfig.language === 'en' ? `Generated ${questions.length} questions successfully!` : `Đã tạo thành công ${questions.length} câu hỏi mới!`);
      } else {
        alert(questionConfig.language === 'en' ? 'Could not generate questions. Try adding more lesson content.' : 'Không thể tạo câu hỏi. Hãy thử nạp nội dung bài học chi tiết hơn.');
      }
    } catch (err: any) {
      console.error(err);
      const errorMsg = err.message || 'Lỗi không xác định';
      alert(questionConfig.language === 'en' 
        ? `AI connection error: ${errorMsg}\nPlease try again.` 
        : `Lỗi khi kết nối với AI để tạo câu hỏi: ${errorMsg}\nVui lòng thử lại.`);
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  // Hàm chuyển đổi LaTeX sang TextRun cho DOCX để hiển thị toán học đẹp hơn trong Word
  const getTextRunsFromLatex = (text: string, TextRun: any) => {
    if (!text) return [new TextRun({ text: "" })];
    // Split theo các cặp $...$ hoặc $$...$$
    const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);
    
    return parts.flatMap(part => {
      const trimmed = part.trim();
      if ((trimmed.startsWith('$') && trimmed.endsWith('$')) || (trimmed.startsWith('$$') && trimmed.endsWith('$$'))) {
        let content = trimmed.startsWith('$$') ? trimmed.slice(2, -2) : trimmed.slice(1, -1);
        
        // Làm sạch các lệnh LaTeX phổ biến để hiển thị văn bản thuần túy đẹp trong Word
        content = content.replace(/\\text\{([\s\S]*?)\}/g, '$1');
        content = content.replace(/\\ce\{([\s\S]*?)\}/g, '$1');
        content = content.replace(/\\frac\{([\s\S]*?)\}\{([\s\S]*?)\}/g, '$1/$2');
        content = content.replace(/\\widehat\{([\s\S]*?)\}/g, '$1');
        content = content.replace(/\\cdot/g, '·');
        content = content.replace(/\\times/g, '×');
        content = content.replace(/\\degree/g, '°');
        content = content.replace(/\\alpha/g, 'α');
        content = content.replace(/\\beta/g, 'β');
        content = content.replace(/\\gamma/g, 'γ');
        content = content.replace(/\\delta/g, 'δ');
        content = content.replace(/\\pi/g, 'π');
        content = content.replace(/\\rightarrow|\\to/g, '→');
        content = content.replace(/\\longleftrightarrow/g, '⟷');
        content = content.replace(/\\Delta/g, 'Δ');
        content = content.replace(/\\sigma/g, 'σ');
        content = content.replace(/\\Omega/g, 'Ω');
        content = content.replace(/\\mu/g, 'μ');
        content = content.replace(/\\pm/g, '±');
        content = content.replace(/\\leq/g, '≤');
        content = content.replace(/\\geq/g, '≥');
        content = content.replace(/\\neq/g, '≠');
        content = content.replace(/\\approx/g, '≈');
        content = content.replace(/\\infty/g, '∞');
        content = content.replace(/\\sum/g, '∑');
        content = content.replace(/\\sqrt\{([\s\S]*?)\}/g, '√($1)');
        content = content.replace(/\\hat\{([\s\S]*?)\}/g, '$1');
        content = content.replace(/\\overline\{([\s\S]*?)\}/g, '$1');
        content = content.replace(/\\underline\{([\s\S]*?)\}/g, '$1');
        content = content.replace(/\\vec\{([\s\S]*?)\}/g, '→$1');
        content = content.replace(/\\sin/g, 'sin');
        content = content.replace(/\\cos/g, 'cos');
        content = content.replace(/\\tan/g, 'tan');
        content = content.replace(/\\cot/g, 'cot');
        content = content.replace(/\\log/g, 'log');
        content = content.replace(/\\ln/g, 'ln');
        content = content.replace(/\\theta/g, 'θ');
        content = content.replace(/\\phi/g, 'φ');
        content = content.replace(/\\omega/g, 'ω');
        content = content.replace(/\\lambda/g, 'λ');
        content = content.replace(/\\tau/g, 'τ');
        content = content.replace(/\\epsilon/g, 'ε');
        content = content.replace(/\\eta/g, 'η');
        content = content.replace(/\\rho/g, 'ρ');
        content = content.replace(/\\chi/g, 'χ');
        content = content.replace(/\\psi/g, 'ψ');
        content = content.replace(/\\zeta/g, 'ζ');
        content = content.replace(/\\xi/g, 'ξ');
        content = content.replace(/\\nu/g, 'ν');
        content = content.replace(/\\kappa/g, 'κ');
        content = content.replace(/\\iota/g, 'ι');
        content = content.replace(/\\partial/g, '∂');
        content = content.replace(/\\nabla/g, '∇');
        content = content.replace(/\\forall/g, '∀');
        content = content.replace(/\\exists/g, '∃');
        content = content.replace(/\\emptyset/g, '∅');
        content = content.replace(/\\in/g, '∈');
        content = content.replace(/\\notin/g, '∉');
        content = content.replace(/\\ni/g, '∋');
        content = content.replace(/\\prod/g, '∏');
        content = content.replace(/\\coprod/g, '∐');
        content = content.replace(/\\int/g, '∫');
        content = content.replace(/\\iint/g, '∬');
        content = content.replace(/\\iiint/g, '∭');
        content = content.replace(/\\oint/g, '∮');
        content = content.replace(/\\oiint/g, '∯');
        content = content.replace(/\\oiiint/g, '∰');
        content = content.replace(/\\propto/g, '∝');
        content = content.replace(/\\angle/g, '∠');
        content = content.replace(/\\parallel/g, '∥');
        content = content.replace(/\\perp/g, '⊥');
        content = content.replace(/\\triangle/g, '△');
        content = content.replace(/\\square/g, '□');
        content = content.replace(/\\diamond/g, '◇');
        content = content.replace(/\\circ/g, '○');
        content = content.replace(/\\bullet/g, '●');
        content = content.replace(/\\ast/g, '∗');
        content = content.replace(/\\star/g, '★');
        content = content.replace(/\\dagger/g, '†');
        content = content.replace(/\\ddagger/g, '‡');
        content = content.replace(/\\S/g, '§');
        content = content.replace(/\\P/g, '¶');
        content = content.replace(/\\copyright/g, '©');
        content = content.replace(/\\textregistered/g, '®');
        content = content.replace(/\\texttrademark/g, '™');
        content = content.replace(/\\pounds/g, '£');
        content = content.replace(/\\yen/g, '¥');
        content = content.replace(/\\euro/g, '€');
        content = content.replace(/\\cent/g, '¢');
        content = content.replace(/\\textbar/g, '|');
        content = content.replace(/\\textbackslash/g, '\\');
        content = content.replace(/\\{/g, '{');
        content = content.replace(/\\}/g, '}');
        content = content.replace(/\\_/g, '_');
        content = content.replace(/\\%/g, '%');
        content = content.replace(/\\&/g, '&');
        content = content.replace(/\\#/g, '#');
        content = content.replace(/\\\$/g, '$');
        
        return [new TextRun({ text: content, italic: true, font: "Cambria Math", color: "2563eb" })];
      }
      return [new TextRun({ text: part })];
    });
  };

  const initiateDownload = (type: 'word' | 'pdf' | 'json') => {
    setPendingDownloadType(type);
    setDownloadInfo({ name: '', class: className });
    setShowDownloadModal(true);
  };

  const confirmDownload = () => {
    setShowDownloadModal(false);
    if (pendingDownloadType === 'word') handleDownloadWord();
    else if (pendingDownloadType === 'pdf') handleDownloadPDF();
    else if (pendingDownloadType === 'json') handleDownloadJSON();
    setPendingDownloadType(null);
  };

  // Hàm xuất Word sử dụng thư viện docx
  const handleDownloadWord = async () => {
    if (questionBank.length === 0) return;
    
    try {
      // Import động thư viện docx
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");

      const children: any[] = [
        new Paragraph({
          text: `NGÂN HÀNG CÂU HỎI - ${downloadInfo.class.toUpperCase() || className.toUpperCase()}`,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Họ và tên: ", bold: true }),
            new TextRun({ text: downloadInfo.name || "................................................" }),
            new TextRun({ text: "   Lớp: ", bold: true }),
            new TextRun({ text: downloadInfo.class || className }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
      ];

      questionBank.forEach((q, idx) => {
        // Nội dung câu hỏi
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `Câu ${idx + 1}: `, bold: true }),
              ...getTextRunsFromLatex(q.content, TextRun),
            ],
            spacing: { before: 200, after: 120 },
          })
        );

        // Hình ảnh nếu có
        if (q.imageIndex !== undefined && q.imageIndex !== null && lessonParsed?.mediaFiles?.[q.imageIndex]) {
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: base64ToArrayBuffer(lessonParsed.mediaFiles[q.imageIndex].data),
                  transformation: {
                    width: 400,
                    height: 300,
                  },
                } as any),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 120, after: 120 },
            })
          );
        }

        // Các lựa chọn
        q.options.forEach((opt, oIdx) => {
          const label = String.fromCharCode(65 + oIdx);
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `${label}. `, bold: true }),
                ...getTextRunsFromLatex(opt, TextRun),
              ],
              indent: { left: 720 },
              spacing: { after: 80 },
            })
          );
        });

        // Đáp án và Giải thích
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "Đáp án đúng: ", bold: true, color: "15803d" }),
              ...getTextRunsFromLatex(q.correctAnswer, TextRun),
            ],
            spacing: { before: 120 },
          })
        );

        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "Lời giải chi tiết: ", bold: true, color: "4b5563" }),
              ...getTextRunsFromLatex(q.explanation, TextRun),
            ],
            spacing: { after: 240 },
          })
        );
      });

      const doc = new Document({
        sections: [{ children }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const namePart = downloadInfo.name ? `${downloadInfo.name.replace(/\s+/g, '_')}_` : '';
      const classPart = (downloadInfo.class || className).replace(/\s+/g, '_');
      const countPart = `${questionBank.length}Cau`;
      link.download = `${namePart}${classPart}_${countPart}_NganHangCauHoi_${new Date().getTime()}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Lỗi xuất Word:", error);
      alert("Có lỗi xảy ra khi tạo file Word.");
    }
  };

  const handleDownloadPDF = async () => {
    if (questionBank.length === 0) return;
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      
      // Tải font hỗ trợ tiếng Việt (Roboto) từ CDN
      const fontUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf";
      const fontRes = await fetch(fontUrl);
      const fontBuffer = await fontRes.arrayBuffer();
      
      // Chuyển đổi ArrayBuffer sang Base64
      const fontBase64 = btoa(
        new Uint8Array(fontBuffer)
          .reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      // Thêm font vào jsPDF
      doc.addFileToVFS("Roboto-Regular.ttf", fontBase64);
      doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
      doc.setFont("Roboto");
      
      doc.setFontSize(16);
      doc.text(`NGÂN HÀNG CÂU HỎI - ${(downloadInfo.class || className).toUpperCase()}`, 105, 20, { align: 'center' });
      
      doc.setFontSize(12);
      doc.text(`Họ và tên: ${downloadInfo.name || '........................'}   Lớp: ${downloadInfo.class || className}`, 105, 30, { align: 'center' });
      
      let y = 45;
      const margin = 15;
      const pageWidth = 210;
      const contentWidth = pageWidth - (margin * 2);
      
      questionBank.forEach((q, idx) => {
        if (y > 260) {
          doc.addPage();
          doc.setFont("Roboto");
          y = 20;
        }
        
        // Loại bỏ các thẻ HTML và ký tự $
        const cleanContent = q.content.replace(/<[^>]*>?/gm, '').replace(/\$/g, '');
        const content = `Câu ${idx + 1}: ${cleanContent}`;
        const lines = doc.splitTextToSize(content, contentWidth);
        doc.text(lines, margin, y);
        y += lines.length * 7;
        
        // Hiển thị các phương án trên cùng 1 hàng
        let optionsRow = "";
        q.options.forEach((opt, oIdx) => {
          const label = String.fromCharCode(65 + oIdx);
          const cleanOpt = opt.replace(/<[^>]*>?/gm, '').replace(/\$/g, '');
          optionsRow += `${label}. ${cleanOpt}    `;
        });
        
        if (y > 260) { doc.addPage(); doc.setFont("Roboto"); y = 20; }
        const optLines = doc.splitTextToSize(optionsRow.trim(), contentWidth - 10);
        doc.text(optLines, margin + 10, y);
        y += optLines.length * 7 + 2;
        
        if (y > 260) { doc.addPage(); doc.setFont("Roboto"); y = 20; }
        doc.setTextColor(21, 128, 61); // Green
        const cleanCorrect = q.correctAnswer.replace(/<[^>]*>?/gm, '').replace(/\$/g, '');
        doc.text(`Đáp án đúng: ${cleanCorrect}`, margin, y);
        doc.setTextColor(0, 0, 0);
        y += 7;
        
        if (y > 260) { doc.addPage(); doc.setFont("Roboto"); y = 20; }
        doc.setTextColor(75, 85, 99); // Gray
        const cleanExpl = q.explanation.replace(/<[^>]*>?/gm, '').replace(/\$/g, '');
        const explText = `Lời giải chi tiết: ${cleanExpl}`;
        const explLines = doc.splitTextToSize(explText, contentWidth);
        doc.text(explLines, margin, y);
        doc.setTextColor(0, 0, 0);
        y += explLines.length * 7 + 10;
      });
      
      const namePart = downloadInfo.name ? `${downloadInfo.name.replace(/\s+/g, '_')}_` : '';
      const classPart = (downloadInfo.class || className).replace(/\s+/g, '_');
      const countPart = `${questionBank.length}Cau`;
      doc.save(`${namePart}${classPart}_${countPart}_NganHangCauHoi_${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error("Lỗi xuất PDF:", error);
      alert("Có lỗi xảy ra khi tạo file PDF. Vui lòng kiểm tra kết nối mạng để tải font.");
    }
  };

  const handleDownloadJSON = () => {
    if (questionBank.length === 0) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(questionBank, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    const namePart = downloadInfo.name ? `${downloadInfo.name.replace(/\s+/g, '_')}_` : '';
    const classPart = (downloadInfo.class || className).replace(/\s+/g, '_');
    const countPart = `${questionBank.length}Cau`;
    downloadAnchorNode.setAttribute("download", `${namePart}${classPart}_${countPart}_NganHangCauHoi_${new Date().getTime()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleUploadBank = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploadingBank(true);
    try {
      let allQuestions: any[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        if (file.type === 'application/pdf') {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1]); 
            };
            reader.readAsDataURL(file);
          });
          
          const questions = await extractQuestionsFromPDF({ data: base64, mimeType: 'application/pdf' });
          if (questions && questions.length > 0) {
            allQuestions = [...allQuestions, ...questions];
          }
        } else {
          const text = await file.text();
          try {
            const data = safeJsonParse(text, []);
            if (Array.isArray(data)) {
              allQuestions = [...allQuestions, ...data];
            } else {
              console.warn(`File ${file.name} không phải là mảng câu hỏi hợp lệ.`);
            }
          } catch (jsonErr) {
            console.error(`Lỗi parse JSON file ${file.name}:`, jsonErr);
          }
        }
      }

      if (allQuestions.length > 0) {
        setQuestionBank(allQuestions);
        saveBankToServer(allQuestions, lessonParsed);
        alert(`Đã tải lên tổng cộng ${allQuestions.length} câu hỏi thành công!`);
      } else {
        alert("Không tìm thấy câu hỏi hợp lệ nào trong các file đã chọn.");
      }
    } catch (error) {
      console.error("Lỗi tải lên ngân hàng:", error);
      alert("Không thể xử lý file. Vui lòng kiểm tra lại định dạng.");
    } finally {
      setIsUploadingBank(false);
    }
    if (bankFileInputRef.current) bankFileInputRef.current.value = '';
  };

  useEffect(() => {
    if (showScoreboard) {
      fetchResultsFromServer();
    }
  }, [showScoreboard]);

  const handleImportStudents = () => {
    const lines = rawStudentInput
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    const newStudents: Student[] = lines.map((line, i) => {
      let name = line;
      let phone = '';
      
      const separators = [':', '-', '|', '–'];
      for (const sep of separators) {
        if (line.includes(sep)) {
          const parts = line.split(sep);
          name = parts[0].trim();
          phone = parts[1].trim();
          if (/\d{3,}/.test(phone)) {
            break;
          } else {
            name = line;
            phone = '';
          }
        }
      }

      return {
        id: `s-${Date.now()}-${i}`,
        name,
        phone: phone || undefined,
        score: 0,
        hasPlayed: false
      };
    });
    
    setStudents(prev => [...prev, ...newStudents]);
    setRawStudentInput('');
  };

  const handleSpin = () => {
    const unplayed = students.filter(s => !s.hasPlayed);
    if (unplayed.length === 0) {
      alert('Tất cả học sinh đã tham gia! Hãy làm mới danh sách.');
      return;
    }
    if (questionsPerTurn <= 0) {
      alert("Vui lòng nhập số câu hỏi mỗi lượt quay!");
      return;
    }
    if (questionBank.length < questionsPerTurn) {
      alert(`Chưa đủ câu hỏi. Cần ít nhất ${questionsPerTurn} câu.`);
      return;
    }
    setIsSpinning(true);
    setTurnFinished(false);
    setIsExamActive(false);
    setCurrentQuestionSet([]);
    setCurrentQuestionIndex(0);
  };

  const handleWheelFinished = (winnerName: string) => {
    setIsSpinning(false);
    const student = students.find(s => s.name === winnerName);
    if (student) {
      const usedQuestionContents = gameHistory.map(h => h.questionContent);
      const availableQuestions = questionBank.filter(q => !usedQuestionContents.includes(q.content));
      
      let selectedQuestions: Question[] = [];
      if (availableQuestions.length < questionsPerTurn) {
        selectedQuestions = [...availableQuestions];
        const remainingNeeded = questionsPerTurn - selectedQuestions.length;
        for(let i=0; i<remainingNeeded; i++) {
          selectedQuestions.push(questionBank[Math.floor(Math.random() * questionBank.length)]);
        }
      } else {
        const shuffled = [...availableQuestions].sort(() => 0.5 - Math.random());
        selectedQuestions = shuffled.slice(0, questionsPerTurn);
      }
      
      setCurrentQuestionSet(selectedQuestions);
      setCurrentQuestionIndex(0);
      setCurrentStudent(student);
      setTimeLeft(30 * questionsPerTurn);
      setTurnFinished(false);
      setCurrentTurnAnswers([]); // Reset answers for new practice turn
    }
  };

  const handleStartExam = () => {
    console.log("handleStartExam called. Bank size:", questionBank.length);
    if (questionBank.length === 0) {
      alert("Bạn hãy TẢI LÊN NGÂN HÀNG CÂU HỎI File.JSON trước khi bấm BẮT ĐẦU");
      return;
    }

    console.log("Starting exam with config:", { examStudentInfo, examQuestionCount, examTimeLimit, bankSize: questionBank.length });
    
    let studentName = examStudentInfo.name.trim();
    if (!studentName) {
      const name = prompt("Nhập Tên học sinh và Lớp ( Cho ví dụ: Họ và Tên + Lớp ) Ví dụ thực: Bảo Minh + Lớp 10A");
      if (name && name.trim()) {
        studentName = name.trim();
        setExamStudentInfo({ ...examStudentInfo, name: studentName });
      } else {
        return;
      }
    }
    
    if (examQuestionCount <= 0) {
      alert("Vui lòng nhập số câu hỏi cho bài thi!");
      return;
    }
    if (examTimeLimit <= 0) {
      alert("Vui lòng nhập thời gian làm bài!");
      return;
    }

    const mockStudent: Student = {
      id: `exam-${Date.now()}`,
      name: studentName,
      score: 0,
      hasPlayed: false
    };

    setIsExamActive(true);
    setCurrentStudent(mockStudent);
    
    // Ghi nhận bắt đầu thi lên Sheet
    syncStartToServer(mockStudent);
    
    // Shuffle and pick requested number of questions
    const shuffledBank = [...questionBank].sort(() => 0.5 - Math.random());
    const selectedQuestions = shuffledBank.slice(0, Math.min(examQuestionCount, questionBank.length));
    
    setCurrentQuestionSet(selectedQuestions);
    setQuestionsUsedHelp([]);
    setCurrentQuestionIndex(0);
    setTimeLeft(examTimeLimit * 60);
    setTurnFinished(false);
    setShowSetup(false);
    setCurrentTurnAnswers([]); // Reset chi tiết câu trả lời
    setSyncStatus('idle');
    setSyncError(null);
    setLastSavedResultId(null);
    setActiveTab('dashboard');
  };

  const handleRetakeIncorrect = () => {
    if (!selectedResultDetail || !selectedResultDetail.details) return;
    
    const incorrectDetails = selectedResultDetail.details.filter(d => !d.isCorrect);

    if (incorrectDetails.length === 0) {
      alert("Bạn đã làm đúng hết tất cả các câu hỏi!");
      return;
    }

    // Map details back to Question objects
    const incorrectQuestions: Question[] = incorrectDetails.map(d => ({
      id: d.questionId,
      type: QuestionType.MCQ,
      content: d.questionContent,
      options: d.options,
      correctAnswer: d.correctAnswer,
      explanation: d.explanation,
      difficulty: Difficulty.MEDIUM,
      imageIndex: d.imageIndex ?? null,
      imageBox: d.imageBox ?? null,
      tag: 'Review'
    }));

    const mockStudent: Student = {
      id: `retake-${Date.now()}`,
      name: selectedResultDetail.name,
      score: 0,
      hasPlayed: false
    };

    setIsExamActive(true);
    setQuestionsUsedHelp([]);
    setCurrentStudent(mockStudent);
    setCurrentQuestionSet(incorrectQuestions);
    setCurrentQuestionIndex(0);
    setTimeLeft(Math.ceil(incorrectQuestions.length * 1.5) * 60);
    setTurnFinished(false);
    setShowSetup(false);
    setCurrentTurnAnswers([]);
    setSyncStatus('idle');
    setSyncError(null);
    setSelectedResultDetail(null);
    setShowOnlyIncorrect(false);
    setActiveTab('exam');
    
    setExamStudentInfo({
      name: selectedResultDetail.name,
      class: selectedResultDetail.className
    });
    setExamQuestionCount(incorrectQuestions.length);
    setExamTimeLimit(Math.ceil(incorrectQuestions.length * 1.5));
  };

  const handleNewSession = () => {
    const newSessionName = `Đợt thi ${new Date().toLocaleString()}`;
    const name = prompt("Nhập tên đợt thi mới:", newSessionName);
    if (name) {
      setCurrentSessionId(name);
      localStorage.setItem('currentSessionId', name);
      // Reset trạng thái học sinh để có thể thi đợt mới
      setStudents(prev => prev.map(s => ({ ...s, hasPlayed: false, score: 0 })));
      setSyncStatus('idle');
      setSyncError(null);
      setLastSavedResultId(null);
      // Sync to server immediately
      saveBankToServer(questionBank, lessonParsed, allowTranslation, name);
      alert(`Đã bắt đầu ${name}. Danh sách học sinh đã được làm mới trạng thái.`);
    }
  };

  const [currentTurnAnswers, setCurrentTurnAnswers] = useState<{
    questionId: string;
    questionContent: string;
    options: string[];
    correctAnswer: string;
    studentAnswer: string;
    isCorrect: boolean;
    explanation: string;
    imageIndex?: number;
    imageBox?: number[];
  }[]>([]);

  const saveExamResult = async (student: Student, correctCount: number, totalCount: number, details?: any[], force = false) => {
    console.log("[Debug] saveExamResult called:", { 
      studentName: student.name, 
      correctCount, 
      totalCount, 
      isExamActive,
      currentSessionId 
    });
    const score = Number(((correctCount / totalCount) * 10).toFixed(1));
    const result: ExamResult = {
      id: 'res-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
      name: student.name,
      className: className,
      score: score,
      totalQuestions: totalCount,
      correctAnswers: correctCount,
      timestamp: Date.now(),
      sessionId: currentSessionId,
      helpCount: questionsUsedHelp.length,
      details: details || [...currentTurnAnswers]
    };
    console.log("[Debug] saveExamResult - Created result object:", result);
    setExamResults(prev => [result, ...prev]);
    return await saveResultToServer(result, force);
  };

  const handleAnswered = async (isCorrect: boolean, selectedOption: string) => {
    if (!currentStudent || currentQuestionSet.length === 0) return;
    
    const currentQ = currentQuestionSet[currentQuestionIndex];
    
    const newAnswer = {
      questionId: currentQ.id,
      questionContent: currentQ.content,
      options: currentQ.options,
      correctAnswer: currentQ.correctAnswer,
      studentAnswer: selectedOption,
      isCorrect: isCorrect,
      explanation: currentQ.explanation,
      imageIndex: currentQ.imageIndex,
      imageBox: currentQ.imageBox
    };
    
    const updatedAnswers = [...currentTurnAnswers, newAnswer];
    setCurrentTurnAnswers(updatedAnswers);

    const newHistoryItem = {
      studentName: currentStudent.name,
      questionContent: currentQ.content,
      isCorrect,
      timestamp: Date.now()
    };
    
    const updatedHistory = [newHistoryItem, ...gameHistory];
    setGameHistory(updatedHistory);

    const currentTurnCorrectCount = updatedAnswers.filter(a => a.isCorrect).length;
    const totalInTurn = currentQuestionSet.length;
    
    const newTenPointScore = Number(((currentTurnCorrectCount / totalInTurn) * 10).toFixed(1));

    setCurrentStudent(prev => prev ? ({ ...prev, score: newTenPointScore }) : null);

    if (!isExamActive) {
      setStudents(prev => prev.map(s => 
        s.id === currentStudent.id 
          ? { ...s, score: newTenPointScore } 
          : s
      ));
    }

    if (currentQuestionIndex < currentQuestionSet.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      console.log("[Debug] handleAnswered - Last question answered. Finishing turn.");
      setTurnFinished(true);
      
      // Lưu kết quả vào bảng điểm (cả ôn tập và thi)
      if (currentStudent) {
        console.log("[Debug] handleAnswered - Saving result for student:", currentStudent.name, "Mode:", isExamActive ? "Exam" : "Practice");
        await saveExamResult(currentStudent, currentTurnCorrectCount, currentQuestionSet.length, updatedAnswers);
      } else {
        console.error("[Debug] handleAnswered - No currentStudent found at end of turn!");
      }
      
      if (!isExamActive) {
        setStudents(prev => prev.map(s => s.id === currentStudent?.id ? { ...s, hasPlayed: true } : s));
      }
      
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(0);
    }
  };

  const correctInTurn = useMemo(() => {
    if (!currentStudent || currentQuestionSet.length === 0) return 0;
    return currentTurnAnswers.filter(a => a.isCorrect).length;
  }, [currentTurnAnswers, currentStudent, currentQuestionSet]);

  useEffect(() => {
    if (timeLeft > 0 && currentQuestionSet.length > 0 && !isSpinning && !turnFinished) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && timerRef.current) {
      clearInterval(timerRef.current);
      if (!turnFinished && currentStudent && currentQuestionSet.length > 0) {
        (async () => {
          await saveExamResult(currentStudent, correctInTurn, currentQuestionSet.length);
          setTurnFinished(true);
          if (isExamActive) {
            alert("Hết thời gian làm bài thi!");
          } else {
            alert("Hết thời gian ôn tập!");
          }
        })();
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timeLeft, currentQuestionSet, isSpinning, turnFinished, isExamActive, currentStudent, correctInTurn]);

  const canSpin = !isSpinning && !isExamActive && students.filter(s => !s.hasPlayed).length > 0 && questionBank.length > 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getResultMessage = (score: number, total: number) => {
    const ratio = score / total;
    const isEn = questionConfig.language === 'en';
    
    const titles = {
      bad: { en: "SORRY!", vi: "XIN CHIA BUỒN!" },
      okay: { en: "KEEP IT UP!", vi: "BẠN HÃY CỐ GẮNG LÊN!" },
      good: { en: "EXCELLENT!", vi: "QUÁ XUẤT SẮC!" }
    };
    
    const descs = {
      bad: { 
        en: "Don't be sad, review more and try again next time!", 
        vi: "Đừng buồn nhé, hãy ôn tập kỹ hơn và hẹn bạn ở lượt sau!" 
      },
      okay: { 
        en: `Aim for max score next time! You got ${score}/${total} correct.`, 
        vi: `Hẹn lần sau đạt kết quả tối đa nhé! Bạn đã đúng ${score}/${total} câu.` 
      },
      good: { 
        en: "You've completely conquered the challenge with a perfect score!", 
        vi: "Bạn đã chinh phục hoàn toàn thử thách với điểm số tuyệt đối!" 
      }
    };

    if (score === 0) {
      return {
        title: isEn ? titles.bad.en : titles.bad.vi,
        titleVi: titles.bad.vi,
        desc: isEn ? descs.bad.en : descs.bad.vi,
        descVi: descs.bad.vi,
        icon: <Frown className="w-10 h-10 text-rose-400" />,
        bgColor: "bg-rose-500/20",
        borderColor: "border-rose-500/30"
      };
    } else if (ratio < 1) {
      return {
        title: isEn ? titles.okay.en : titles.okay.vi,
        titleVi: titles.okay.vi,
        desc: isEn ? descs.okay.en : descs.okay.vi,
        descVi: descs.okay.vi,
        icon: <TrendingUp className="w-10 h-10 text-amber-400" />,
        bgColor: "bg-amber-500/20",
        borderColor: "border-amber-500/30"
      };
    } else {
      return {
        title: isEn ? titles.good.en : titles.good.vi,
        titleVi: titles.good.vi,
        desc: isEn ? descs.good.en : descs.good.vi,
        descVi: descs.good.vi,
        icon: <PartyPopper className="w-10 h-10 text-emerald-400 animate-bounce" />,
        bgColor: "bg-emerald-500/20",
        borderColor: "border-emerald-500/30"
      };
    }
  };

  // Memoize questions with images for the Library tab
  const questionsWithImages = useMemo(() => {
    return questionBank.filter(q => q.imageIndex !== undefined && q.imageIndex !== null);
  }, [questionBank]);

  console.log("[Debug] Rendering App component. isStudentMode:", isStudentMode, "currentStudent:", currentStudent?.name, "isInitialDataLoaded:", isInitialDataLoaded);

  if (!isInitialDataLoaded) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-500/20 animate-bounce">
          <GraduationCap className="w-10 h-10 text-white" />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          <h2 className="text-xl font-black text-white uppercase tracking-tighter">ĐANG TẢI DỮ LIỆU...</h2>
        </div>
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest animate-pulse">Vui lòng đợi trong giây lát</p>
      </div>
    );
  }

  if (isStudentMode && !currentStudent) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 selection:bg-indigo-500/30">
        <div className="glass max-w-md w-full p-8 rounded-[2.5rem] border-indigo-500/30 shadow-2xl animate-in zoom-in-95 duration-500">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-20 h-20 rounded-3xl overflow-hidden mb-4 shadow-xl shadow-indigo-500/20 border-2 border-indigo-500/30">
              <img 
                src="https://res.cloudinary.com/dukjtusv9/image/upload/v1776166988/Conlaso1_-_logo_kc8ie2.jpg" 
                alt="Logo" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">HỆ THỐNG KIỂM TRA</h2>
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Vui lòng nhập thông tin để bắt đầu</p>
          </div>

          <form onSubmit={handleStudentLogin} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Họ và Tên</label>
                <input 
                  type="text"
                  required
                  placeholder="Nhập tên của bạn..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  value={studentLoginInfo.name}
                  onChange={e => setStudentLoginInfo(prev => ({...prev, name: e.target.value}))}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Lớp</label>
                <input 
                  type="text"
                  required
                  placeholder="Nhập lớp (VD: 10A1)..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  value={studentLoginInfo.class}
                  onChange={e => setStudentLoginInfo(prev => ({...prev, class: e.target.value}))}
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoadingBank}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-500/20 uppercase tracking-widest text-sm active:scale-95 flex items-center justify-center gap-2"
            >
              {isLoadingBank ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              BẮT ĐẦU
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Màn hình làm bài của học sinh
  if (isStudentMode && currentStudent) {
    return (
      <div className="min-h-screen bg-[#080c14] flex items-center justify-center p-2 sm:p-4 selection:bg-indigo-500/30">
        <div className="w-full max-w-5xl animate-in fade-in duration-700">
          <div className="glass rounded-[1.5rem] sm:rounded-[2rem] p-2 sm:p-3 border-indigo-500/20 flex flex-col gap-3 sm:gap-4 relative shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            {/* Header nhỏ gọn */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-800/50 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
                  <ClipboardCheck className="w-4 h-4 text-white" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[10px] sm:text-xs font-black text-white uppercase tracking-tight leading-none">BÀI KIỂM TRA</h2>
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-500/20 rounded-full border border-rose-500/40">
                      <div className="relative flex items-center justify-center">
                        <Camera className="w-2.5 h-2.5 text-rose-500" />
                        <div className="absolute -top-0.5 -right-0.5 w-1 h-1 bg-rose-500 rounded-full border border-white animate-pulse"></div>
                      </div>
                      <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest">LIVE</span>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                    TS: <span className="text-indigo-400">{currentStudent?.name}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-4">
                {/* Camera preview nhỏ gọn */}
                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg border border-emerald-500/30 overflow-hidden bg-slate-900 shrink-0 relative shadow-lg">
                  <CameraMonitor 
                    onFrame={handleCameraFrame} 
                    className="w-full h-full object-cover"
                    minimal={true}
                  />
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex flex-col items-center">
                    <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest mb-0.5">Thời gian</span>
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg font-black text-sm border ${timeLeft < 60 ? 'bg-rose-500/20 border-rose-500/50 text-rose-500 animate-pulse' : 'bg-slate-900/80 border-rose-500/30 text-rose-500'}`}>
                      <Timer className="w-3 h-3" />
                      {formatTime(timeLeft)}
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[8px] font-black text-lime-400 uppercase tracking-widest mb-0.5">Đúng</span>
                    <div className="flex items-center px-2 py-0.5 bg-lime-500/10 border border-lime-500/30 rounded-lg">
                      <span className="text-sm font-black text-lime-400 leading-none">{correctInTurn}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {!turnFinished ? (
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-6">
                  <div className="flex-1 h-1.5 bg-slate-800/50 rounded-full overflow-hidden border border-slate-700/30">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-600 to-violet-500 shadow-[0_0_15px_rgba(79,70,229,0.5)] transition-all duration-700 ease-out" 
                      style={{ width: `${((currentQuestionIndex + 1) / currentQuestionSet.length) * 100}%` }}
                    ></div>
                  </div>
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">CÂU {currentQuestionIndex + 1} / {currentQuestionSet.length}</span>
                </div>
                
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <QuestionCard 
                    key={`exam-${currentQuestionIndex}`}
                    question={currentQuestionSet[currentQuestionIndex]} 
                    studentName={currentStudent?.name || ""}
                    onAnswered={handleAnswered}
                    images={lessonParsed?.mediaFiles}
                    allowTranslation={allowTranslation}
                    showHints={showHints}
                  />
                </div>
              </div>
            ) : (
              <div className="glass rounded-[1.5rem] p-6 sm:p-10 border-indigo-500/30 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500">
                {(() => {
                  const msg = getResultMessage(correctInTurn, currentQuestionSet.length);
                  return (
                    <>
                      <div className={`w-16 h-16 ${msg.bgColor} rounded-full flex items-center justify-center mb-4 border-2 ${msg.borderColor} shadow-xl`}>
                        {msg.icon}
                      </div>
                      <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">{msg.title}</h3>
                      <p className="text-indigo-200 text-sm mb-6 font-medium max-w-xs">{msg.desc}</p>
                    </>
                  );
                })()}
                
                <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-8">
                  <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 shadow-inner">
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">Kết quả</p>
                    <p className="text-xl font-black text-white">{correctInTurn} / {currentQuestionSet.length}</p>
                  </div>
                  <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 shadow-inner">
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">Điểm số</p>
                    <p className="text-xl font-black text-indigo-400">
                      {currentStudent?.score.toFixed(1)} / 10.0
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Hệ thống đã ghi nhận kết quả</p>
                </div>

                <div className="mt-8">
                  <button 
                    onClick={() => {
                      if (window.opener) {
                        window.close();
                      } else {
                        // Nếu không thể close tab (do trình duyệt chặn), reset state để về màn hình login
                        setCurrentStudent(null);
                        setIsExamActive(false);
                        setTurnFinished(false);
                        window.location.href = '/exam';
                      }
                    }}
                    className="group flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl transition-all duration-300"
                  >
                    <span className="text-red-400 font-black uppercase tracking-widest text-[10px]">Thoát Tab</span>
                    <X className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-x-hidden p-4 md:p-8">
      {/* Setup Modal */}
      {showSetup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="glass w-full max-w-2xl rounded-3xl p-8 border-indigo-500/30 shadow-2xl overflow-hidden relative">
            <button onClick={() => setShowSetup(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-3 mb-6">
              <Settings2 className="w-8 h-8 text-indigo-400" />
              <h2 className="text-3xl font-black font-heading tracking-tighter uppercase">CẤU HÌNH & HƯỚNG DẪN</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto max-h-[70vh] pr-2 custom-scrollbar">
              <div className="space-y-6">
                <div>
                  <h3 className="text-indigo-400 font-black text-sm uppercase mb-3 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4" /> Cách chơi
                  </h3>
                  <ul className="space-y-3 text-xs text-slate-400 leading-relaxed list-decimal list-inside">
                    <li>Nạp bài học bằng cách dán văn bản hoặc tải file Ảnh/PDF/Word.</li>
                    <li>Nhấn "Trích xuất" để AI phân tích kiến thức trọng tâm.</li>
                    <li>Thiết lập mức độ và số lượng câu hỏi rồi nhấn "Tạo ngân hàng".</li>
                    <li>Nhập danh sách học sinh (hoặc tải file danh sách).</li>
                    <li>Nhấn "Quay ngay" để chọn học sinh trả lời thử thách.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-indigo-400 font-black text-sm uppercase mb-3 flex items-center gap-2">
                    <RotateCw className="w-4 h-4" /> Vòng quay nâng cao
                  </h3>
                  <label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Số câu hỏi mỗi lượt quay</label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="number" min="1" max="5"
                      className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 w-20 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                      value={questionsPerTurn === 0 ? '' : questionsPerTurn}
                      onChange={e => setQuestionsPerTurn(e.target.value === '' ? 0 : parseInt(e.target.value))}
                    />
                    <span className="text-[10px] text-slate-500 italic">Mặc định: 1 câu/lượt</span>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                  <h3 className="text-indigo-400 font-black text-sm uppercase mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Kiểm tra hệ thống
                  </h3>
                  <div className="space-y-3">
                    <button 
                      disabled={testStatus.type === 'loading'}
                      onClick={async () => {
                        setTestStatus({ type: 'loading', message: 'Đang kiểm tra kết nối máy chủ...' });
                        try {
                          const res = await safeFetchJson(`${API_BASE}/api/test-post`, {
                            method: 'POST',
                            body: JSON.stringify({ test: true, time: new Date().toISOString() })
                          });
                          setTestStatus({ 
                            type: res.success ? 'success' : 'error', 
                            message: `Kết nối POST: ${res.success ? 'THÀNH CÔNG' : 'THẤT BẠI'}. ${res.message || ''}` 
                          });
                        } catch (e: any) {
                          setTestStatus({ type: 'error', message: `Lỗi kết nối: ${e.message}` });
                        }
                      }}
                      className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-black uppercase rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      KIỂM TRA KẾT NỐI MÁY CHỦ
                    </button>

                    <button 
                      disabled={testStatus.type === 'loading'}
                      onClick={async () => {
                        setTestStatus({ type: 'loading', message: 'Đang kiểm tra Google Sheet...' });
                        try {
                          const res = await safeFetchJson(`${API_BASE}/api/test-sheet`, { method: 'POST' });
                          setTestStatus({ 
                            type: res.success ? 'success' : 'error', 
                            message: `Google Sheet: ${res.success ? 'THÀNH CÔNG' : 'THẤT BẠI'}. Status: ${res.status}` 
                          });
                        } catch (e: any) {
                          setTestStatus({ type: 'error', message: `Lỗi: ${e.message}` });
                        }
                      }}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Table className="w-3.5 h-3.5" />
                      KIỂM TRA GOOGLE SHEET
                    </button>

                    {testStatus.type !== 'idle' && (
                      <div className={`p-3 rounded-xl text-[10px] font-bold border ${
                        testStatus.type === 'loading' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' :
                        testStatus.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                        'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}>
                        {testStatus.message}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                  <h3 className="text-emerald-400 font-black text-sm uppercase mb-3 flex items-center gap-2">
                    <Key className="w-4 h-4" /> API Key cá nhân
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trạng thái</span>
                      {hasSelectedKey ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20">
                          <CheckCircle className="w-3 h-3" /> ĐÃ KẾT NỐI
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded-full border border-rose-400/20">
                          <AlertCircle className="w-3 h-3" /> CHƯA CÓ KEY
                        </span>
                      )}
                    </div>
                    
                    <button 
                      onClick={handleSelectApiKey}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black uppercase rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      CHỌN API KEY CÁ NHÂN
                    </button>

                    <a 
                      href="https://ai.google.dev/gemini-api/docs/billing" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 text-[9px] text-slate-500 hover:text-indigo-400 transition-colors uppercase font-bold tracking-tighter"
                    >
                      Hướng dẫn thiết lập thanh toán <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>

                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                  <h3 className="text-indigo-400 font-black text-sm uppercase mb-3 flex items-center gap-2">
                    <LinkIcon className="w-4 h-4" /> Google Sheet Sync
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1.5 ml-1">Web App URL (Apps Script)</label>
                      <input 
                        type="text"
                        placeholder="Dán link Apps Script (.exec)..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-[10px] text-white font-mono outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                        value={googleSheetUrl}
                        onChange={e => setGoogleSheetUrl(e.target.value)}
                      />
                      <p className="mt-2 text-[8px] text-slate-500 leading-relaxed italic">
                        * Lưu ý: Phải dùng link kết thúc bằng /exec từ Google Apps Script.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <button 
              onClick={handleSaveConfig}
              className="w-full mt-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-500/20"
            >
              LƯU CẤU HÌNH
            </button>
          </div>
        </div>
      )}

      {!isExamActive && (
        <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg neon-glow border-2 border-indigo-500/30">
              <img 
                src="https://res.cloudinary.com/dukjtusv9/image/upload/v1776166988/Conlaso1_-_logo_kc8ie2.jpg" 
                alt="Logo" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h1 className="text-4xl font-bold font-heading neon-text tracking-tight uppercase leading-none">CÔ HUYỀN PRO</h1>
              <p className="text-indigo-400 font-black uppercase tracking-widest text-[10px] mt-1 text-shadow-sm opacity-80">Ôn tập & Học tập vui nhộn</p>
            </div>
          </div>
          
          <div className="flex gap-4 items-center">
            <button 
              onClick={() => setShowSetup(true)}
              className="px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl transition-all shadow-lg shadow-rose-500/20 uppercase tracking-tighter flex items-center gap-2 border-2 border-rose-400/30"
            >
              <Settings2 className="w-5 h-5" />
              Cài đặt
            </button>

            <div className="glass px-6 py-3 rounded-2xl flex items-center gap-3">
              <Trophy className="w-5 h-5 text-amber-400" />
              <div>
                <p className="text-xs text-slate-400 uppercase font-bold">ĐIỂM CAO NHẤT</p>
                <p className="text-xl font-bold text-white">
                  {students.length > 0 ? Math.max(...students.map(s => s.score)).toFixed(1) : "0.0"}
                </p>
              </div>
            </div>
            <div className="glass px-6 py-3 rounded-2xl flex items-center gap-3">
              <Users className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-xs text-slate-400 uppercase font-bold">TỈ LỆ THAM GIA</p>
                <p className="text-xl font-bold text-white">
                  {students.filter(s => s.hasPlayed).length} / {students.length}
                </p>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Tab Navigation */}
      {!isExamActive && (
        <div className="max-w-7xl mx-auto mb-10 relative group">
          <div 
            ref={navScrollRef}
            className="flex gap-4 animate-in fade-in slide-in-from-left-4 duration-700 overflow-x-auto pb-4 px-4 lg:px-0 flex-nowrap custom-scrollbar"
          >
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border-2 flex items-center gap-3 whitespace-nowrap flex-shrink-0 ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white border-indigo-400 shadow-xl shadow-indigo-500/20 scale-105' : 'bg-slate-900/50 text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-300'}`}
            >
              <Layers className="w-4 h-4" />
              Quản lý giáo viên
            </button>
            <button 
              onClick={() => setActiveTab('monitoring')}
              className={`px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border-2 flex items-center gap-3 relative whitespace-nowrap flex-shrink-0 ${activeTab === 'monitoring' ? 'bg-rose-600 text-white border-rose-400 shadow-xl shadow-rose-500/20 scale-105' : 'bg-slate-900/50 text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-300'}`}
            >
              <div className="relative">
                <Monitor className="w-4 h-4" />
                {monitoredStudents.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_5px_rgba(52,211,153,0.8)]"></span>
                )}
              </div>
              Giám sát thi
              <span className={`ml-1 px-2 py-0.5 rounded-lg text-[10px] font-black ${activeTab === 'monitoring' ? 'bg-white/20' : 'bg-slate-800'}`}>
                {monitoredStudents.length}
              </span>
            </button>

            <button 
              onClick={() => setActiveTab('flashcards')}
              className={`px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border-2 flex items-center gap-3 whitespace-nowrap flex-shrink-0 ${activeTab === 'flashcards' ? 'bg-indigo-600 text-white border-indigo-400 shadow-xl shadow-indigo-500/20 scale-105' : 'bg-slate-900/50 text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-300'}`}
            >
              <Zap className="w-4 h-4" />
              Flashcards
            </button>

            <button 
              onClick={handleSelectExamTab}
              className={`px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-3 whitespace-nowrap flex-shrink-0 ${
                activeTab === 'exam' 
                  ? 'bg-yellow-600 text-white border-2 border-yellow-400 shadow-xl shadow-yellow-500/20 scale-105' 
                  : questionBank.length > 0
                    ? 'bg-gradient-to-b from-yellow-300 via-yellow-400 to-yellow-500 text-yellow-950 border-b-4 border-yellow-700 shadow-[0_4px_0_0_rgba(161,98,7,1)] hover:from-yellow-200 hover:via-yellow-300 hover:to-yellow-400 active:border-b-0 active:translate-y-[4px]'
                    : 'bg-slate-900/50 text-slate-500 border-2 border-slate-800 hover:border-slate-700 hover:text-slate-300'
              }`}
            >
              {questionBank.length > 0 ? <CheckCircle className="w-4 h-4" /> : <GraduationCap className="w-4 h-4" />}
              Chế độ bài thi
            </button>
          </div>
          
          {/* Mobile Scroll Hint Arrow */}
          <button 
            onClick={scrollNavToEnd}
            className="lg:hidden absolute right-2 top-1/2 -translate-y-1/2 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500/50 p-2 rounded-full text-emerald-400 animate-pulse z-10 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
            title="Cuộn đến Chế độ bài thi"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Mobile Quick Access Button for Exam Mode */}
      {!isExamActive && (
        <div className="lg:hidden px-4 mb-8 -mt-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
          <button
            onClick={handleSelectExamTab}
            className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-4 group ${
              activeTab === 'exam' 
                ? 'bg-yellow-600 text-white border-2 border-yellow-400 shadow-[0_0_25px_rgba(202,138,4,0.3)]' 
                : questionBank.length > 0
                  ? 'bg-gradient-to-b from-yellow-300 via-yellow-400 to-yellow-500 text-yellow-950 border-b-4 border-yellow-700 shadow-[0_4px_0_0_rgba(161,98,7,1)] active:border-b-0 active:translate-y-[4px]'
                  : 'bg-slate-900/80 text-yellow-400 border-2 border-yellow-500/30 hover:border-yellow-500/60 shadow-lg'
            }`}
          >
            <div className={`p-2 rounded-xl group-hover:scale-110 transition-transform ${questionBank.length > 0 ? 'bg-amber-950/10' : 'bg-amber-500/20'}`}>
              {questionBank.length > 0 ? <CheckCircle className="w-6 h-6 text-amber-900" /> : <GraduationCap className="w-6 h-6" />}
            </div>
            <span>Chế độ bài thi</span>
            <ArrowRight className="w-5 h-5 opacity-50 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      )}

      {isExamActive || activeTab === 'dashboard' ? (
        <main className={`max-w-[1600px] mx-auto grid grid-cols-1 ${isExamActive ? 'lg:grid-cols-1' : 'lg:grid-cols-12'} gap-8 items-start`}>
        
        {/* Cột 1: Bài học & Ngân hàng câu hỏi */}
        {!isExamActive && (
          <section className="lg:col-span-3 flex flex-col gap-6 h-full">
            <div className="glass rounded-3xl p-6 border-indigo-500/20">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-indigo-400" />
                    <h2 className="text-xl font-bold font-heading">Nạp Bài Học</h2>
                  </div>
                  {/* FIX: Nút dự án mới được thiết kế lại theo đúng ảnh mẫu và đảm bảo hoạt động */}
                  <button 
                    type="button"
                    onClick={handleNewProject}
                    className="bg-slate-900/80 hover:bg-rose-950/40 border border-rose-500/40 px-3 py-1.5 rounded-xl transition-all flex flex-col items-center justify-center min-w-[70px] shadow-lg group active:scale-95"
                    title="Tạo dự án mới"
                  >
                    <RefreshCcw className="w-4 h-4 text-rose-500 mb-0.5 group-hover:rotate-180 transition-transform duration-500" />
                    <div className="flex flex-col items-center leading-none">
                      <span className="text-[9px] text-rose-500 font-black uppercase tracking-tighter">DỰ ÁN</span>
                      <span className="text-[9px] text-rose-500 font-black uppercase tracking-tighter">MỚI</span>
                    </div>
                  </button>
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-wider"
                >
                  <Upload className="w-4 h-4" />
                  Tải file
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  multiple 
                  accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={handleFileChange}
                />
              </div>
              
              <textarea
                className="w-full h-32 bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all mb-4 shadow-inner"
                placeholder="Dán nội dung bài học tại đây..."
                value={lessonRaw}
                onChange={(e) => setLessonRaw(e.target.value)}
              />

              {uploadedFiles.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {uploadedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 rounded-lg px-2 py-1 text-[10px] animate-in slide-in-from-left-2">
                      <File className="w-3 h-3 text-indigo-400" />
                      <span className="truncate max-w-[80px] text-slate-300">{file.name}</span>
                      <button onClick={() => removeFile(idx)} className="text-slate-500 hover:text-rose-400 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <button
                disabled={isExtracting || (!lessonRaw && uploadedFiles.length === 0)}
                onClick={handleExtractLesson}
                className={`w-full py-3 ${
                  questionBank.length > 0 
                    ? "bg-emerald-600 hover:bg-emerald-500" 
                    : "bg-indigo-600 hover:bg-indigo-500"
                } disabled:bg-slate-700 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 text-sm active:scale-95`}
              >
                {isExtracting ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="animate-pulse">{loadingMessage || 'Đang trích xuất...'}</span>
                  </div>
                ) : (
                  <>
                    {questionBank.length > 0 ? <CheckCircle className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {questionBank.length > 0 ? 'Ngân hàng câu hỏi Json đã nạp' : 'TRÍCH XUẤT & PHÂN TÍCH'}
                  </>
                )}
              </button>

              {/* NÚT TẢI LÊN NGÂN HÀNG - 3D GOLD STYLE */}
              <div className="mt-3">
                <input 
                  type="file" 
                  ref={bankFileInputRef} 
                  onChange={handleUploadBank} 
                  className="hidden" 
                  accept=".json,.pdf"
                  multiple
                />
                <button
                  disabled={isUploadingBank}
                  onClick={() => bankFileInputRef.current?.click()}
                  className={`w-full py-3 ${
                    questionBank.length > 0 
                      ? "bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-700 hover:from-emerald-300 hover:via-emerald-400 hover:to-emerald-600 text-white border-emerald-800" 
                      : "bg-gradient-to-b from-amber-300 via-amber-400 to-amber-600 hover:from-amber-200 hover:via-amber-300 hover:to-amber-500 text-amber-950 border-amber-800"
                  } border-b-4 rounded-xl font-black transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest shadow-xl active:border-b-0 active:translate-y-[4px] disabled:opacity-50`}
                >
                  {isUploadingBank ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : questionBank.length > 0 ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {isUploadingBank 
                    ? 'Đang trích xuất...' 
                    : questionBank.length > 0 
                      ? 'Ngân hàng câu hỏi Json đã nạp' 
                      : 'TẢI LÊN NGÂN HÀNG (.JSON, .PDF)'}
                </button>
              </div>

              {lessonParsed && !isExtracting && (
                <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl animate-in fade-in slide-in-from-top-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-emerald-400 font-bold text-xs">Đã nạp kiến thức!</span>
                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">{lessonParsed.parsed.summary}</p>
                </div>
              )}
            </div>

            <div className="glass rounded-3xl p-6 border-indigo-500/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 px-3 py-1 bg-indigo-500 text-[8px] font-black text-white uppercase tracking-tighter rounded-bl-xl shadow-lg z-10">
                Mới
              </div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-xl font-bold font-heading">Cấu hình câu hỏi</h2>
                </div>
                <button 
                  onClick={() => setShowConfigModal(true)}
                  className="p-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl transition-all active:scale-90"
                  title="Mở cấu hình chi tiết"
                >
                  <ExternalLink className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div 
                  onClick={() => setShowConfigModal(true)}
                  className="p-4 bg-slate-800/50 border border-slate-700 rounded-2xl cursor-pointer hover:border-indigo-500/50 transition-all group/card"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Môn học</span>
                    <span className="text-xs font-bold text-indigo-400">{questionConfig.subject || 'Chưa đặt'}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Số lượng</span>
                    <span className="text-xs font-bold text-indigo-400">{questionConfig.count} câu</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Loại câu hỏi</span>
                    <div className="flex flex-wrap justify-end gap-1 max-w-[150px]">
                      {questionConfig.questionCategories.map(cat => (
                        <span key={cat} className="text-[8px] px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-md border border-indigo-500/30 whitespace-nowrap">
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-700/50 flex justify-center">
                    <span className="text-[8px] font-black text-indigo-500/50 uppercase tracking-widest group-hover/card:text-indigo-400 transition-colors">Nhấn để thay đổi chi tiết</span>
                  </div>
                </div>

                <button
                  onClick={() => setShowConfigModal(true)}
                  className="w-full py-3 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/40 rounded-xl font-black transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest shadow-lg shadow-indigo-500/5"
                >
                  <Settings2 className="w-4 h-4" />
                  CHỈNH SỬA CẤU HÌNH
                </button>

                <div className="flex flex-col gap-3 pt-2 border-t border-slate-700/50">
                  <button
                    disabled={isGeneratingQuestions || !lessonParsed}
                    onClick={handleGenerateBank}
                    className="w-full py-3 bg-slate-200 hover:bg-white text-slate-900 disabled:bg-slate-700 disabled:text-slate-400 rounded-xl font-black transition-all flex items-center justify-center gap-2 text-sm shadow-lg active:scale-95 uppercase"
                  >
                    {isGeneratingQuestions ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="animate-pulse">{loadingMessage || 'Đang tạo câu hỏi...'}</span>
                      </div>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        {questionConfig.language === 'en' ? 'GENERATE QUESTION BANK' : 'TẠO NGÂN HÀNG CÂU HỎI'}
                      </>
                    )}
                  </button>

                  {/* NÚT TẢI XUỐNG FILE WORD & PDF & JSON - YÊU CẦU MỚI */}
                  {questionBank.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 animate-in slide-in-from-top-2">
                      <button
                        onClick={() => initiateDownload('word')}
                        className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black transition-all flex items-center justify-center gap-2 text-[10px] shadow-lg active:scale-95 uppercase"
                        title="Tải file Word (.docx)"
                      >
                        <Download className="w-4 h-4" />
                        WORD
                      </button>
                      <button
                        onClick={() => initiateDownload('pdf')}
                        className="py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-black transition-all flex items-center justify-center gap-2 text-[10px] shadow-lg active:scale-95 uppercase"
                        title="Tải file PDF (.pdf)"
                      >
                        <Download className="w-4 h-4" />
                        PDF
                      </button>
                      <button
                        onClick={() => initiateDownload('json')}
                        className="py-3 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl font-black transition-all flex items-center justify-center gap-2 text-[10px] shadow-lg active:scale-95 uppercase"
                        title="Tải file JSON (.json)"
                      >
                        <Download className="w-4 h-4" />
                        JSON
                      </button>
                    </div>
                  )}
                </div>

                {/* Ngân hàng câu hỏi Preview - SỬ DỤNG LatexRenderer */}
                {questionBank.length > 0 && (
                  <div className="mt-4 border-t border-slate-800 pt-4 animate-in fade-in slide-in-from-top-2">
                    <div 
                      onClick={() => setShowBankPreview(!showBankPreview)}
                      className="w-full flex items-center justify-between p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl hover:bg-indigo-500/20 transition-all group cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setShowBankPreview(!showBankPreview);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <ListFilter className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-bold text-indigo-200">
                          {questionConfig.language === 'en' ? `Question Bank (${questionBank.length})` : `Xem ngân hàng (${questionBank.length} câu)`}
                        </span>
                        {questionBank.length > 0 && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded text-[8px] text-emerald-400 font-black uppercase tracking-tighter">
                            <CheckCircle className="w-2 h-2" /> Đã lưu
                          </span>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            fetchBankFromServer();
                          }}
                          className="p-1 hover:bg-indigo-500/30 rounded-md transition-colors"
                          title="Làm mới từ máy chủ"
                        >
                          <RefreshCcw className={`w-3 h-3 text-indigo-400 ${isLoadingBank ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                      {showBankPreview ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4 text-indigo-400" />}
                    </div>

                    {showBankPreview && (
                      <div className="mt-2 max-h-[400px] overflow-y-auto pr-2 space-y-3 custom-scrollbar animate-in slide-in-from-top-1">
                        {questionBank.map((q, idx) => {
                          const qImageData = (q.imageIndex !== undefined && q.imageIndex !== null && lessonParsed?.mediaFiles?.[q.imageIndex]) 
                            ? `data:${lessonParsed.mediaFiles[q.imageIndex].mimeType};base64,${lessonParsed.mediaFiles[q.imageIndex].data}` 
                            : null;
                          
                          return (
                            <div key={idx} className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl text-[10px] hover:border-indigo-500/40 transition-colors group relative overflow-hidden">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-indigo-400 font-black uppercase tracking-widest text-[8px] px-2 py-0.5 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                                  {questionConfig.language === 'en' ? 'Q' : 'Câu'} {idx + 1}
                                </span>
                                {qImageData && (
                                  <span className="flex items-center gap-1 text-emerald-400 font-black text-[7px] uppercase tracking-tighter">
                                    <ImageIcon className="w-2.5 h-2.5" /> Có hình ảnh
                                  </span>
                                )}
                              </div>
                              
                              <div className="flex gap-3">
                                <div className="flex-1 overflow-x-auto custom-scrollbar pb-2">
                                  <div className="text-slate-200 leading-relaxed font-medium">
                                    <LatexRenderer text={q.content} />
                                  </div>
                                </div>
                                {qImageData && (
                                  <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden border border-slate-700 bg-slate-950/50 p-1 flex items-center justify-center">
                                    {q.imageBox ? (
                                      <CroppedImage src={qImageData} box={q.imageBox} alt="Thumb" className="w-full h-full rounded" />
                                    ) : (
                                      <img src={qImageData} alt="Thumb" className="max-w-full max-h-full object-contain rounded" />
                                    )}
                                  </div>
                                )}
                              </div>
                              
                              <div className="mt-2 pt-2 border-t border-slate-800/50 flex justify-between opacity-50 group-hover:opacity-100 transition-opacity">
                                 <span className="text-[7px] text-slate-500 uppercase">{q.difficulty}</span>
                                 <span className="text-[7px] text-emerald-500/80 font-bold">ĐA: {q.correctAnswer.substring(0, 15)}...</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Cột 2: Vòng quay & Bài thi đang diễn ra */}
        <section className={`${isExamActive ? 'lg:col-span-12 max-w-4xl mx-auto w-full' : 'lg:col-span-6'} flex flex-col gap-8`}>
          {isExamActive ? (
            <div className="glass rounded-3xl p-4 sm:p-6 border-indigo-500/30 flex flex-col gap-4 sm:gap-6 relative shadow-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-4">
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex p-2 bg-indigo-600 rounded-lg shrink-0">
                    <ClipboardCheck className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex flex-col w-full sm:w-auto">
                    <div className="flex items-center justify-between sm:justify-start gap-4">
                      <h2 className="text-[10px] sm:text-xl font-black text-white uppercase tracking-tighter leading-none">BÀI KIỂM TRA ĐANG DIỄN RA</h2>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/20 rounded-full border border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.3)]">
                          <div className="relative flex items-center justify-center">
                            <Camera className="w-4 h-4 text-rose-500" />
                            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-rose-500 rounded-full border border-white animate-pulse shadow-[0_0_5px_rgba(244,63,94,1)]"></div>
                          </div>
                          <span className="text-[11px] font-black text-rose-500 uppercase tracking-widest">LIVE</span>
                        </div>
                        {/* Mắt camera giáo viên xem nhỏ gọn */}
                        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg border-2 border-emerald-500/50 overflow-hidden bg-slate-900 shadow-lg shadow-emerald-500/20 shrink-0 relative">
                          {monitoredStudents.find(s => s.studentId === currentStudent?.id)?.lastFrame ? (
                            <img 
                              src={`data:image/jpeg;base64,${monitoredStudents.find(s => s.studentId === currentStudent?.id)?.lastFrame}`} 
                              className="w-full h-full object-cover"
                              alt="Student Camera"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-slate-800">
                              <Loader2 className="w-3 h-3 text-slate-600 animate-spin" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Thí sinh: <span className="text-indigo-400">{currentStudent?.name}</span></p>
                    <div className="flex flex-col gap-1 mt-1.5">
                      <p className="text-[8px] sm:text-[9px] text-emerald-500 font-black uppercase tracking-widest leading-none">● Đang giám sát camera trực tiếp</p>
                      <p className="text-[8px] sm:text-[9px] text-rose-500 font-black uppercase tracking-widest leading-none">● Cảnh báo: Không được rời khỏi màn hình</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 w-full sm:w-auto">
                  <div className="flex flex-col items-start sm:items-end">
                    <span className="text-[7px] sm:text-[8px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Mật khẩu thoát</span>
                    <input 
                      type="password"
                      placeholder="****"
                      value={exitPassword}
                      onChange={(e) => {
                        const val = e.target.value;
                        setExitPassword(val);
                        if (val === '2021') {
                          // Tự động lưu kết quả nếu đang thi dở
                          if (currentStudent && currentTurnAnswers.length > 0 && !turnFinished) {
                            const correctCount = currentTurnAnswers.filter(a => a.isCorrect).length;
                            saveExamResult(currentStudent, correctCount, currentQuestionSet.length, currentTurnAnswers);
                          }
                          if (timerRef.current) clearInterval(timerRef.current);
                          setIsExamActive(false);
                          setActiveTab('dashboard');
                          setExitPassword('');
                        }
                      }}
                      className="w-12 sm:w-16 px-1 sm:px-1.5 py-0.5 sm:py-1 bg-slate-900 border border-slate-800 rounded-lg text-[10px] sm:text-xs text-center font-black text-indigo-400 placeholder:text-slate-700 focus:outline-none focus:border-indigo-500 transition-all shadow-inner"
                    />
                  </div>
                  <button 
                    onClick={toggleFullScreen}
                    className="px-1.5 sm:px-2 py-0.5 sm:py-1 border border-rose-500/50 rounded-lg bg-rose-500/10 text-rose-500 text-[7px] sm:text-[9px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all active:scale-95 shadow-lg shadow-rose-500/10 self-end"
                  >
                    Full màn
                  </button>
                  <div className="flex flex-row sm:flex-col items-center sm:items-end gap-1.5 sm:gap-1 self-end">
                    <div className="flex flex-row items-center gap-1.5 px-2 py-1 bg-slate-900/80 border border-rose-500/30 rounded-xl shadow-lg">
                      <span className="hidden sm:block text-[8px] font-black text-rose-500 uppercase tracking-widest">Thời gian:</span>
                      <div className={`flex items-center gap-1 font-black text-sm sm:text-lg ${timeLeft < 60 ? 'text-rose-500 animate-pulse' : 'text-rose-500'}`}>
                        <Timer className="w-3 h-3 sm:w-4 sm:h-4" />
                        {formatTime(timeLeft)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 bg-lime-500/10 border border-lime-500/30 rounded-full">
                      <span className="text-[8px] sm:text-[9px] font-black text-lime-400 uppercase tracking-widest">Đúng:</span>
                      <span className="text-sm sm:text-base font-black text-lime-400 leading-none">{correctInTurn}</span>
                    </div>
                  </div>
                </div>
              </div>

              {!turnFinished ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4 px-2">
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all duration-500" 
                        style={{ width: `${((currentQuestionIndex + 1) / currentQuestionSet.length) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">Câu {currentQuestionIndex + 1} / {currentQuestionSet.length}</span>
                  </div>
                  <QuestionCard 
                    key={`exam-${currentQuestionIndex}`}
                    question={currentQuestionSet[currentQuestionIndex]} 
                    studentName={currentStudent?.name || ""}
                    onAnswered={handleAnswered}
                    images={lessonParsed?.mediaFiles}
                    allowTranslation={allowTranslation}
                    showHints={showHints}
                  />

                  {/* Icon Copy Link (Bảo mật) */}
                  <div className="absolute bottom-4 right-4 flex items-center gap-2 z-50">
                    {showCopyPasswordInput && (
                      <input 
                        type="password"
                        placeholder="Pass..."
                        autoFocus
                        value={copyPassword}
                        onChange={(e) => handleCopyPasswordChange(e.target.value)}
                        onBlur={() => {
                          if (!copyPassword) setShowCopyPasswordInput(false);
                        }}
                        className="w-20 px-2 py-1 bg-slate-900 border border-indigo-500/50 rounded-lg text-[10px] text-white focus:outline-none animate-in slide-in-from-right-2"
                      />
                    )}
                    <button 
                      onClick={handleSecureCopyLink}
                      className="p-2 text-indigo-400 hover:text-indigo-300 transition-all opacity-80 hover:opacity-100 bg-slate-900/80 rounded-lg border border-indigo-500/30 hover:border-indigo-500/60 shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_20px_rgba(99,102,241,0.5)]"
                      title="Copy link bài thi (Yêu cầu mật khẩu)"
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="glass rounded-3xl p-10 border-indigo-500/40 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500">
                  {(() => {
                    const msg = getResultMessage(correctInTurn, currentQuestionSet.length);
                    return (
                      <>
                        <div className={`w-20 h-20 ${msg.bgColor} rounded-full flex items-center justify-center mb-6 border-4 ${msg.borderColor}`}>
                          {msg.icon}
                        </div>
                        <h3 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">{msg.title}</h3>
                        {questionConfig.language === 'en' && <p className="text-indigo-400 text-sm font-bold -mt-2 mb-2 uppercase tracking-tight">{msg.titleVi}</p>}
                        <p className="text-indigo-200 text-lg mb-6 font-medium">{msg.desc}</p>
                        {questionConfig.language === 'en' && <p className="text-slate-400 text-sm italic -mt-5 mb-6">{msg.descVi}</p>}
                      </>
                    );
                  })()}
                  
                  <div className="grid grid-cols-2 gap-4 w-full max-sm:grid-cols-1 max-w-sm mb-6">
                    <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Kết quả</p>
                      <p className="text-2xl font-black text-white">{correctInTurn} / {currentQuestionSet.length}</p>
                    </div>
                    <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Quy chuẩn Điểm</p>
                      <p className="text-2xl font-black text-indigo-400">
                        {currentStudent?.score.toFixed(1)} / 10.0
                      </p>
                    </div>
                  </div>

                  {/* Trạng thái đồng bộ Google Sheet */}
                  <div className="mb-6 w-full max-w-sm flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-slate-900/30 border border-slate-800/50">
                    {syncStatus === 'syncing' && (
                      <>
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                        <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Đang đồng bộ Google Sheet...</span>
                      </>
                    )}
                    {syncStatus === 'success' && (
                      <>
                        <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                        <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Đã lưu điểm vào Google Sheet</span>
                      </>
                    )}
                    {syncStatus === 'error' && (
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-rose-500 rounded-full animate-ping"></div>
                          <span className="text-[10px] text-rose-400 font-bold uppercase tracking-widest">Lỗi lưu điểm! Hãy nhấn gửi lại</span>
                        </div>
                        {syncError && <p className="text-[9px] text-rose-500/70 mt-1 font-mono">{syncError}</p>}
                      </div>
                    )}
                    {syncStatus === 'idle' && (
                      <>
                        <div className="w-2 h-2 bg-slate-600 rounded-full"></div>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Chờ đồng bộ...</span>
                      </>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-3 w-full max-w-sm">
                    <button 
                      disabled={isSavingResult}
                      onClick={async () => {
                        if (currentStudent && turnFinished) {
                          const correctCount = currentTurnAnswers.filter(a => a.isCorrect).length;
                          await saveExamResult(currentStudent, correctCount, currentQuestionSet.length, currentTurnAnswers, true);
                        }
                      }}
                      className={`px-10 py-3 font-bold rounded-2xl transition-all border text-xs uppercase tracking-widest ${
                        isSavingResult ? "bg-slate-700 text-slate-500 border-slate-600" : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                      }`}
                    >
                      {isSavingResult ? "ĐANG LƯU..." : "GỬI LẠI ĐIỂM LÊN SHEET"}
                    </button>

                    <button 
                      disabled={isSavingResult}
                      onClick={async () => {
                        // Nếu chưa lưu thành công, cố gắng lưu lần cuối
                        if (currentStudent && turnFinished && syncStatus !== 'success') {
                          const correctCount = currentTurnAnswers.filter(a => a.isCorrect).length;
                          const success = await saveExamResult(currentStudent, correctCount, currentQuestionSet.length, currentTurnAnswers);
                          if (!success) {
                            // Nếu vẫn lỗi, hỏi ý kiến người dùng bằng UI thay vì confirm nếu có thể, 
                            // nhưng ở đây dùng confirm là cách nhanh nhất để chặn thoát nhầm
                            if (!window.confirm("Lưu điểm vẫn thất bại. Bạn có chắc chắn muốn thoát không? (Nên chụp màn hình kết quả trước)")) return;
                          }
                        }
                        
                        // Reset trạng thái và thoát
                        setIsExamActive(false);
                        setCurrentQuestionSet([]);
                        setCurrentStudent(null);
                        setTurnFinished(false);
                        setSyncStatus('idle');
                        setSyncError(null);
                        setLastSavedResultId(null);
                      }}
                      className={`px-10 py-4 text-white font-black rounded-2xl transition-all shadow-xl uppercase tracking-widest text-sm ${
                        isSavingResult ? "bg-indigo-800 shadow-none cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20"
                      }`}
                    >
                      {isSavingResult ? "ĐANG LƯU ĐIỂM..." : "KẾT THÚC CHẾ ĐỘ THI"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="glass rounded-3xl p-6 border-indigo-500/30 flex flex-col items-center justify-center relative overflow-hidden min-h-[450px] shadow-2xl shadow-indigo-500/5">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent"></div>
                
                <div className="mb-8 w-full flex items-center justify-between animate-in fade-in zoom-in-95 px-6">
                  <div className="w-40 hidden md:block"></div> {/* Spacer to keep title centered */}
                  <div className="text-center flex-1">
                    <h2 className="text-3xl font-black font-heading text-white mb-1 tracking-tighter neon-text uppercase">VÒNG QUAY MAY MẮN</h2>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                      Lớp: <span className="text-indigo-400">{className}</span>
                    </p>
                  </div>
                  
                  {/* Box nhập số câu hỏi mỗi đợt quay */}
                  <div className="flex items-center gap-2 bg-slate-900/60 px-3 py-2 rounded-2xl border border-rose-500/30 shadow-xl backdrop-blur-sm">
                    <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest whitespace-nowrap">Số câu hỏi</span>
                    <input 
                      type="number" 
                      min="1" 
                      max="50"
                      value={questionsPerTurn}
                      onChange={(e) => setQuestionsPerTurn(parseInt(e.target.value) || 1)}
                      className="w-12 bg-slate-950 border border-rose-500/50 rounded-xl px-2 py-1 text-white text-center font-black text-sm focus:ring-2 focus:ring-rose-500/50 outline-none transition-all"
                    />
                  </div>
                </div>

                <Wheel 
                  items={students.filter(s => !s.hasPlayed).map(s => s.name)}
                  isSpinning={isSpinning}
                  onFinished={handleWheelFinished}
                />

                <div className="mt-8 w-full flex flex-col items-center">
                  <button
                    disabled={!canSpin}
                    onClick={handleSpin}
                    className={`px-12 py-4 rounded-2xl text-2xl font-black shadow-2xl transition-all active:scale-95 group relative overflow-hidden ${
                      canSpin 
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer' 
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }`}
                  >
                    {canSpin && <div className="absolute inset-0 bg-white/20 rounded-2xl animate-ping opacity-20 pointer-events-none"></div>}
                    QUAY NGAY!
                  </button>
                  
                  {!canSpin && !isSpinning && (
                    <p className="mt-4 text-rose-400 font-bold text-xs uppercase tracking-tighter animate-bounce text-center max-w-xs">
                      {students.length === 0 
                        ? "⚠️ Vui lòng nhập danh sách học sinh" 
                        : questionBank.length < questionsPerTurn 
                          ? `⚠️ Cần ít nhất ${questionsPerTurn} câu hỏi` 
                          : students.filter(s => !s.hasPlayed).length === 0 
                            ? "⚠️ Tất cả học sinh đã quay xong!"
                            : ""}
                    </p>
                  )}
                </div>
              </div>

              {currentQuestionSet.length > 0 && currentStudent && (
                <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-8 duration-500">
                  <div className="flex items-center justify-between px-4 mb-2">
                    <div className="flex items-center gap-3">
                       <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xl font-black shadow-lg border-2 border-indigo-400/30">
                        {currentStudent.name.charAt(0)}
                       </div>
                       <div className="flex flex-col">
                          <h3 className="text-2xl font-black text-white tracking-tight">
                            THỬ THÁCH CỦA: <span className="text-indigo-400">{currentStudent.name}{currentStudent.phone ? `: ${currentStudent.phone}` : ''}</span>
                          </h3>
                          <div className="flex items-center gap-4 mt-1">
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
                              <Target className="w-3.5 h-3.5 text-amber-500" />
                              <span className="text-[11px] font-black text-amber-400 uppercase tracking-widest">
                                Câu {currentQuestionIndex + 1} / {currentQuestionSet.length}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">
                                Đúng: {correctInTurn}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
                              <Star className="w-3.5 h-3.5 text-indigo-500" />
                              <span className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">
                                Tổng điểm: {currentStudent.score.toFixed(1)} / 10
                              </span>
                            </div>
                          </div>
                       </div>
                    </div>
                    {timeLeft > 0 && !turnFinished && (
                      <div className={`flex items-center gap-2 px-6 py-3 border rounded-2xl font-black text-lg transition-all shadow-lg ${timeLeft < 10 ? 'bg-rose-500/20 border-rose-500/30 text-rose-400 animate-pulse' : 'bg-slate-800/50 border-slate-700 text-slate-300'}`}>
                        <Clock className="w-5 h-5" />
                        {timeLeft}s
                      </div>
                    )}
                  </div>
                  
                  {turnFinished ? (
                    <div className="glass rounded-3xl p-6 sm:p-8 border-indigo-500/40 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500 max-w-lg mx-auto">
                      {(() => {
                        const msg = getResultMessage(correctInTurn, currentQuestionSet.length);
                        return (
                          <>
                            <div className={`w-14 h-14 sm:w-16 sm:h-16 ${msg.bgColor} rounded-full flex items-center justify-center mb-4 border-2 ${msg.borderColor}`}>
                              {React.cloneElement(msg.icon as React.ReactElement, { className: 'w-7 h-7 sm:w-8 sm:h-8' })}
                            </div>
                            <h3 className="text-xl sm:text-2xl font-black text-white mb-1 uppercase tracking-tighter">
                              {msg.title.replace("!", ` ${currentStudent.name.toUpperCase()}!`)}
                            </h3>
                            {questionConfig.language === 'en' && <p className="text-indigo-400 text-[10px] font-bold -mt-1 mb-1 uppercase tracking-tight">{msg.titleVi}</p>}
                            <p className="text-indigo-200 text-sm sm:text-base mb-4 font-medium">{msg.desc}</p>
                            {questionConfig.language === 'en' && <p className="text-slate-400 text-[10px] italic -mt-3 mb-4">{msg.descVi}</p>}
                          </>
                        );
                      })()}
                      
                      <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full mb-6">
                        <div className="p-3 sm:p-4 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl flex flex-col items-center justify-center">
                          <p className="text-[9px] text-slate-500 font-black uppercase mb-1 tracking-widest">Kết quả</p>
                          <p className="text-xl sm:text-2xl font-black text-white">{correctInTurn} / {currentQuestionSet.length}</p>
                        </div>
                        <div className="p-3 sm:p-4 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl flex flex-col items-center justify-center">
                          <p className="text-[9px] text-slate-500 font-black uppercase mb-1 tracking-widest">Quy chuẩn điểm</p>
                          <p className="text-xl sm:text-2xl font-black text-indigo-400">{currentStudent.score.toFixed(1)} / 10.0</p>
                        </div>
                        <div className="p-3 sm:p-4 bg-rose-500/10 rounded-2xl border border-rose-500/30 shadow-xl flex flex-col items-center justify-center">
                          <p className="text-[9px] text-rose-500 font-black uppercase mb-1 tracking-widest">Số lần dùng trợ giúp</p>
                          <p className="text-xl sm:text-2xl font-black text-rose-500">{questionsUsedHelp.length} / {currentQuestionSet.length}</p>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => {
                          setCurrentQuestionSet([]);
                          setCurrentStudent(null);
                          setTurnFinished(false);
                        }}
                        className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl transition-all shadow-xl shadow-indigo-500/20 uppercase tracking-widest text-xs"
                      >
                        TIẾP TỤC QUAY SỐ
                      </button>
                    </div>
                  ) : (
                    <QuestionCard 
                      key={`${currentStudent.id}-${currentQuestionIndex}`}
                      question={currentQuestionSet[currentQuestionIndex]} 
                      studentName={currentStudent.name + (currentStudent.phone ? `: ${currentStudent.phone}` : '')}
                      onAnswered={handleAnswered}
                      onHelpUsed={() => {
                        const qId = currentQuestionSet[currentQuestionIndex].id;
                        if (!questionsUsedHelp.includes(qId)) {
                          setQuestionsUsedHelp(prev => [...prev, qId]);
                        }
                      }}
                      images={lessonParsed?.mediaFiles}
                      allowTranslation={allowTranslation}
                      showHints={showHints}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {/* Cột 3: Học sinh & Thư viện bài tập có hình */}
        {!isExamActive && (
          <section className="lg:col-span-3 flex flex-col gap-6">
          <div className="glass rounded-3xl p-6 border-indigo-500/20 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold font-heading text-slate-100">Danh sách lớp</h2>
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowScoreboard(!showScoreboard)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${showScoreboard ? 'bg-amber-500 text-white border-amber-400' : 'bg-slate-800 text-slate-400 border-slate-700'}`}
                >
                  <Trophy className="w-3.5 h-3.5" />
                  Bảng điểm thi
                </button>
                <button 
                  onClick={() => studentFileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 rounded-lg text-indigo-400 text-[10px] font-black uppercase tracking-widest transition-all group"
                  disabled={isProcessingStudents}
                >
                  {isProcessingStudents ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileUp className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                  )}
                  Tải file
                </button>
                <input 
                  type="file" 
                  ref={studentFileInputRef} 
                  className="hidden" 
                  multiple 
                  accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  onChange={handleStudentFileChange}
                />
                <span className="bg-slate-800 text-slate-500 px-2 py-1 rounded text-[10px] font-bold uppercase border border-slate-700">{students.length} HS</span>
              </div>
            </div>

            <div className="space-y-3">
              <input 
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all shadow-inner"
                placeholder="Tên lớp (VD: 10A1)"
                value={className}
                onChange={e => setClassName(e.target.value)}
              />

              <textarea
                className="w-full h-32 bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
                placeholder="Nhập tên học sinh (mỗi người 1 dòng)... Bạn có thể nhập: Tên - SĐT"
                value={rawStudentInput}
                onChange={e => setRawStudentInput(e.target.value)}
              />

              <button
                onClick={handleImportStudents}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold transition-all active:scale-98 shadow-md"
              >
                CẬP NHẬT DANH SÁCH
              </button>
            </div>

            <div className="mt-6 max-h-[300px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
              {showScoreboard ? (
                <div className="space-y-3 animate-in fade-in slide-in-from-right-4">
                  <div className="flex flex-col gap-2 mb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Bảng điểm thi</h3>
                        <div className="text-[7px] text-slate-500 font-bold uppercase tracking-tighter mt-0.5">
                          Tự động lưu Drive: <span className="text-blue-400">1CVB9Nh...8n</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={fetchResultsFromServer}
                          className="flex items-center gap-1 text-[9px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-tighter"
                        >
                          <RefreshCcw className="w-3 h-3" /> Làm mới
                        </button>
                        <button 
                          onClick={handleExportExcel}
                          className="flex items-center gap-1 text-[9px] font-black text-emerald-400 hover:text-emerald-300 uppercase tracking-tighter"
                        >
                          <Download className="w-3 h-3" /> Xuất Excel
                        </button>
                        <button 
                          onClick={handleExportJSON}
                          className="flex items-center gap-1 text-[9px] font-black text-orange-400 hover:text-orange-300 uppercase tracking-tighter"
                        >
                          <FileText className="w-3 h-3" /> Xuất JSON
                        </button>
                        <button 
                          onClick={handleGoogleDriveExport}
                          className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-tighter transition-all ${isGoogleAuthenticated ? 'text-blue-400 hover:text-blue-300' : 'text-slate-400 hover:text-slate-300'}`}
                          title={isGoogleAuthenticated ? "Lưu vào Google Drive" : "Kết nối Google Drive"}
                        >
                          <Cloud className="w-3 h-3" /> {isGoogleAuthenticated ? 'Lưu Drive' : 'Kết nối Drive'}
                        </button>
                      </div>
                    </div>
                    <button 
                      onClick={handleNewSession}
                      className="w-full py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-400 text-[9px] font-black uppercase tracking-widest transition-all"
                    >
                      + Bắt đầu đợt thi mới
                    </button>
                    <div className="text-[8px] text-slate-500 font-bold uppercase">Đang ở: <span className="text-amber-500">{currentSessionId}</span></div>
                  </div>
                  {examResults.length === 0 ? (
                    <div className="text-center py-8 text-slate-700 text-[10px] italic">Chưa có kết quả thi nào</div>
                  ) : (
                    Object.entries(
                      examResults.reduce((acc: any, r) => {
                        const session = r.sessionId || 'Đợt thi cũ';
                        if (!acc[session]) acc[session] = [];
                        acc[session].push(r);
                        return acc;
                      }, {})
                    ).sort((a: any, b: any) => {
                      const latestA = Math.max(...a[1].map((r: any) => r.timestamp || 0));
                      const latestB = Math.max(...b[1].map((r: any) => r.timestamp || 0));
                      return latestB - latestA;
                    }).map(([session, results]: [string, any]) => (
                      <div key={session} className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 py-1 border-b border-amber-500/10">
                          <Trophy className="w-2.5 h-2.5 text-amber-500/40" />
                          <span className="text-[9px] font-black text-amber-500/60 uppercase tracking-widest">{session}</span>
                        </div>
                        {results.map((r: any) => (
                          <div key={r.id} className="p-4 bg-slate-900/40 border border-amber-500/30 rounded-2xl flex items-center justify-between group hover:bg-slate-900/60 transition-all shadow-lg">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-slate-100">{r.name}</p>
                                {r.details && r.details.length > 0 && (
                                  <button 
                                    onClick={() => setSelectedResultDetail(r)}
                                    className="text-[8px] font-black text-indigo-300 bg-indigo-950/40 px-2 py-1 rounded-lg border border-indigo-500/30 uppercase tracking-tighter transition-all hover:bg-indigo-500/20"
                                  >
                                    Chi tiết
                                  </button>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 font-medium mt-1">{r.className} • {new Date(r.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                            </div>
                            <div className="text-right flex flex-col items-end">
                              <p className="text-2xl font-black text-amber-500 leading-none">{r.score.toFixed(1)}</p>
                              <div className="flex flex-col items-end gap-0.5 mt-1">
                                <p className="text-[9px] text-slate-600 font-bold">{r.correctAnswers}/{r.totalQuestions} câu</p>
                                {r.helpCount !== undefined && (
                                  <p className="text-[7px] text-rose-500/70 font-black uppercase tracking-tighter">Trợ giúp: {r.helpCount} lần</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                students.length === 0 ? (
                  <div className="text-center py-8 text-slate-700 text-xs italic font-medium">Chưa có học sinh trong danh sách</div>
                ) : (
                  students.sort((a, b) => b.score - a.score).map((s, idx) => (
                    <div key={s.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-300 ${s.hasPlayed ? 'bg-indigo-500/10 border-indigo-500/30 shadow-inner' : 'bg-slate-800/30 border-slate-700 hover:border-slate-500'}`}>
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full ${idx < 3 ? 'bg-amber-500/20 text-amber-500' : 'bg-slate-700 text-slate-500'}`}>{idx + 1}</span>
                        <div className="max-w-[150px]">
                          <p className={`text-sm font-semibold tracking-tight truncate ${s.hasPlayed ? 'text-indigo-200' : 'text-slate-300'}`}>{s.name}</p>
                          {s.phone && <p className="text-[10px] text-slate-500 font-medium truncate">{s.phone}</p>}
                          {s.hasPlayed && <p className="text-[9px] text-emerald-400 font-black uppercase tracking-widest animate-pulse">Hoàn thành</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                         <span className="text-xs font-black text-white bg-indigo-600/50 w-auto min-w-[32px] px-1 h-7 flex items-center justify-center rounded-lg shadow-inner border border-indigo-500/20">
                          {s.score.toFixed(1)}
                         </span>
                         <button 
                          onClick={() => setStudents(prev => prev.filter(st => st.id !== s.id))}
                          className="text-slate-700 hover:text-rose-500 p-1 transition-colors"
                          title="Xóa học sinh"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>

          {/* TAB CHỨA BÀI TẬP CÓ HÌNH (CẬP NHẬT THEO YÊU CẦU MỚI) */}
          <div className="glass rounded-3xl p-6 border-indigo-500/20 shadow-xl flex flex-col h-full min-h-[400px]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-black font-heading text-slate-100 uppercase tracking-tighter">Bài tập có hình</h2>
              </div>
              <span className="bg-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full text-[10px] font-black border border-indigo-500/30 uppercase tracking-widest">
                {questionsWithImages.length} CÂU
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {questionsWithImages.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {questionsWithImages.map((q, idx) => {
                    const imgData = lessonParsed?.mediaFiles?.[q.imageIndex!];
                    return (
                      <div key={idx} className="group relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-900/50 p-3 transition-all hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10">
                        <div className="absolute top-4 left-4 z-20 bg-indigo-600 text-white text-[9px] font-black px-3 py-1 rounded-full shadow-lg flex items-center gap-1.5 border border-white/20">
                          <LinkIcon className="w-2.5 h-2.5" />
                          BÀI TẬP CÓ HÌNH
                        </div>

                        <div className="relative w-full aspect-video overflow-hidden rounded-xl bg-black/40 flex items-center justify-center mb-3">
                           {imgData ? (
                              q.imageBox ? (
                                <CroppedImage 
                                  src={`data:${imgData.mimeType};base64,${imgData.data}`} 
                                  box={q.imageBox} 
                                  alt={`Question ${idx}`}
                                  className="w-full h-full transition-transform duration-500 group-hover:scale-105"
                                />
                              ) : (
                                <img 
                                  src={`data:${imgData.mimeType};base64,${imgData.data}`} 
                                  alt={`Question ${idx}`}
                                  className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-105"
                                />
                              )
                           ) : (
                              <div className="flex flex-col items-center gap-2 opacity-50">
                                <AlertCircle className="w-8 h-8 text-slate-600" />
                                <span className="text-[10px] font-black text-slate-500 uppercase">Lỗi dữ liệu ảnh</span>
                              </div>
                           )}
                           <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity"></div>
                        </div>
                        
                        <div className="space-y-2">
                           <div className="max-h-16 overflow-y-auto custom-scrollbar text-[11px] text-slate-200 leading-snug font-medium italic pr-1">
                              <LatexRenderer text={q.content} />
                           </div>
                           
                           <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                              <div className="flex items-center gap-1">
                                 <span className="text-[8px] font-black text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded-full border border-indigo-500/20 uppercase">
                                   {q.difficulty}
                                 </span>
                              </div>
                              <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest flex items-center gap-1">
                                <Target className="w-2.5 h-2.5" /> Index: {q.imageIndex}
                              </span>
                           </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
                  <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4 border-2 border-dashed border-slate-700">
                    <HelpCircle className="w-8 h-8 text-slate-600" />
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                    Chưa có bài tập nào có hình.<br/>Hãy nạp bài học có ảnh và "Tạo ngân hàng".
                  </p>
                </div>
              )}
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="flex items-center gap-2 p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <p className="text-[9px] text-slate-500 font-medium leading-tight">
                  Khu vực này tự động liệt kê tất cả các câu hỏi trong ngân hàng hiện tại có sử dụng hình ảnh minh họa.
                </p>
              </div>
            </div>
          </div>
        </section>
        )}
      </main>
      ) : activeTab === 'monitoring' ? (
        <MonitoringTab students={monitoredStudents} wsStatus={wsStatus} />
      ) : activeTab === 'flashcards' ? (
        <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 rounded-xl">
                <Zap className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none mb-1">THẺ GHI NHỚ</h2>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Phương pháp lặp lại ngắt quãng</p>
              </div>
            </div>
            {lessonParsed?.parsed.flashcards && (
              <div className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400 text-[10px] font-black uppercase tracking-widest">
                {lessonParsed.parsed.flashcards.length} thẻ
              </div>
            )}
          </div>

          {lessonParsed?.parsed.flashcards && lessonParsed.parsed.flashcards.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {lessonParsed.parsed.flashcards.map((card, idx) => (
                <Flashcard key={idx} front={card.front} back={card.back} />
              ))}
            </div>
          ) : (
            <div className="glass rounded-[3rem] p-20 flex flex-col items-center justify-center text-center border-dashed border-2 border-slate-700">
              <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center mb-6 shadow-2xl">
                <Brain className="w-12 h-12 text-slate-600" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Chưa có Flashcards</h3>
              <p className="text-slate-400 max-w-md mx-auto">
                Hãy nạp bài học và nhấn "Trích xuất & Phân tích" để AI tự động tạo thẻ ghi nhớ cho bạn.
              </p>
              <button 
                onClick={() => setActiveTab('dashboard')}
                className="mt-8 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-500/20 uppercase tracking-widest text-xs"
              >
                Quay lại Quản lý giáo viên
              </button>
            </div>
          )}
        </div>
      ) : (
        <ExamTab 
          examMode={examMode}
          setExamMode={setExamMode}
          examStudentInfo={examStudentInfo}
          setExamStudentInfo={setExamStudentInfo}
          examQuestionCount={examQuestionCount}
          setExamQuestionCount={setExamQuestionCount}
          examTimeLimit={examTimeLimit}
          setExamTimeLimit={setExamTimeLimit}
          handleStartExam={handleStartExam}
          sharedAppUrl={sharedAppUrl}
          setSharedAppUrl={setSharedAppUrl}
          isLinkTransferred={isLinkTransferred}
          setIsLinkTransferred={setIsLinkTransferred}
          handleCopyExamLink={handleCopyExamLink}
          isExamActive={isExamActive}
          setActiveTab={setActiveTab}
          setIsExamActive={setIsExamActive}
          setCurrentQuestionSet={setCurrentQuestionSet}
          setCurrentStudent={setCurrentStudent}
          setTurnFinished={setTurnFinished}
          allowTranslation={allowTranslation}
          setAllowTranslation={setAllowTranslation}
          showHints={showHints}
          setShowHints={setShowHints}
          apiBase={API_BASE}
          questionBank={questionBank}
        />
      )}

      <footer className="mt-20 border-t border-slate-900 pt-8 text-center text-yellow-500 text-[10px] font-bold tracking-[0.2em] pb-12">
        <p>&copy; 2026 CÔ HUYỀN PRO - Giải pháp ôn tập  dựa trên AI</p>
        <p className="mt-2">Liên hệ tư vấn phần mềm: 0988771339</p>
        <a 
          href="https://conlaso1-trung-tam-toan-anh.vercel.app/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="mt-6 block text-emerald-500 hover:text-emerald-400 transition-colors text-base font-black uppercase tracking-tight"
        >
          Thông Tin về TRUNG TÂM TIẾNG ANH & TOÁN + ỨNG DỤNG AI VÀO CUỘC SỐNG
        </a>
      </footer>

      {showDownloadModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="glass rounded-[2rem] p-8 border-indigo-500/30 shadow-2xl max-w-md w-full mx-4 animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center">
                <Download className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Thông tin tải xuống</h3>
                <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Vui lòng nhập thông tin trước khi tải</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Họ và tên</label>
                <input 
                  type="text"
                  placeholder="Nhập họ và tên..."
                  value={downloadInfo.name}
                  onChange={e => setDownloadInfo(prev => ({...prev, name: e.target.value}))}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Lớp</label>
                <input 
                  type="text"
                  placeholder="Nhập lớp..."
                  value={downloadInfo.class}
                  onChange={e => setDownloadInfo(prev => ({...prev, class: e.target.value}))}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mt-8">
              <button 
                onClick={() => setShowDownloadModal(false)}
                className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={confirmDownload}
                className="py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20"
              >
                Tải xuống
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedResultDetail && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95 backdrop-blur-md animate-in fade-in duration-300">
          <div className="glass w-full h-full border-none shadow-none flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden rounded-none">
            <div className="p-2 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                  <Trophy className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-tighter">Chi tiết bài làm: {selectedResultDetail.name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                    Điểm: <span className="text-amber-400">{selectedResultDetail.score.toFixed(1)}</span> • 
                    Đúng: <span className="text-emerald-400">{selectedResultDetail.correctAnswers}/{selectedResultDetail.totalQuestions}</span> • 
                    Lớp: <span className="text-white">{selectedResultDetail.className}</span>
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-3 bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-700">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-start leading-none">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Hiện các câu sai</span>
                      <span className="text-[10px] font-black text-rose-500 mt-0.5">({selectedResultDetail.totalQuestions - selectedResultDetail.correctAnswers} câu)</span>
                    </div>
                    <button 
                      onClick={() => setShowOnlyIncorrect(!showOnlyIncorrect)}
                      className={`w-10 h-5 rounded-full p-0.5 transition-all duration-300 ${showOnlyIncorrect ? 'bg-rose-500' : 'bg-slate-700'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-all duration-300 ${showOnlyIncorrect ? 'translate-x-5' : 'translate-x-0'}`}></div>
                    </button>
                  </div>
                  
                  {selectedResultDetail.correctAnswers < selectedResultDetail.totalQuestions && (
                    <>
                      <button 
                        onClick={handleRetakeIncorrect}
                        className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all shadow-lg shadow-rose-600/20"
                      >
                        <RotateCw className="w-3 h-3" /> Câu sai Thi lại
                      </button>
                      <button 
                        onClick={() => handleDownloadIncorrect(selectedResultDetail)}
                        className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20"
                      >
                        <Download className="w-3 h-3" /> Tải file Word
                      </button>
                    </>
                  )}
                </div>

                <button 
                  onClick={() => { setSelectedResultDetail(null); setShowOnlyIncorrect(false); }}
                  className="p-2 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-xl transition-all shadow-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 md:p-4 custom-scrollbar space-y-4">
              {selectedResultDetail.details?.filter(d => !showOnlyIncorrect || !d.isCorrect).map((detail, idx) => (
                <div key={idx} className={`p-4 rounded-2xl border transition-all ${detail.isCorrect ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${detail.isCorrect ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                        {idx + 1}
                      </span>
                      <h4 className="text-sm font-bold text-slate-100">
                        <LatexRenderer text={detail.questionContent} />
                      </h4>
                    </div>
                    {detail.isCorrect ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    {detail.options.map((opt, oIdx) => {
                      const label = String.fromCharCode(65 + oIdx);
                      const isCorrect = opt === detail.correctAnswer;
                      const isStudentChoice = opt === detail.studentAnswer;
                      
                      let optClass = "p-2 rounded-lg border flex items-center gap-2 text-xs font-medium ";
                      if (isCorrect) optClass += "bg-emerald-500/20 border-emerald-500/50 text-emerald-300";
                      else if (isStudentChoice && !isCorrect) optClass += "bg-rose-500/20 border-rose-500/50 text-rose-300";
                      else optClass += "bg-slate-900/50 border-slate-800 text-slate-500";

                      return (
                        <div key={oIdx} className={optClass}>
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black ${isCorrect ? 'bg-emerald-500 text-white' : (isStudentChoice ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-600')}`}>
                            {label}
                          </span>
                          <LatexRenderer text={opt} />
                          {isStudentChoice && <span className="ml-auto text-[7px] font-black uppercase tracking-widest bg-white/10 px-1 py-0.5 rounded">Lựa chọn</span>}
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800/50">
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                      <HelpCircle className="w-3 h-3" /> Giải thích chi tiết
                    </p>
                    <p className="text-xs text-slate-400 italic leading-relaxed">
                      <LatexRenderer text={detail.explanation} />
                    </p>
                  </div>

                  {detail.imageIndex !== undefined && detail.imageIndex !== null && lessonParsed?.mediaFiles?.[detail.imageIndex] && (
                    <div className="mt-3 p-3 bg-slate-900/30 rounded-xl border border-slate-800/30 flex flex-col items-center">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Hình ảnh minh họa câu hỏi</p>
                      {detail.imageBox ? (
                        <CroppedImage 
                          src={`data:${lessonParsed.mediaFiles[detail.imageIndex].mimeType};base64,${lessonParsed.mediaFiles[detail.imageIndex].data}`} 
                          box={detail.imageBox} 
                          alt="Question Visual"
                          className="w-full rounded-lg shadow-lg"
                        />
                      ) : (
                        <img 
                          src={`data:${lessonParsed.mediaFiles[detail.imageIndex].mimeType};base64,${lessonParsed.mediaFiles[detail.imageIndex].data}`} 
                          alt="Question Visual"
                          className="max-h-64 md:max-h-96 w-full object-contain rounded-lg shadow-lg"
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="p-3 bg-slate-900/60 border-t border-slate-800 flex justify-center">
              <button 
                onClick={() => setSelectedResultDetail(null)}
                className="px-8 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl transition-all shadow-xl shadow-indigo-600/20 uppercase tracking-widest text-[10px]"
              >
                Đóng cửa sổ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cấu hình câu hỏi - Full Screen Dashboard */}
      <AnimatePresence>
        {showConfigModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-950 flex flex-col"
          >
            {/* Header - Full Width */}
            <div className="p-2 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-500/20 rounded-lg">
                  <Settings className="w-5 h-5 text-indigo-400" />
                </div>
                <h2 className="text-sm font-black text-white uppercase tracking-widest">Hệ thống cấu hình câu hỏi AI</h2>
              </div>
              <button 
                onClick={() => setShowConfigModal(false)}
                className="group p-2 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-xl transition-all shadow-xl flex items-center gap-2"
              >
                <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">Đóng cấu hình</span>
                <X className="w-5 h-5 group-hover:rotate-90 transition-transform" />
              </button>
            </div>

            {/* Content - Full Screen Dense Grid */}
            <div className="flex-1 overflow-y-auto p-2 md:p-4 custom-scrollbar bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/5 via-transparent to-transparent">
              <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                
                {/* Column 1: Core Settings */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Thông tin cơ bản</span>
                  </div>
                  
                  <div className="glass p-3 rounded-xl border-indigo-500/20 space-y-3">
                    <div>
                      <label className="text-[8px] font-black text-indigo-400 uppercase block mb-1.5 tracking-widest">Môn học trọng tâm</label>
                      <input 
                        type="text" 
                        className="w-full bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 transition-all shadow-inner" 
                        value={questionConfig.subject} 
                        onChange={e => setQuestionConfig(prev => ({...prev, subject: e.target.value}))} 
                        placeholder="Ví dụ: Anh văn, Toán..."
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[8px] font-black text-purple-400 uppercase block mb-1.5 tracking-widest">Số lượng câu</label>
                        <input 
                          type="number" 
                          className="w-full bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500 shadow-inner" 
                          value={questionConfig.count} 
                          onChange={e => setQuestionConfig(prev => ({...prev, count: parseInt(e.target.value) || 0}))} 
                        />
                      </div>
                      <div>
                        <label className="text-[8px] font-black text-emerald-400 uppercase block mb-1.5 tracking-widest">Cấp độ học</label>
                        <select 
                          className="w-full bg-slate-900/50 border border-slate-800 rounded-lg px-2 py-2 text-xs text-white outline-none focus:border-emerald-500 appearance-none cursor-pointer shadow-inner" 
                          value={questionConfig.educationLevel} 
                          onChange={e => setQuestionConfig(prev => ({...prev, educationLevel: e.target.value as EducationLevel}))}
                        >
                          {Object.values(EducationLevel).map(level => (
                            <option key={level} value={level} className="bg-slate-900">{level}</option>
                          ))}
                        </select>
                      </div>
                    </div>
 
                    <div>
                      <label className="text-[8px] font-black text-blue-400 uppercase block mb-1.5 tracking-widest">Ngôn ngữ hiển thị</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { val: 'vi', label: 'Tiếng Việt' },
                          { val: 'en', label: 'English' },
                          { val: 'auto', label: 'Song ngữ' }
                        ].map(lang => (
                          <button 
                            key={lang.val} 
                            onClick={() => setQuestionConfig(prev => ({...prev, language: lang.val}))} 
                            className={`py-2 rounded-lg text-[9px] font-black border transition-all ${
                              questionConfig.language === lang.val 
                                ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30' 
                                : 'bg-slate-800/50 border-slate-700 text-white hover:border-slate-500 hover:bg-slate-800'
                            }`}
                          >
                            {lang.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
 
                {/* Column 2: Modes & Types */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Chế độ & Phân loại</span>
                  </div>
                  
                  <div className="glass p-3 rounded-xl border-rose-500/20 space-y-4">
                    <div>
                      <label className="text-[8px] font-black text-blue-400 uppercase block mb-2 tracking-widest">Chế độ kiểm tra kiến thức</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {Object.values(LanguageMode).map(mode => (
                          <button 
                            key={mode} 
                            onClick={() => {
                              setQuestionConfig(prev => {
                                const newConfig = { ...prev, languageMode: mode };
                                if (mode === LanguageMode.VOCABULARY) {
                                  newConfig.questionCategories = [QuestionCategory.VOCABULARY];
                                }
                                return newConfig;
                              });
                              
                              // Tự động kích hoạt tạo câu hỏi nếu chọn chế độ Từ vựng và đã có bài học
                              if (mode === LanguageMode.VOCABULARY && lessonParsed) {
                                setTimeout(() => {
                                  handleGenerateBank();
                                }, 100);
                              }
                            }} 
                            className={`py-2 rounded-lg text-[9px] font-black border transition-all text-center ${
                              questionConfig.languageMode === mode 
                                ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30' 
                                : 'bg-slate-800/50 border-slate-700 text-white hover:border-slate-500 hover:bg-slate-800'
                            }`}
                          >
                            {(() => {
                              const text = mode.replace('Chế độ ', '');
                              return text.charAt(0).toUpperCase() + text.slice(1);
                            })()}
                          </button>
                        ))}
                      </div>
                    </div>
 
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[8px] font-black text-rose-400 uppercase tracking-widest">Loại câu hỏi AI tạo</label>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => setQuestionConfig(prev => ({...prev, language: 'vi'}))}
                            className={`w-5 h-5 flex items-center justify-center rounded text-[8px] font-bold transition-all border ${
                              questionConfig.language === 'vi' 
                                ? 'bg-rose-600 border-rose-400 text-white shadow-lg shadow-rose-600/20' 
                                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500'
                            }`}
                            title="Tiếng Việt"
                          >V</button>
                          <button 
                            onClick={() => setQuestionConfig(prev => ({...prev, language: 'en'}))}
                            className={`w-5 h-5 flex items-center justify-center rounded text-[8px] font-bold transition-all border ${
                              questionConfig.language === 'en' 
                                ? 'bg-rose-600 border-rose-400 text-white shadow-lg shadow-rose-600/20' 
                                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500'
                            }`}
                            title="English"
                          >E</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {Object.values(QuestionCategory).map(cat => (
                          <button 
                            key={cat} 
                            title={categoryTooltips[cat] || cat}
                            onClick={() => {
                              setQuestionConfig(prev => {
                                const isSelected = prev.questionCategories.includes(cat);
                                const cats = [...prev.questionCategories];
                                if (isSelected) {
                                  if (cats.length > 1) return { ...prev, questionCategories: cats.filter(c => c !== cat) };
                                  return prev;
                                } else {
                                  return { ...prev, questionCategories: [...cats, cat] };
                                }
                              });
                            }} 
                            className={`px-1 py-2 rounded-lg text-[9px] font-black border transition-all text-center ${
                              questionConfig.questionCategories.includes(cat) 
                                ? 'bg-rose-600 border-rose-400 text-white shadow-lg shadow-rose-600/30' 
                                : 'bg-slate-800/50 border-slate-700 text-white hover:border-slate-500 hover:bg-slate-800'
                            }`}
                          >
                            {questionConfig.language === 'vi' ? (categoryTranslations[cat] || cat) : cat}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
 
                {/* Column 3: Advanced Options */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Tùy chọn nâng cao</span>
                  </div>
                  
                  <div className="glass p-3 rounded-xl border-amber-500/20 bg-amber-500/5 space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => setQuestionConfig(prev => ({...prev, shuffleAnswers: !prev.shuffleAnswers}))} 
                        className={`py-2 rounded-lg border text-[9px] font-black uppercase flex items-center justify-center gap-1.5 transition-all ${
                          questionConfig.shuffleAnswers 
                            ? 'bg-amber-600/20 border-amber-500 text-amber-400 shadow-lg shadow-amber-600/10' 
                            : 'bg-slate-800/30 border-slate-700 text-slate-500'
                        }`}
                      >
                        <Shuffle className="w-3.5 h-3.5" /> Trộn đáp án
                      </button>
                      <button 
                        onClick={() => setQuestionConfig(prev => ({...prev, flashcards: !prev.flashcards}))} 
                        className={`py-2 rounded-lg border text-[9px] font-black uppercase flex items-center justify-center gap-1.5 transition-all ${
                          questionConfig.flashcards 
                            ? 'bg-amber-600/20 border-amber-500 text-amber-400 shadow-lg shadow-amber-600/10' 
                            : 'bg-slate-800/30 border-slate-700 text-slate-500'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5" /> Flashcards
                      </button>
                    </div>
 
                    <div>
                      <label className="text-[8px] font-black text-slate-500 uppercase block mb-2 tracking-widest">Độ khó AI</label>
                      <div className="flex bg-slate-900/80 border border-slate-800 rounded-lg p-0.5 shadow-inner">
                        {Object.values(Difficulty).map(diff => {
                          const label = diff === Difficulty.EASY ? 'Dễ' : diff === Difficulty.MEDIUM ? 'Trung bình' : 'Khó';
                          return (
                            <button 
                              key={diff} 
                              onClick={() => setQuestionConfig(prev => ({...prev, difficulty: diff}))} 
                              className={`flex-1 py-1.5 text-[9px] font-black rounded-md transition-all ${
                                questionConfig.difficulty === diff 
                                  ? 'bg-indigo-600 text-white shadow-lg' 
                                  : 'text-white hover:text-white/80 hover:bg-slate-800/50'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
 
                    <div>
                      <div className="flex justify-between text-[8px] font-black text-amber-400 uppercase mb-2 tracking-widest">
                        <span>Tỉ lệ trắc nghiệm</span>
                        <span className="bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20">{questionConfig.mcqRatio}%</span>
                      </div>
                      <div className="px-1">
                        <input 
                          type="range" 
                          min="0" max="100" step="10" 
                          value={questionConfig.mcqRatio} 
                          onChange={e => setQuestionConfig(prev => ({...prev, mcqRatio: parseInt(e.target.value)}))} 
                          className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500" 
                        />
                        <div className="flex justify-between mt-1 text-[6px] text-slate-600 font-black uppercase tracking-tighter">
                          <span>Tự luận</span>
                          <span>Cân bằng</span>
                          <span>Trắc nghiệm</span>
                        </div>
                      </div>
                    </div>
 
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Tính năng Gợi ý bài thi</label>
                        {isEnteringHintsPass ? (
                          <div className="flex items-center gap-1 bg-slate-900 border border-amber-500/50 rounded-lg px-1.5 py-0.5 animate-in zoom-in-95 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                            <input 
                              type="password"
                              autoFocus
                              className="bg-transparent border-none outline-none text-[10px] text-white w-20 px-1 font-mono placeholder:text-slate-600"
                              placeholder="Nhập Pass..."
                              value={hintsPassInput}
                              onChange={e => setHintsPassInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  if (hintsPassInput === '2021') {
                                    setShowHints(true);
                                    setIsEnteringHintsPass(false);
                                    setHintsPassInput('');
                                  } else {
                                    alert('Mật khẩu không đúng!');
                                    setHintsPassInput('');
                                  }
                                } else if (e.key === 'Escape') {
                                  setIsEnteringHintsPass(false);
                                  setHintsPassInput('');
                                }
                              }}
                            />
                            <button 
                              onClick={() => {
                                if (hintsPassInput === '2021') {
                                  setShowHints(true);
                                  setIsEnteringHintsPass(false);
                                  setHintsPassInput('');
                                } else if (hintsPassInput.length > 0) {
                                  alert('Mật khẩu không đúng!');
                                  setHintsPassInput('');
                                } else {
                                  setIsEnteringHintsPass(false);
                                }
                              }}
                              className="text-emerald-500 hover:text-emerald-400 p-0.5 transition-colors"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={() => {
                                setIsEnteringHintsPass(false);
                                setHintsPassInput('');
                              }}
                              className="text-slate-500 hover:text-rose-500 p-0.5 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button 
                            type="button"
                            className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/80 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-all outline-none focus:ring-1 focus:ring-amber-500/50"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!showHints) {
                                setIsEnteringHintsPass(true);
                              } else {
                                setShowHints(false);
                              }
                            }}
                          >
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest select-none">
                              {showHints ? 'Đang bật' : 'Đang tắt'}
                            </span>
                            <div 
                              className={`w-6 h-3 rounded-full transition-all relative pointer-events-none ${showHints ? 'bg-amber-600' : 'bg-slate-700'}`}
                            >
                              <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${showHints ? 'left-3.5' : 'left-0.5'}`} />
                            </div>
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-[8px] font-black text-slate-500 uppercase block mb-1.5 tracking-widest">Từ khóa trọng tâm</label>
                      <textarea 
                        rows={1} 
                        className="w-full bg-slate-900/50 border border-slate-800 rounded-lg p-2 text-xs text-white outline-none resize-none focus:border-amber-500/50 transition-all shadow-inner" 
                        placeholder="Nhập từ khóa..."
                        value={questionConfig.keywords} 
                        onChange={e => setQuestionConfig(prev => ({...prev, keywords: e.target.value}))} 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer - Full Width */}
            <div className="p-3 px-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-500">
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                  <Info className="w-4 h-4" />
                </div>
                <p className="text-[10px] font-medium max-w-md uppercase tracking-tighter">Cấu hình này sẽ được áp dụng trực tiếp khi AI bắt đầu phân tích và tạo câu hỏi.</p>
              </div>
              <button 
                onClick={() => setShowConfigModal(false)}
                className="px-10 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black rounded-2xl transition-all shadow-2xl shadow-indigo-600/40 uppercase tracking-[0.2em] text-xs flex items-center gap-3 group active:scale-95"
              >
                Lưu và áp dụng cấu hình
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
