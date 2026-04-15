
import React, { useState, useEffect, useRef } from 'react';
import { motion, useAnimation, animate } from 'framer-motion';

interface WheelProps {
  items: string[];
  onFinished: (winner: string) => void;
  isSpinning: boolean;
}

const Wheel: React.FC<WheelProps> = ({ items, onFinished, isSpinning }) => {
  const [rotation, setRotation] = useState(0);
  const prevRotationRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  
  const colors = [
    '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', 
    '#f43f5e', '#f97316', '#eab308', '#22c55e', 
    '#06b6d4', '#3b82f6'
  ];

  // Khởi tạo âm thanh
  const playTick = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (e) {
      console.warn("Audio error", e);
    }
  };

  const playWin = () => {
    try {
      if (!audioCtxRef.current) return;
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {}
  };

  const spin = () => {
    if (items.length === 0) return;
    
    // Tạo cảm giác xổ số: Quay rất nhiều vòng và dừng lại cực kỳ từ từ
    const extraSpins = 8 + Math.random() * 5;
    const degreesPerItem = 360 / items.length;
    const randomOffset = Math.random() * degreesPerItem;
    const finalRotation = prevRotationRef.current + extraSpins * 360 + randomOffset;
    
    let lastTickAngle = prevRotationRef.current;

    animate(prevRotationRef.current, finalRotation, {
      duration: 6, // Thời gian quay lâu hơn cho kịch tính
      ease: [0.1, 0, 0.1, 1], // Easing kiểu xổ số: Khởi động nhanh, dừng cực chậm
      onUpdate: (latest) => {
        setRotation(latest);
        
        // Phát tiếng "tách" khi đi qua mỗi ô
        const sliceAngle = 360 / items.length;
        if (Math.abs(latest - lastTickAngle) >= sliceAngle) {
          playTick();
          lastTickAngle = latest;
        }
      },
      onComplete: () => {
        prevRotationRef.current = finalRotation;
        playWin();
        
        // Tính toán người chiến thắng
        // Do quay ngược chiều kim đồng hồ hoặc do pointer ở trên cùng (90 độ)
        const normalizedRotation = (360 - (finalRotation % 360)) % 360;
        const winnerIndex = Math.floor(normalizedRotation / degreesPerItem);
        onFinished(items[winnerIndex]);
      }
    });
  };

  useEffect(() => {
    if (isSpinning) {
      spin();
    }
  }, [isSpinning]);

  if (items.length === 0) {
    return (
      <div className="w-full max-w-[300px] aspect-square flex items-center justify-center border-4 border-dashed border-slate-700 rounded-full text-slate-500 font-bold bg-slate-900/30">
        CHƯA CÓ HỌC SINH
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[300px] aspect-square mx-auto flex items-center justify-center">
      {/* Glow effect background */}
      <div className="absolute inset-0 rounded-full bg-indigo-500/10 blur-[60px] animate-pulse"></div>

      {/* Pointer (Kim chỉ) */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 w-8 h-10 flex flex-col items-center drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
        <div className="w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[25px] border-t-rose-500"></div>
        <div className="w-1.5 h-1.5 bg-white rounded-full -mt-1.5 shadow-inner"></div>
      </div>

      <div
        className="w-full h-full relative rounded-full overflow-hidden border-[8px] border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_20px_rgba(99,102,241,0.3)] bg-slate-900"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
          <defs>
            {colors.map((color, i) => (
              <linearGradient id={`grad-${i}`} key={i} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style={{ stopColor: color, stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.8 }} />
              </linearGradient>
            ))}
          </defs>
          {items.map((item, i) => {
            const angle = 360 / items.length;
            const startAngle = i * angle;
            const endAngle = (i + 1) * angle;
            
            const x1 = 50 + 50 * Math.cos((startAngle * Math.PI) / 180);
            const y1 = 50 + 50 * Math.sin((startAngle * Math.PI) / 180);
            const x2 = 50 + 50 * Math.cos((endAngle * Math.PI) / 180);
            const y2 = 50 + 50 * Math.sin((endAngle * Math.PI) / 180);
            
            const largeArc = angle > 180 ? 1 : 0;
            
            return (
              <g key={i}>
                <path
                  d={`M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                  fill={`url(#grad-${i % colors.length})`}
                  className="stroke-slate-900/30 stroke-[0.2]"
                />
                <g transform={`rotate(${startAngle + angle / 2}, 50, 50)`}>
                  <text
                    x="75"
                    y="50"
                    fill="white"
                    fontSize={items.length > 20 ? "2" : "3.5"}
                    fontWeight="900"
                    textAnchor="middle"
                    className="pointer-events-none drop-shadow-md select-none"
                    style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}
                  >
                    {item.length > 12 ? item.substring(0, 10) + '..' : item}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      
      {/* Center circle (Trục vòng quay) */}
      <div className="absolute w-12 h-12 bg-slate-800 rounded-full border-4 border-slate-700 z-10 shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-center justify-center">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 border-2 border-white/20 flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></div>
        </div>
      </div>
      
      {/* Outer decoration lights */}
      <div className="absolute inset-[-6px] rounded-full border border-white/5 pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <div 
            key={i}
            className="absolute w-1.5 h-1.5 bg-white/40 rounded-full shadow-[0_0_6px_white]"
            style={{
              top: `${50 + 52 * Math.sin((i * 30 * Math.PI) / 180)}%`,
              left: `${50 + 52 * Math.cos((i * 30 * Math.PI) / 180)}%`,
              transform: 'translate(-50%, -50%)'
            }}
          ></div>
        ))}
      </div>
    </div>
  );
};

export default Wheel;
