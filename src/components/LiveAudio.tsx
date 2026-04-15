import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { Mic, MicOff, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function LiveAudio() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcription, setTranscription] = useState<string>("");
  const [aiTranscription, setAiTranscription] = useState<string>("");
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueue = useRef<Int16Array[]>([]);
  const isPlaying = useRef(false);

  const startConnection = async () => {
    try {
      setIsConnecting(true);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "Bạn là một chuyên gia về tâm linh và phong thủy. Hãy trò chuyện với người dùng về 5 dấu hiệu của người có phúc khí lớn: 1. Diện mạo trẻ hơn tuổi, 2. Gương mặt có duyên, 3. Được trẻ nhỏ và động vật yêu thích, 4. Sống tâm lành, 5. Mang lại sự đông vui. Hãy trả lời bằng tiếng Việt một cách nhẹ nhàng, sâu sắc.",
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            startAudioCapture();
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
              const binaryString = atob(base64Audio);
              const bytes = new Int16Array(binaryString.length / 2);
              for (let i = 0; i < bytes.length; i++) {
                bytes[i] = (binaryString.charCodeAt(i * 2) & 0xFF) | (binaryString.charCodeAt(i * 2 + 1) << 8);
              }
              audioQueue.current.push(bytes);
              if (!isPlaying.current) playNextInQueue();
            }

            if (message.serverContent?.interrupted) {
              audioQueue.current = [];
              isPlaying.current = false;
            }

            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
                // Handle text if any
            }
            
            // Handle transcriptions
            const serverContent = message.serverContent;
            if (serverContent?.modelTurn?.parts) {
                const text = serverContent.modelTurn.parts.map(p => p.text).join("");
                if (text) setAiTranscription(prev => prev + " " + text);
            }
          },
          onclose: () => {
            stopConnection();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            stopConnection();
          }
        }
      });

      sessionRef.current = session;
    } catch (error) {
      console.error("Failed to connect:", error);
      setIsConnecting(false);
    }
  };

  const stopConnection = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    stopAudioCapture();
    setIsConnected(false);
    setIsConnecting(false);
    audioQueue.current = [];
    isPlaying.current = false;
  };

  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMuted) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        if (sessionRef.current) {
          sessionRef.current.sendRealtimeInput({
            media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const stopAudioCapture = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const playNextInQueue = async () => {
    if (audioQueue.current.length === 0) {
      isPlaying.current = false;
      return;
    }

    isPlaying.current = true;
    const pcmData = audioQueue.current.shift()!;
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const buffer = audioContext.createBuffer(1, pcmData.length, 24000);
    const channelData = buffer.getChannelData(0);
    
    for (let i = 0; i < pcmData.length; i++) {
      channelData[i] = pcmData[i] / 0x7FFF;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.onended = () => {
      audioContext.close();
      playNextInQueue();
    };
    source.start();
  };

  return (
    <div className="flex flex-col items-center gap-6 p-8 bg-white/50 backdrop-blur-sm rounded-3xl border border-black/5 shadow-sm">
      <div className="text-center space-y-2">
        <h3 className="serif text-2xl font-medium">Trò chuyện cùng AI</h3>
        <p className="text-sm text-gray-500">Hỏi AI về phúc khí và vận mệnh của bạn</p>
      </div>

      <div className="relative">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={isConnected ? stopConnection : startConnection}
          disabled={isConnecting}
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-colors shadow-lg ${
            isConnected ? 'bg-red-500 text-white' : 'bg-[#5A5A40] text-white'
          }`}
        >
          {isConnecting ? (
            <Loader2 className="w-10 h-10 animate-spin" />
          ) : isConnected ? (
            <MicOff className="w-10 h-10" />
          ) : (
            <Mic className="w-10 h-10" />
          )}
        </motion.button>
        
        {isConnected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute -inset-2 border-2 border-red-500 rounded-full -z-10 opacity-20"
          />
        )}
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="p-3 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
        <div className="text-sm font-medium text-gray-600">
          {isConnected ? (isMuted ? "Đã tắt mic" : "Đang lắng nghe...") : (isConnecting ? "Đang kết nối..." : "Nhấn để bắt đầu")}
        </div>
      </div>

      <AnimatePresence>
        {isConnected && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="w-full max-w-md p-4 bg-gray-50 rounded-xl border border-gray-200"
          >
             <p className="text-xs uppercase tracking-wider text-gray-400 mb-2 font-bold">AI đang nói:</p>
             <p className="text-sm text-gray-700 italic leading-relaxed">
               {aiTranscription || "Đang chờ phản hồi..."}
             </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
