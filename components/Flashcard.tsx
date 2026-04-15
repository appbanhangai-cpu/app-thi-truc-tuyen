
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCw } from 'lucide-react';

interface FlashcardProps {
  front: string;
  back: string;
}

const Flashcard: React.FC<FlashcardProps> = ({ front, back }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div 
      className="relative w-full h-48 cursor-pointer perspective-1000 group"
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <motion.div
        className="w-full h-full relative preserve-3d transition-all duration-500"
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: 'spring', stiffness: 260, damping: 20 }}
      >
        {/* Front Side */}
        <div className="absolute inset-0 backface-hidden bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-xl group-hover:border-indigo-500/50 transition-colors">
          <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2 opacity-50">Mặt trước</span>
          <h3 className="text-xl font-bold text-white leading-tight">{front}</h3>
          <div className="absolute bottom-4 right-4 text-slate-500 group-hover:text-indigo-400 transition-colors">
            <RotateCw className="w-4 h-4" />
          </div>
        </div>

        {/* Back Side */}
        <div 
          className="absolute inset-0 backface-hidden bg-indigo-900/40 border border-indigo-500/30 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-xl [transform:rotateY(180deg)]"
        >
          <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-2 opacity-50">Mặt sau</span>
          <p className="text-lg font-medium text-indigo-50">{back}</p>
          <div className="absolute bottom-4 right-4 text-indigo-400">
            <RotateCw className="w-4 h-4" />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Flashcard;
