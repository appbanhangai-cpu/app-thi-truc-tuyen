
import React, { useState, useRef } from 'react';
import { GraduationCap, Settings, Play, Eye, X, Link as LinkIcon, ClipboardCheck, Info, Zap, Check } from 'lucide-react';
import { safeJsonParse } from '../utils.ts';

interface ExamTabProps {
  examMode: boolean;
  setExamMode: (val: boolean) => void;
  examStudentInfo: any;
  setExamStudentInfo: (val: any) => void;
  examQuestionCount: number;
  setExamQuestionCount: (val: number) => void;
  examTimeLimit: number;
  setExamTimeLimit: (val: number) => void;
  handleStartExam: () => void;
  sharedAppUrl: string;
  setSharedAppUrl: (val: string) => void;
  isLinkTransferred: boolean;
  setIsLinkTransferred: (val: boolean) => void;
  handleCopyExamLink: () => void;
  isExamActive: boolean;
  setActiveTab: (val: string) => void;
  setIsExamActive: (val: boolean) => void;
  setCurrentQuestionSet: (val: any[]) => void;
  setCurrentStudent: (val: any) => void;
  setTurnFinished: (val: boolean) => void;
  allowTranslation: boolean;
  setAllowTranslation: (val: boolean) => void;
  showHints: boolean;
  setShowHints: (val: boolean) => void;
  apiBase: string;
  questionBank: any[];
}

export const ExamTab = ({ 
  examMode, 
  setExamMode, 
  examStudentInfo, 
  setExamStudentInfo, 
  examQuestionCount, 
  setExamQuestionCount, 
  examTimeLimit, 
  setExamTimeLimit, 
  handleStartExam,
  sharedAppUrl,
  setSharedAppUrl,
  isLinkTransferred,
  setIsLinkTransferred,
  handleCopyExamLink,
  isExamActive,
  setActiveTab,
  setIsExamActive,
  setCurrentQuestionSet,
  setCurrentStudent,
  setTurnFinished,
  allowTranslation,
  setAllowTranslation,
  showHints,
  setShowHints,
  apiBase,
  questionBank
}: ExamTabProps) => {
  const [isEnteringPassword, setIsEnteringPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg overflow-hidden border border-amber-500/30 shadow-lg shadow-amber-500/10">
            <img 
              src="https://res.cloudinary.com/dukjtusv9/image/upload/v1776166988/Conlaso1_-_logo_kc8ie2.jpg" 
              alt="Logo" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tighter leading-none mb-0.5">PHÒNG THI</h2>
            <p className="text-slate-500 text-[8px] font-black uppercase tracking-widest">
              Thiết lập và quản lý
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cấu hình bài thi */}
        <div className="glass rounded-3xl p-4 sm:p-5 border-slate-800/50 shadow-xl">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-4 h-4 text-amber-400" />
            <h3 className="text-base font-black text-white uppercase tracking-tighter">Cấu hình</h3>
            
            <div className="ml-auto flex items-center gap-2">
              <button 
                onClick={async () => {
                  try {
                    const apiUrl = `${apiBase}/api/ping`;
                    const res = await fetch(apiUrl);
                    const text = await res.text();
                    
                    if (!res.ok) {
                      throw new Error(`Server returned ${res.status}: ${res.statusText}. URL: ${apiUrl}. Detail: ${text.substring(0, 100)}`);
                    }

                    let data;
                    try {
                      data = safeJsonParse(text, {});
                    } catch (e) {
                      console.error(`JSON parse error for ${apiUrl}. Content:`, text);
                      throw new Error(`Dữ liệu từ máy chủ không hợp lệ (JSON parse error). URL: ${apiUrl}. Nội dung: ${text.substring(0, 100)}`);
                    }
                    alert(`Kết nối máy chủ OK: ${JSON.stringify(data)}`);
                  } catch (e: any) {
                    alert(`Lỗi kết nối máy chủ: ${e.message}`);
                  }
                }}
                className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/80 rounded-lg border border-slate-700/50 hover:bg-slate-800 transition-all group"
                title="Kiểm tra kết nối máy chủ"
              >
                <Zap className="w-2.5 h-2.5 text-amber-500 group-hover:scale-125 transition-all" />
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Test API</span>
              </button>

              {isEnteringPassword ? (
                <div className="flex items-center gap-1 bg-slate-900 border border-amber-500/50 rounded-lg px-1.5 py-0.5 animate-in zoom-in-95">
                  <input 
                    type="password"
                    autoFocus
                    className="bg-transparent border-none outline-none text-[10px] text-white w-16 px-1 font-mono"
                    placeholder="Mật khẩu..."
                    value={passwordInput}
                    onChange={e => setPasswordInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (passwordInput === '2021') {
                          setShowHints(true);
                          setIsEnteringPassword(false);
                          setPasswordInput('');
                        } else {
                          alert('Mật khẩu không đúng!');
                          setPasswordInput('');
                        }
                      } else if (e.key === 'Escape') {
                        setIsEnteringPassword(false);
                        setPasswordInput('');
                      }
                    }}
                  />
                  <button 
                    onClick={() => {
                      if (passwordInput === '2021') {
                        setShowHints(true);
                        setIsEnteringPassword(false);
                        setPasswordInput('');
                      } else if (passwordInput.length > 0) {
                        alert('Mật khẩu không đúng!');
                        setPasswordInput('');
                      } else {
                        setIsEnteringPassword(false);
                      }
                    }}
                    className="text-emerald-500 hover:text-emerald-400 p-0.5"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => {
                      setIsEnteringPassword(false);
                      setPasswordInput('');
                    }}
                    className="text-slate-500 hover:text-rose-500 p-0.5"
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
                      setIsEnteringPassword(true);
                    } else {
                      setShowHints(false);
                    }
                  }}
                >
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest select-none">Gợi ý</span>
                  <div 
                    className={`w-6 h-3 rounded-full transition-all relative pointer-events-none ${showHints ? 'bg-amber-600' : 'bg-slate-700'}`}
                  >
                    <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${showHints ? 'left-3.5' : 'left-0.5'}`} />
                  </div>
                </button>
              )}
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-xl border border-slate-800">
              <div>
                <p className="text-white font-bold text-[10px]">Trạng thái phòng thi</p>
                <p className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Kích hoạt để thi</p>
              </div>
              <button 
                onClick={() => {
                  if (questionBank.length === 0) {
                    alert("Bạn hãy TẢI LÊN NGÂN HÀNG CÂU HỎI File.JSON trước khi kích hoạt phòng thi");
                    return;
                  }
                  setExamMode(!examMode);
                }}
                className={`w-8 h-4 rounded-full transition-all relative ${examMode ? 'bg-amber-600' : 'bg-slate-700'} ${questionBank.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${examMode ? 'left-4.5' : 'left-0.5'}`} />
              </button>
            </div>

            {examMode && (
              <div className="space-y-3 animate-in slide-in-from-top-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Số câu hỏi</label>
                    <input 
                      list="exam-question-counts"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-bold outline-none focus:border-amber-500 transition-all"
                      value={examQuestionCount === 0 ? '' : examQuestionCount}
                      onChange={e => setExamQuestionCount(e.target.value === '' ? 0 : parseInt(e.target.value))}
                      placeholder="Chọn hoặc nhập..."
                    />
                    <datalist id="exam-question-counts">
                      {[10, 20, 30, 40, 50, 60, 80, 100, 120, 150].map(num => (
                        <option key={num} value={num} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Thời gian</label>
                    <div className="relative">
                      <input 
                        type="number"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-bold outline-none focus:border-amber-500 transition-all"
                        value={examTimeLimit === 0 ? '' : examTimeLimit}
                        onChange={e => setExamTimeLimit(e.target.value === '' ? 0 : parseInt(e.target.value))}
                      />
                      <span className="absolute right-2 top-2 text-[8px] text-slate-500 font-black uppercase">Phút</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Tên học sinh & Lớp</label>
                  <input 
                    placeholder="VD: Bảo Minh + Lớp 10A"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-bold outline-none focus:border-amber-500 transition-all"
                    value={examStudentInfo.name}
                    onChange={e => setExamStudentInfo({...examStudentInfo, name: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => {
                      console.log("BẮT ĐẦU button clicked. Bank size:", questionBank.length);
                      if (isExamActive) {
                        setActiveTab('dashboard');
                      } else {
                        if (questionBank.length === 0) {
                          alert("Bạn hãy TẢI LÊN NGÂN HÀNG CÂU HỎI File.JSON trước khi bấm BẮT ĐẦU");
                          return;
                        }
                        handleStartExam();
                      }
                    }}
                    className={`w-full ${isExamActive ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-amber-600 hover:bg-amber-500'} text-white font-black text-[10px] uppercase rounded-xl py-2.5 transition-all shadow-xl shadow-amber-500/20 active:scale-95 flex items-center justify-center gap-2`}
                  >
                    {isExamActive ? <Eye className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {isExamActive ? 'XEM PHÒNG' : 'BẮT ĐẦU'}
                  </button>

                  {isExamActive && (
                    <button 
                      onClick={() => {
                        if (confirm("Bạn có chắc chắn muốn kết thúc phòng thi ngay lập tức?")) {
                          setIsExamActive(false);
                          setCurrentQuestionSet([]);
                          setCurrentStudent(null);
                          setTurnFinished(false);
                        }
                      }}
                      className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] uppercase rounded-xl py-2.5 transition-all shadow-xl shadow-rose-500/20 active:scale-95 flex items-center justify-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      KẾT THÚC
                    </button>
                  )}
                </div>

                {/* Nút Chuyển Link theo yêu cầu người dùng */}
                <div className="flex justify-end pt-1">
                  <button 
                    onClick={() => {
                      let currentUrl = window.location.origin;
                      if (currentUrl.includes('-dev-')) {
                        currentUrl = currentUrl.replace('-dev-', '-pre-');
                      }
                      setSharedAppUrl(currentUrl);
                      setIsLinkTransferred(true);
                      const input = document.querySelector('input[placeholder="Dán Shared App URL từ AI Studio..."]') as HTMLInputElement;
                      if (input) {
                        input.focus();
                        input.classList.add('ring-1', 'ring-emerald-500');
                        setTimeout(() => input.classList.remove('ring-1', 'ring-emerald-500'), 1000);
                      }
                    }}
                    className={`flex items-center gap-1.5 ${isLinkTransferred ? 'text-emerald-500' : 'text-rose-500 hover:text-rose-400'} transition-all group`}
                  >
                    <span className={`text-[9px] ${isLinkTransferred ? 'font-black' : 'font-bold'} uppercase tracking-tighter`}>
                      {isLinkTransferred ? 'Đã chuyển Link' : 'Chuyển Link'}
                    </span>
                    <div className="flex items-center">
                      <div className={`w-3 h-0.5 ${isLinkTransferred ? 'bg-emerald-500' : 'bg-rose-500'} group-hover:w-4 transition-all`}></div>
                      <div className={`w-1.5 h-1.5 border-t border-r ${isLinkTransferred ? 'border-emerald-500' : 'border-rose-500'} rotate-45 -ml-1`}></div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Link chia sẻ */}
        <div className="glass rounded-3xl p-4 sm:p-5 border-slate-800/50 shadow-xl">
          <div className="flex items-center gap-2 mb-3">
            <LinkIcon className="w-4 h-4 text-emerald-400" />
            <h3 className="text-base font-black text-white uppercase tracking-tighter">Chia sẻ</h3>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
              <button 
                onClick={handleCopyExamLink}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] uppercase rounded-xl py-3 transition-all shadow-xl shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2 mb-4"
              >
                <ClipboardCheck className="w-4 h-4" />
                SAO CHÉP LINK
              </button>

              <p className="text-[9px] text-slate-400 leading-relaxed mb-3 border-t border-emerald-500/10 pt-3 uppercase tracking-widest font-bold">
                Học sinh truy cập link này để thi.
              </p>
              
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Shared App URL (Dự phòng)</label>
                  <input 
                    type="text"
                    placeholder="Dán Shared App URL..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-[10px] text-emerald-400 font-mono outline-none focus:border-emerald-500 transition-all"
                    value={sharedAppUrl}
                    onChange={e => setSharedAppUrl(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl flex items-start gap-2">
              <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-[9px] text-white font-black uppercase tracking-widest">Lưu ý</p>
                <p className="text-[8px] text-slate-500 leading-relaxed uppercase font-bold">
                  Hệ thống tự động ghi nhận kết quả và giám sát.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamTab;
