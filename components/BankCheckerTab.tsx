import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Trash2, 
  Copy, 
  Save, 
  Download, 
  FileJson, 
  X, 
  SearchCheck,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Question } from '../types';

interface BankCheckerTabProps {
  initialQuestions: Question[];
  onSaveToBank: (questions: Question[]) => void;
  onClose: () => void;
}

const BankCheckerTab: React.FC<BankCheckerTabProps> = ({ 
  initialQuestions, 
  onSaveToBank,
  onClose
}) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState<'empty' | 'analyzing' | 'checked'>('empty');

  useEffect(() => {
    if (initialQuestions && initialQuestions.length > 0) {
      setQuestions([...initialQuestions]);
      setStatus('checked');
    }
  }, [initialQuestions]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus('analyzing');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          setQuestions(parsed);
          setStatus('checked');
        } else {
          alert('File JSON không hợp lệ. Phải là một mảng các câu hỏi.');
          setStatus('empty');
        }
      } catch (err) {
        alert('Lỗi khi đọc file JSON.');
        setStatus('empty');
      }
    };
    reader.readAsText(file);
  };

  const handleUpdateQuestion = (index: number, field: string, value: any) => {
    const newQuestions = [...questions];
    if (field === 'content') {
      newQuestions[index].content = value;
    } else if (field === 'explanation') {
      newQuestions[index].explanation = value;
    } else if (field.startsWith('option_')) {
      const optIdx = parseInt(field.split('_')[1]);
      newQuestions[index].options[optIdx] = value;
    }
    setQuestions(newQuestions);
  };

  const handleDeleteQuestion = (index: number) => {
    if (confirm('Bạn có chắc chắn muốn xóa câu hỏi này?')) {
      const newQuestions = questions.filter((_, i) => i !== index);
      setQuestions(newQuestions);
    }
  };

  const handleDuplicateQuestion = (index: number) => {
    const questionToDup = questions[index];
    const newQuestions = [...questions];
    newQuestions.splice(index + 1, 0, { ...questionToDup });
    setQuestions(newQuestions);
  };

  const handleDownload = () => {
    if (questions.length === 0) return;
    const blob = new Blob([JSON.stringify(questions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ngan_hang_cau_hoi_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getQuestionErrors = (q: Question) => {
    const errors: string[] = [];
    if (!q.content || q.content.trim() === '') errors.push('Nội dung câu hỏi trống');
    if (!q.options || q.options.length < 2) errors.push('Thiếu tùy chọn trả lời');
    if (q.options.some(opt => !opt || opt.trim() === '')) errors.push('Tùy chọn trả lời bị trống');
    if (!q.correctAnswer || !q.options.includes(q.correctAnswer)) errors.push('Đáp án không khớp với các tùy chọn');
    return errors;
  };

  const filteredQuestions = questions.filter(q => 
    q.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    q.options.some(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="glass rounded-3xl p-8 border-slate-800/50 shadow-2xl relative overflow-hidden h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-indigo-500"></div>
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-emerald-500/20 rounded-2xl shadow-inner">
            <SearchCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Kiểm tra lỗi sai của NH câu hỏi</h2>
            <p className="text-xs text-slate-400 uppercase font-black tracking-widest">Đảm bảo chất lượng ngân hàng trước khi thi</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-slate-800 rounded-2xl transition-all"
        >
          <X className="w-6 h-6 text-slate-400" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 overflow-hidden">
        {/* Left Panel: Controls */}
        <div className="lg:col-span-4 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
          <div className="p-6 bg-slate-900/80 rounded-3xl border border-slate-800 space-y-6 shadow-xl">
            {/* Upload Section */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Nạp dữ liệu từ File</label>
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-700 rounded-2xl cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group relative overflow-hidden">
                <div className="flex flex-col items-center justify-center p-5 text-center">
                  <FileJson className="w-10 h-10 text-slate-500 group-hover:text-emerald-400 mb-3 transition-colors" />
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest leading-relaxed">Dán hoặc Kéo thả File .JSON</p>
                </div>
                <input 
                  type="file" 
                  accept=".json" 
                  className="hidden" 
                  onChange={handleFileUpload}
                />
              </label>
            </div>

            {/* Analysis Section */}
            <div className="pt-6 border-t border-slate-800">
              <p className="text-[10px] text-slate-500 font-bold mb-4 uppercase tracking-[0.2em]">Phân tích dữ liệu</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black/40 p-4 rounded-2xl border border-slate-800/50 text-center">
                  <p className="text-[9px] text-slate-500 uppercase font-black mb-1 text-center">Tổng số câu</p>
                  <p className="text-2xl font-black text-white">{questions.length}</p>
                </div>
                <div className="bg-black/40 p-4 rounded-2xl border border-slate-800/50 text-center">
                  <p className="text-[9px] text-slate-500 uppercase font-black mb-1 text-center">Trạng thái</p>
                  <p className={`text-xs font-black uppercase ${questions.length > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {questions.length > 0 ? 'Sẵn sàng' : 'Trống'}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button 
                onClick={() => onSaveToBank(questions)}
                disabled={questions.length === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs uppercase py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 active:scale-95 flex items-center justify-center gap-2 group"
              >
                <Save className="w-4 h-4 group-hover:scale-110 transition-transform" />
                Lưu vào Ngân hàng
              </button>

              <button 
                onClick={handleDownload}
                disabled={questions.length === 0}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs uppercase py-4 rounded-2xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Tải file .JSON
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: List & Editor */}
        <div className="lg:col-span-8 flex flex-col overflow-hidden bg-slate-900/40 rounded-3xl border border-slate-800">
          <div className="p-5 bg-slate-800/30 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Nội dung chi tiết</h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Tìm kiếm câu hỏi..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-emerald-500/50 w-64 pl-10"
                />
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              </div>
              <div className="px-3 py-1 bg-emerald-500/10 rounded-lg">
                <span className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">
                  {filteredQuestions.length}/{questions.length} Câu
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {filteredQuestions.map((q, qIdx) => (
                <motion.div 
                  key={qIdx}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="group relative bg-black/40 rounded-2xl border border-slate-800 hover:border-indigo-500/40 transition-all duration-300 p-6"
                >
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-indigo-500/20 text-indigo-400 text-[10px] font-black rounded-lg uppercase tracking-widest">
                          Câu {questions.indexOf(q) + 1}
                        </span>
                        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-black rounded-lg uppercase tracking-widest ml-auto">
                          Trắc nghiệm
                        </span>
                      </div>

                      {getQuestionErrors(q).length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {getQuestionErrors(q).map((err, i) => (
                            <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-[9px] font-bold uppercase">
                              <AlertCircle className="w-3 h-3" />
                              {err}
                            </div>
                          ))}
                        </div>
                      )}

                      <textarea 
                        className="w-full bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-sm text-white leading-relaxed focus:border-indigo-500 outline-none transition-all resize-none shadow-inner"
                        rows={3}
                        value={q.content}
                        onChange={(e) => handleUpdateQuestion(questions.indexOf(q), 'content', e.target.value)}
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {q.options.map((opt, optIdx) => (
                          <div key={optIdx} className="relative group/opt">
                            <div className={`absolute inset-y-0 left-0 w-8 flex items-center justify-center text-[10px] font-black rounded-l-xl ${q.correctAnswer === opt ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                              {String.fromCharCode(65 + optIdx)}
                            </div>
                            <input 
                              type="text" 
                              className={`w-full bg-slate-900 border rounded-xl p-2.5 pl-10 text-xs text-white font-bold focus:border-emerald-500 outline-none transition-all ${q.correctAnswer === opt ? 'border-emerald-500/30' : 'border-slate-800'}`}
                              value={opt}
                              onChange={(e) => handleUpdateQuestion(questions.indexOf(q), `option_${optIdx}`, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                        <label className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-2 block">Giải thích chi tiết</label>
                        <textarea 
                          className="w-full bg-transparent border-none p-0 text-[11px] text-slate-400 leading-relaxed italic outline-none resize-none"
                          rows={2}
                          value={q.explanation || ''}
                          placeholder="Chưa có giải thích..."
                          onChange={(e) => handleUpdateQuestion(questions.indexOf(q), 'explanation', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => handleDeleteQuestion(questions.indexOf(q))}
                        className="p-2.5 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                        title="Xóa câu hỏi"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleDuplicateQuestion(questions.indexOf(q))}
                        className="p-2.5 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all"
                        title="Sao chép"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredQuestions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-bold uppercase tracking-widest text-xs">Không tìm thấy câu hỏi nào</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BankCheckerTab;
