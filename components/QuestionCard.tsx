
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Question, QuestionType } from '../types';
import { translateAndAnalyzeText } from '../services/geminiService';
import { 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Image as ImageIcon, 
  ZoomIn, 
  X, 
  Maximize2, 
  Search, 
  ZoomOut, 
  RefreshCcw,
  Move,
  Languages,
  Loader2
} from 'lucide-react';
import katex from 'katex';

interface QuestionCardProps {
  question: Question;
  studentName: string;
  onAnswered: (isCorrect: boolean, selectedOption: string) => void;
  onHelpUsed?: () => void;
  images?: {data: string, mimeType: string}[];
  allowTranslation?: boolean;
  showHints?: boolean;
}

const LatexRenderer: React.FC<{ text: string }> = ({ text }) => {
  const parts = useMemo(() => {
    if (!text || typeof text !== 'string') return [];
    
    // Loại bỏ các từ 'undefined' hoặc 'null' gây nhiễu nếu xuất hiện ở đầu/cuối chuỗi do lỗi AI
    const cleanedText = text.replace(/^undefined\s?|^null\s?/, '');
    
    // Regex chuẩn cho LaTeX: ưu tiên $$...$$ trước, sau đó mới đến $...$
    const segments = cleanedText.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);
    
    return segments.filter(seg => seg !== undefined && seg !== '').flatMap((seg, idx) => {
      const trimmed = seg.trim();
      // Kiểm tra xem đoạn này có phải là LaTeX không
      if ((trimmed.startsWith('$') && trimmed.endsWith('$'))) {
        const isDisplayMode = trimmed.startsWith('$$') && trimmed.endsWith('$$');
        const formula = isDisplayMode ? trimmed.slice(2, -2) : trimmed.slice(1, -1);
        
        // Nếu bên trong dấu $ là từ 'undefined' thì bỏ qua không render lỗi
        if (formula.toLowerCase() === 'undefined' || formula.toLowerCase() === 'null') return [];

        try {
          // Tiền xử lý nhẹ cho \ce nếu AI vẫn dùng
          let processedFormula = formula;
          if (processedFormula.includes('\\ce{')) {
            processedFormula = processedFormula.replace(/\\ce\{([^}]+)\}/g, '$1');
          }

          const html = katex.renderToString(processedFormula, {
            displayMode: isDisplayMode,
            throwOnError: false,
            trust: true,
            strict: false,
            macros: { 
              "\\widehat": "\\hat{#1}", 
              "\\eq": "=",
              "\\longrightarrow": "\\xrightarrow{}"
            }
          });
          return [<span key={idx} dangerouslySetInnerHTML={{ __html: html }} className="mx-0.5" />];
        } catch (e) {
          console.error("KaTeX Error:", e, "Formula:", formula);
          if (formula === 'undefined') return [];
          return [<span key={idx} className="text-rose-400 font-mono italic px-1 bg-rose-500/10 rounded">{seg}</span>];
        }
      }

      // Xử lý thẻ <u> cho các đoạn không phải LaTeX
      const subParts = seg.split(/(<u>.*?<\/u>)/g);
      return subParts.map((sub, sIdx) => {
        if (sub.startsWith('<u>') && sub.endsWith('</u>')) {
          return <u key={`${idx}-${sIdx}`} className="decoration-indigo-400 decoration-2 underline-offset-2 font-bold text-indigo-300">{sub.slice(3, -4)}</u>;
        }
        return <span key={`${idx}-${sIdx}`}>{sub}</span>;
      });
    });
  }, [text]);

  return <span className="inline-block">{parts}</span>;
};

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

const QuestionCard: React.FC<QuestionCardProps> = ({ question, studentName, onAnswered, onHelpUsed, images, allowTranslation, showHints }) => {
  const [showAnswer, setShowAnswer] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [showStudentHelp, setShowStudentHelp] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);

  // Translation states
  const [translation, setTranslation] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const isTranslatingRef = useRef(false);
  const [tooltipPos, setTooltipPos] = useState<{ x: number, y: number, isAbove: boolean, maxH: number, manualX?: number, manualY?: number } | null>(null);
  const lastTranslatedWord = useRef<string | null>(null);
  const isDraggingTooltip = useRef(false);
  const tooltipDragStart = useRef({ x: 0, y: 0 });
  const setTranslating = (val: boolean) => {
    setIsTranslating(val);
    isTranslatingRef.current = val;
  };
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!allowTranslation) {
      setTranslation(null);
      setTooltipPos(null);
      return;
    }

    const handleMouseUp = async (e: MouseEvent) => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();

      if (selectedText && selectedText.length > 1 && allowTranslation) {
        const isInside = containerRef.current && (
          containerRef.current.contains(selection?.anchorNode || null) || 
          containerRef.current.contains(selection?.focusNode || null) ||
          containerRef.current.contains(e.target as Node)
        );

        if (isInside) {
          const range = selection?.getRangeAt(0);
          const rect = range?.getBoundingClientRect();
          
          if (rect) {
            const spaceAbove = rect.top;
            const spaceBelow = window.innerHeight - rect.bottom;
            const isAbove = spaceAbove > spaceBelow;
            const maxH = Math.min(600, (isAbove ? spaceAbove : spaceBelow) - 40);
            
            setTooltipPos({
              x: rect.left + rect.width / 2,
              y: isAbove ? rect.top - 10 : rect.bottom + 10,
              isAbove,
              maxH
            });
            // Don't translate immediately, wait for user to click or just show it's ready
            // For now, let's keep it automatic but add a log
            console.log("Text selected for translation:", selectedText);
            
            setTranslating(true);
            try {
              const result = await translateAndAnalyzeText(selectedText);
              setTranslation(result);
            } catch (error) {
              console.error("Translation error:", error);
              setTranslation("Lỗi khi kết nối AI để dịch.");
            } finally {
              setTranslating(false);
            }
          }
        }
      } else {
        // Only clear if we clicked outside the tooltip
        const tooltip = document.getElementById('translation-tooltip');
        if (!tooltip || !tooltip.contains(e.target as Node)) {
          setTranslation(null);
          setTooltipPos(null);
        }
      }
    };

    let mouseMoveTimeout: any = null;
    const handleMouseMove = async (e: MouseEvent) => {
      if (!e.ctrlKey || !allowTranslation) return;
      
      // Clear previous if any
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) return; // Don't interfere with manual selection

      const x = e.clientX;
      const y = e.clientY;
      
      // Try to get word at point
      let range: Range | undefined;
      if ((document as any).caretRangeFromPoint) {
        range = (document as any).caretRangeFromPoint(x, y);
      } else if ((e as any).rangeParent) {
        // Firefox support
        range = document.createRange();
        range.setStart((e as any).rangeParent, (e as any).rangeOffset);
        range.setEnd((e as any).rangeParent, (e as any).rangeOffset);
      }

      if (range) {
        const node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          const content = node.textContent || "";
          const offset = range.startOffset;
          
          // Find word boundaries
          let start = offset;
          while (start > 0 && /\w/.test(content[start - 1])) start--;
          let end = offset;
          while (end < content.length && /\w/.test(content[end])) end++;
          
          const word = content.slice(start, end).trim();
          
          if (word && word.length > 1) {
            // Check if word is the same as last one to prevent redundant calls
            if (word === lastTranslatedWord.current) return;

            // Check if inside container AND NOT inside tooltip
            const tooltip = document.getElementById('translation-tooltip');
            const isInsideTooltip = tooltip?.contains(node);
            
            if (containerRef.current && containerRef.current.contains(node) && !isInsideTooltip) {
              // Debounce to avoid too many calls while moving mouse
              if (mouseMoveTimeout) clearTimeout(mouseMoveTimeout);
              
              mouseMoveTimeout = setTimeout(async () => {
                // Re-check if word is still the same and ctrl is still pressed
                if (word === lastTranslatedWord.current || isTranslatingRef.current) return;
                
                // Create a temporary range for the word to get its rect
                const wordRange = document.createRange();
                wordRange.setStart(node, start);
                wordRange.setEnd(node, end);
                const rect = wordRange.getBoundingClientRect();
                
                if (rect) {
                  const spaceAbove = rect.top;
                  const spaceBelow = window.innerHeight - rect.bottom;
                  const isAbove = spaceAbove > spaceBelow;
                  const maxH = Math.min(600, (isAbove ? spaceAbove : spaceBelow) - 40);
                  
                  setTooltipPos({
                    x: rect.left + rect.width / 2,
                    y: isAbove ? rect.top - 10 : rect.bottom + 10,
                    isAbove,
                    maxH
                  });

                  lastTranslatedWord.current = word;
                  setTranslating(true);
                  try {
                    const result = await translateAndAnalyzeText(word);
                    setTranslation(result);
                  } catch (error) {
                    console.error("Translation error:", error);
                    setTranslation("Lỗi khi kết nối AI để dịch.");
                  } finally {
                    setTranslating(false);
                  }
                }
              }, 200); // 200ms debounce
            }
          }
        }
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
      if (mouseMoveTimeout) clearTimeout(mouseMoveTimeout);
    };
  }, [allowTranslation]);

  const handleOptionSelect = (option: string) => {
    if (showAnswer) return;
    setSelectedOption(option);
    const isCorrect = option === question.correctAnswer;
    setShowAnswer(true);
    setTimeout(() => onAnswered(isCorrect, option), 1200);
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  const openLightbox = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsLightboxOpen(true);
  };

  const handleZoom = (delta: number) => {
    setScale(prev => Math.min(Math.max(1, prev + delta), 8));
  };

  const resetZoom = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    handleZoom(delta);
  };

  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (scale === 1) return;
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - position.x, y: clientY - position.y });
  };

  const doDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || scale === 1) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setPosition({
      x: clientX - dragStart.x,
      y: clientY - dragStart.y
    });
  };

  const stopDrag = () => setIsDragging(false);

  const handleToggleHelp = () => {
    const nextState = !showStudentHelp;
    setShowStudentHelp(nextState);
    if (nextState && onHelpUsed) {
      onHelpUsed();
    }
  };

  const questionImageData = useMemo(() => {
    if (question.imageIndex === undefined || question.imageIndex === null) {
      console.log("Question has no imageIndex", question.id);
      return null;
    }
    if (!images || !images[question.imageIndex]) {
      console.warn("Image data missing for index:", question.imageIndex, "Question:", question.id);
      return null;
    }
    const imgData = images[question.imageIndex];
    if (imgData.mimeType.includes('pdf')) {
      console.log("Image index points to a PDF, skipping display in QuestionCard", question.id);
      return null;
    }
    console.log("Loading image for question:", question.id, "Index:", question.imageIndex, "Mime:", imgData.mimeType);
    return `data:${imgData.mimeType};base64,${imgData.data}`;
  }, [question.imageIndex, images, question.id]);

  return (
    <div 
      ref={containerRef}
      className="bg-[#1e293b]/50 rounded-[2rem] p-8 border border-slate-700/50 shadow-2xl animate-in fade-in slide-in-from-bottom-6 relative w-full backdrop-blur-sm"
    >
      {/* Help Button (Student Side) - Only show if showHints is enabled in config */}
      {showHints && (
        <div className="absolute top-4 right-6 z-20 flex items-center gap-2">
          <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Trợ giúp</span>
          <button 
            onClick={handleToggleHelp}
            className={`w-10 h-5 rounded-full transition-all relative ${showStudentHelp ? 'bg-rose-600' : 'bg-slate-700'}`}
          >
            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${showStudentHelp ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
      )}

      {/* Translation Tooltip */}
      {tooltipPos && (isTranslating || translation) && createPortal(
        <div 
          id="translation-tooltip"
          className="fixed z-[9999] bg-slate-900/90 backdrop-blur-xl border border-indigo-500/50 rounded-[2rem] p-6 shadow-2xl w-[400px] max-w-[95vw] overflow-y-auto animate-in zoom-in-95 fade-in duration-200 custom-scrollbar group/tooltip"
          style={{ 
            left: tooltipPos.manualX !== undefined ? `${tooltipPos.manualX}px` : `${Math.max(200, Math.min(window.innerWidth - 200, tooltipPos.x))}px`, 
            top: tooltipPos.manualY !== undefined ? `${tooltipPos.manualY}px` : `${tooltipPos.y}px`,
            transform: tooltipPos.manualX !== undefined ? 'none' : (tooltipPos.isAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'),
            maxHeight: `${tooltipPos.maxH}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div 
            className="flex items-center gap-3 mb-4 border-b border-slate-800/50 pb-3 sticky top-0 bg-slate-900/95 z-10 -mx-6 -mt-6 p-6 rounded-t-[2rem] cursor-move select-none"
            onMouseDown={(e) => {
              isDraggingTooltip.current = true;
              const currentX = tooltipPos.manualX ?? (tooltipPos.x - (tooltipPos.manualX !== undefined ? 0 : 0)); // Simplified
              // We need to account for the transform if not manual
              let startX = e.clientX;
              let startY = e.clientY;
              
              const rect = e.currentTarget.parentElement?.getBoundingClientRect();
              if (rect) {
                tooltipDragStart.current = {
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top
                };
              }

              const handleGlobalMouseMove = (moveEvent: MouseEvent) => {
                if (!isDraggingTooltip.current) return;
                setTooltipPos(prev => {
                  if (!prev) return null;
                  return {
                    ...prev,
                    manualX: moveEvent.clientX - tooltipDragStart.current.x,
                    manualY: moveEvent.clientY - tooltipDragStart.current.y
                  };
                });
              };

              const handleGlobalMouseUp = () => {
                isDraggingTooltip.current = false;
                document.removeEventListener('mousemove', handleGlobalMouseMove);
                document.removeEventListener('mouseup', handleGlobalMouseUp);
              };

              document.addEventListener('mousemove', handleGlobalMouseMove);
              document.addEventListener('mouseup', handleGlobalMouseUp);
            }}
          >
            <div className="p-2 bg-indigo-500/20 rounded-xl">
              <Languages className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] block">AI Assistant</span>
              <span className="text-xs font-bold text-slate-300 uppercase tracking-tighter">Phân tích & Dịch thuật</span>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <div className="p-1.5 text-slate-600 group-hover/tooltip:text-slate-400 transition-colors">
                <Move className="w-3.5 h-3.5" />
              </div>
              <button 
                onClick={() => { setTranslation(null); setTooltipPos(null); lastTranslatedWord.current = null; }}
                className="p-2 hover:bg-slate-800 rounded-full text-slate-500 hover:text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {isTranslating ? (
            <div className="flex items-center gap-4 py-4">
              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
              <span className="text-sm text-slate-400 font-bold animate-pulse uppercase tracking-widest">Đang phân tích dữ liệu...</span>
            </div>
          ) : (
            <div className="text-lg text-slate-100 leading-relaxed font-medium whitespace-pre-wrap py-2">
              {translation}
            </div>
          )}
          
          {!tooltipPos.manualX && (
            tooltipPos.isAbove ? (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[12px] border-t-slate-900"></div>
            ) : (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-b-[12px] border-b-slate-900"></div>
            )
          )}
        </div>,
        document.body
      )}

      {isLightboxOpen && questionImageData && (
        <div 
          className="fixed inset-0 z-[300] bg-black/98 flex flex-col items-center justify-center animate-in fade-in duration-300 backdrop-blur-2xl overflow-hidden"
          onClick={() => setIsLightboxOpen(false)}
          onWheel={handleWheel}
        >
          <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-[310] bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center gap-4">
              <div className="bg-indigo-600/20 px-4 py-2 rounded-xl border border-indigo-500/30 text-indigo-400 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <Search className="w-4 h-4" /> Chế độ xem chi tiết điểm ảnh
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="flex bg-slate-900/80 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
                 <button onClick={(e) => { e.stopPropagation(); handleZoom(0.5); }} className="p-3 hover:bg-slate-800 text-slate-300 transition-colors border-r border-slate-700"><ZoomIn className="w-5 h-5" /></button>
                 <button onClick={(e) => { e.stopPropagation(); handleZoom(-0.5); }} className="p-3 hover:bg-slate-800 text-slate-300 transition-colors border-r border-slate-700"><ZoomOut className="w-5 h-5" /></button>
                 <button onClick={resetZoom} className="p-3 hover:bg-slate-800 text-slate-300 transition-colors"><RefreshCcw className="w-5 h-5" /></button>
              </div>
              <button className="bg-rose-600 hover:bg-rose-500 text-white p-3 rounded-2xl transition-all shadow-2xl active:scale-90" onClick={() => setIsLightboxOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div 
            className={`w-full h-full flex items-center justify-center transition-all ${isDragging ? 'cursor-grabbing' : (scale > 1 ? 'cursor-grab' : 'cursor-zoom-in')}`}
            onMouseDown={startDrag} onMouseMove={doDrag} onMouseUp={stopDrag} onMouseLeave={stopDrag} onTouchStart={startDrag} onTouchMove={doDrag} onTouchEnd={stopDrag}
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              ref={imageRef}
              src={questionImageData} 
              alt="Exercise Detail" 
              draggable={false}
              className="max-w-full max-h-full object-contain rounded-sm shadow-2xl select-none"
              style={{ 
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0.2, 1)'
              }}
            />
          </div>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-2xl font-bold text-slate-100 leading-snug tracking-tight">
          <LatexRenderer text={question.content} />
        </h3>
      </div>

      {showStudentHelp && (
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Gợi ý cho bạn</span>
          </div>
          <div className="text-sm text-amber-200/80 italic leading-relaxed">
            <LatexRenderer text={question.explanation} />
          </div>
        </div>
      )}

      {/* Removed the old auto-show hint block */}

      <div className={`grid gap-6 items-start ${questionImageData ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        <div className="space-y-2">
          {question.options && question.options.map((option, idx) => {
            const label = String.fromCharCode(65 + idx);
            const isCorrect = option === question.correctAnswer;
            const isSelected = option === selectedOption;
            
            let borderColor = 'border-slate-800/80';
            let bgColor = 'bg-[#1e293b]/30';
            let textColor = 'text-slate-300';

            if (showAnswer) {
              if (isCorrect) { borderColor = 'border-emerald-500/60'; bgColor = 'bg-emerald-500/10'; textColor = 'text-emerald-400'; }
              else if (isSelected) { borderColor = 'border-rose-500/60'; bgColor = 'bg-rose-500/10'; textColor = 'text-rose-400'; }
            } else if (isSelected) {
              borderColor = 'border-indigo-500'; bgColor = 'bg-indigo-500/20'; textColor = 'text-indigo-100';
            }

            return (
              <button
                key={idx}
                disabled={showAnswer}
                onClick={() => handleOptionSelect(option)}
                className={`w-full flex items-center text-left p-3.5 rounded-2xl border-2 transition-all duration-300 group ${borderColor} ${bgColor} ${!showAnswer && 'hover:bg-[#1e293b]/50 active:scale-95'}`}
              >
                <div className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl mr-4 font-black text-lg transition-all ${showAnswer && isCorrect ? 'bg-emerald-500 text-white' : (isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700')}`}>
                  {label}
                </div>
                <div className={`flex-1 text-lg font-bold ${textColor}`}>
                  <LatexRenderer text={option} />
                </div>
                {showAnswer && isCorrect && <CheckCircle2 className="w-6 h-6 text-emerald-500 ml-2 animate-in zoom-in" />}
                {showAnswer && isSelected && !isCorrect && <XCircle className="w-6 h-6 text-rose-500 ml-2 animate-in zoom-in" />}
              </button>
            );
          })}
        </div>

        {questionImageData && (
          <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-10">
            <div 
              className="relative rounded-[1.5rem] overflow-hidden border-2 border-slate-800 bg-[#0f172a]/80 p-6 flex flex-col items-center justify-center group shadow-xl min-h-[350px] cursor-zoom-in hover:border-indigo-500/50 transition-colors"
              onClick={openLightbox}
            >
               <div className="absolute top-6 left-6 flex items-center gap-2 bg-[#1e293b]/90 px-4 py-2 rounded-xl border border-slate-700 backdrop-blur-xl z-20">
                 <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                 <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">DỮ LIỆU HÌNH VẼ</span>
               </div>
               <div className="relative z-10 w-full flex justify-center">
                 {question.imageBox ? (
                   <CroppedImage 
                     src={questionImageData} 
                     box={question.imageBox} 
                     alt="Exercise" 
                     className="w-full rounded-xl shadow-2xl transition-all duration-700 group-hover:scale-105" 
                   />
                 ) : (
                   <img src={questionImageData} alt="Exercise" className="max-w-full max-h-[320px] object-contain rounded-xl shadow-2xl transition-all duration-700 group-hover:scale-105" />
                 )}
               </div>
               <div className="mt-4 flex items-center gap-2 text-slate-500 text-[9px] font-bold uppercase tracking-widest z-20">
                 <ZoomIn className="w-3 h-3" /> NHẤN ĐỂ XEM CHI TIẾT
               </div>
            </div>
          </div>
        )}
      </div>

      {showAnswer && (
        <div className="mt-8 flex flex-col gap-4 border-t border-slate-800 pt-6 animate-in slide-in-from-top-6">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${showExplanation ? 'bg-indigo-600 text-white' : 'bg-slate-900/40 text-slate-500 hover:text-white border border-slate-800'}`}
          >
            <HelpCircle className="w-4 h-4" /> {showExplanation ? "ẨN LỜI GIẢI" : "XEM LỜI GIẢI CHI TIẾT"}
          </button>
          {showExplanation && (
            <div className="p-6 rounded-2xl bg-[#0f172a]/90 border border-indigo-500/30 text-slate-200 text-lg leading-relaxed italic animate-in fade-in zoom-in-95">
              <LatexRenderer text={question.explanation} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default QuestionCard;
export { LatexRenderer };
