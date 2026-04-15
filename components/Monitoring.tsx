
import React, { useRef, useEffect, useState } from 'react';
import { AlertCircle, Eye, Monitor, Loader2 } from 'lucide-react';

export const CameraMonitor = ({ onFrame, className, minimal = false }: { onFrame?: (frame: string) => void, className?: string, minimal?: boolean }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onFrameRef = useRef(onFrame);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);

  // Cập nhật ref khi onFrame thay đổi mà không làm trigger useEffect
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let interval: any = null;

    const startCamera = async () => {
      setError(null);
      setIsCameraReady(false);
      console.log("[Camera] Starting camera, retry:", retryCount);
      
      // Kiểm tra xem có phải trình duyệt trong ứng dụng (Zalo, Facebook, v.v.) không
      const ua = navigator.userAgent;
      const isInAppBrowser = /Zalo|FBAN|FBAV|Instagram|Messenger/i.test(ua);
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error("[Camera] getUserMedia not supported");
        setError("Trình duyệt không hỗ trợ Camera. Hãy dùng Chrome hoặc Safari.");
        return;
      }

      try {
        // Thử các bộ constraints từ phức tạp đến đơn giản
        const constraintOptions = [
          { 
            video: { 
              facingMode: "user",
              width: { ideal: 640 }, 
              height: { ideal: 480 }
            },
            audio: false 
          },
          { 
            video: { facingMode: "user" },
            audio: false 
          },
          { 
            video: true,
            audio: false 
          }
        ];

        let lastError = null;
        let success = false;
        
        for (const constraints of constraintOptions) {
          try {
            console.log("[Camera] Trying constraints:", constraints);
            
            // Thêm timeout cho getUserMedia
            const streamPromise = navigator.mediaDevices.getUserMedia(constraints);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Timeout")), 8000)
            );
            
            stream = await Promise.race([streamPromise, timeoutPromise]) as MediaStream;
            
            if (stream) {
              success = true;
              console.log("[Camera] Successfully got stream");
              break;
            }
          } catch (e: any) {
            lastError = e;
            console.warn("[Camera] Constraint failed, trying next...", constraints, e);
            // Nếu lỗi là PermissionDenied, không cần thử constraint khác
            if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
              break;
            }
          }
        }

        if (!success || !stream) {
          if (isInAppBrowser) {
            setError("Hãy mở bằng Chrome/Safari để dùng Camera");
          } else {
            throw lastError || new Error("Không thể truy cập camera");
          }
          return;
        }
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Đảm bảo video thực sự chạy trên mobile
          try {
            await videoRef.current.play();
            setIsCameraReady(true);
            console.log("[Camera] Video playing");
          } catch (playErr) {
            console.warn("[Camera] Auto-play was prevented", playErr);
            // Thử lại sau 1s nếu bị chặn
            setTimeout(() => {
              if (videoRef.current) {
                videoRef.current.play()
                  .then(() => {
                    setIsCameraReady(true);
                    console.log("[Camera] Video playing after retry");
                  })
                  .catch(e => {
                    console.error("[Camera] Retry play failed", e);
                    setError("Không thể phát video camera");
                  });
              }
            }, 1000);
          }
        }

        interval = setInterval(() => {
          if (videoRef.current && canvasRef.current && videoRef.current.readyState >= 2) {
            const canvas = canvasRef.current;
            const video = videoRef.current;
            
            const videoWidth = video.videoWidth || 320;
            const videoHeight = video.videoHeight || 240;
            const targetWidth = 160;
            const targetHeight = (videoHeight / videoWidth) * targetWidth;
            
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            
            const ctx = canvas.getContext('2d', { alpha: false });
            if (ctx) {
              // Xóa bộ lọc đen trắng để khôi phục màu sắc
              ctx.filter = 'none';
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const frame = canvas.toDataURL('image/jpeg', 0.4);
              if (onFrameRef.current) {
                onFrameRef.current(frame.split(',')[1]);
              }
            }
          }
        }, 4000);
      } catch (err: any) {
        console.error("[Camera] Error accessing camera:", err);
        let msg = "Lỗi Camera";
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          msg = "Hãy cho phép truy cập Camera trong cài đặt";
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          msg = "Không tìm thấy Camera. Hãy đóng các ứng dụng khác đang dùng Camera.";
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          msg = "Camera đang bận bởi ứng dụng khác";
        }
        setError(msg);
      }
    };

    startCamera();

    return () => {
      console.log("[Camera] Cleaning up camera stream");
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (interval) clearInterval(interval);
    };
  }, [retryCount]);

  return (
    <div className={className || "relative w-32 h-40 bg-slate-900 rounded-2xl border border-indigo-500/30 overflow-hidden shadow-2xl group"}>
      <canvas ref={canvasRef} className="hidden" />
      {error ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-800">
          <AlertCircle className="w-6 h-6 text-rose-500 mb-1" />
          <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter leading-tight mb-1">{error}</span>
          {/Zalo|FBAN|FBAV|Instagram|Messenger/i.test(navigator.userAgent) && (
            <span className="text-[7px] text-amber-500 font-bold uppercase mb-1">Bấm (...) chọn "Mở bằng trình duyệt"</span>
          )}
          <button 
            onClick={() => setRetryCount(prev => prev + 1)}
            className="mt-1 px-2 py-1 bg-indigo-600 rounded text-[8px] text-white font-bold uppercase hover:bg-indigo-500 transition-colors"
          >
            Thử lại
          </button>
        </div>
      ) : (
        <div className="w-full h-full relative">
          {!isCameraReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
              <Loader2 className="w-4 h-4 text-indigo-500 animate-spin mb-1" />
              <span className="text-[7px] text-slate-500 font-bold uppercase tracking-widest">Đang tải...</span>
            </div>
          )}
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover transition-all duration-500"
          />
        </div>
      )}
      {!minimal && (
        <>
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-rose-500/80 px-1.5 py-0.5 rounded text-[8px] text-white font-black uppercase animate-pulse">
            <div className="w-1 h-1 bg-white rounded-full"></div>
            LIVE
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
            <p className="text-[8px] text-white font-black uppercase tracking-tighter text-center">Giám sát thi</p>
          </div>
        </>
      )}
    </div>
  );
};

export const MonitoringTab = ({ students, wsStatus }: { students: any[], wsStatus: 'connecting' | 'connected' | 'disconnected' }) => {
  const [testStatus, setTestStatus] = useState<{ loading: boolean, success?: boolean, message?: string } | null>(null);

  const handleTestSheet = async () => {
    setTestStatus({ loading: true });
    try {
      const response = await fetch('/api/test-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      if (result.success) {
        const bodyPreview = result.body ? ` (Phản hồi: ${result.body.substring(0, 50)})` : '';
        setTestStatus({ loading: false, success: true, message: `Kết nối thành công!${bodyPreview}` });
      } else {
        let errorMsg = result.error || 'Không xác định';
        if (result.body && result.body.includes('<!DOCTYPE html>')) {
          errorMsg = "Sai địa chỉ Web App (Bạn đang dán link Sheet thay vì link Script)";
        }
        const bodyPreview = result.body ? ` - Phản hồi: ${result.body.substring(0, 150)}` : '';
        setTestStatus({ loading: false, success: false, message: `Lỗi: ${errorMsg}${bodyPreview}` });
        console.error("[Sheet Test] Failed:", result);
      }
    } catch (error) {
      setTestStatus({ loading: false, success: false, message: 'Lỗi mạng khi kiểm tra kết nối.' });
    }
    // Tự động ẩn thông báo sau 5 giây
    setTimeout(() => setTestStatus(null), 10000);
  };

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-rose-600/20 rounded-lg border border-rose-500/30 shadow-lg shadow-rose-500/10">
            <Eye className="w-5 h-5 text-rose-500" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h2 className="text-xl font-black text-white uppercase tracking-tighter leading-none">GIÁM SÁT</h2>
              <div className={`px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest flex items-center gap-1 ${
                wsStatus === 'connected' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                wsStatus === 'connecting' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}>
                <div className={`w-1 h-1 rounded-full ${
                  wsStatus === 'connected' ? 'bg-emerald-500 animate-pulse' :
                  wsStatus === 'connecting' ? 'bg-amber-500 animate-bounce' :
                  'bg-red-500'
                }`} />
                {wsStatus === 'connected' ? 'Connected' : 
                 wsStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
              </div>
            </div>
            <p className="text-slate-500 text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
              <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span>
              {students.length} thí sinh trực tuyến
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <a 
            href="https://docs.google.com/spreadsheets/d/1zAR6ihXWLZW9CcKUtQjEjG4PVlJisoxO4UmEjLX0iAQ/edit?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-rose-500/30 shadow-lg flex items-center gap-2"
          >
            <Monitor className="w-3 h-3" />
            Xem bảng điểm Google Sheet
          </a>

          <button 
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-slate-700 shadow-lg flex items-center gap-1.5"
          >
            <Loader2 className="w-2.5 h-2.5" />
            Làm mới
          </button>

          <button 
            onClick={handleTestSheet}
            disabled={testStatus?.loading}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border shadow-lg flex items-center gap-1.5 ${
              testStatus?.loading ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed' :
              testStatus?.success === true ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' :
              testStatus?.success === false ? 'bg-red-600/20 text-red-400 border-red-500/30' :
              'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border-indigo-500/30'
            }`}
          >
            {testStatus?.loading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <AlertCircle className="w-2.5 h-2.5" />}
            Kiểm tra kết nối Sheet
          </button>
        </div>
      </div>

      {testStatus?.message && (
        <div className={`mb-4 p-3 rounded-xl border text-[10px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-2 duration-300 ${
          testStatus.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {testStatus.message}
        </div>
      )}

      {students.length === 0 ? (
        <div className="glass rounded-3xl p-8 border-slate-800/50 flex flex-col items-center justify-center text-center shadow-xl">
          <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center mb-3 border border-slate-800 shadow-inner">
            <Monitor className="w-6 h-6 text-slate-700" />
          </div>
          <h3 className="text-base font-black text-slate-400 mb-1 uppercase tracking-tighter">Chưa có thí sinh</h3>
          <p className="text-slate-600 text-[10px] max-w-xs font-medium uppercase tracking-widest">Hình ảnh camera sẽ xuất hiện tại đây.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
          {students.map((s) => (
            <div key={s.studentId} className="glass rounded-2xl overflow-hidden border-slate-800 hover:border-rose-500/50 transition-all duration-300 group relative shadow-xl">
              <div className="aspect-video bg-slate-900 relative overflow-hidden">
                {s.lastFrame ? (
                  <img 
                    src={`data:image/jpeg;base64,${s.lastFrame}`} 
                    alt={s.name} 
                    className="w-full h-full object-cover transition-all duration-700 scale-105 group-hover:scale-100"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                    <Loader2 className="w-4 h-4 text-slate-800 animate-spin" />
                    <span className="text-[7px] text-slate-700 font-black uppercase tracking-widest">Loading</span>
                  </div>
                )}
                <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-rose-600/90 px-1 py-0.5 rounded text-[7px] text-white font-black uppercase tracking-tighter shadow-lg z-10">
                  <div className="w-1 h-1 bg-white rounded-full animate-pulse"></div>
                  LIVE
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60"></div>
              </div>
              <div className="p-2 bg-slate-900/90 backdrop-blur-xl border-t border-slate-800/50 relative">
                <p className="text-white font-black text-[10px] uppercase truncate mb-0.5 tracking-tight leading-none">{s.name}</p>
                <div className="flex items-center justify-between">
                  <p className="text-indigo-400 text-[8px] font-black uppercase tracking-widest">{s.className}</p>
                  <span className="text-[7px] text-slate-500 font-bold uppercase">ID:{s.studentId.slice(-4)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
