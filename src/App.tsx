import { motion } from 'motion/react';
import { Sparkles, Heart, Smile, Users, Baby, PawPrint, Sun, Moon } from 'lucide-react';
import LiveAudio from './components/LiveAudio';

const signs = [
  {
    id: 1,
    title: "Diện mạo trẻ hơn tuổi",
    description: "Người có phúc khí lớn thường có tâm hồn tươi trẻ, điều này phản chiếu ra diện mạo bên ngoài, giúp họ trông trẻ trung và tràn đầy sức sống hơn so với tuổi thật.",
    icon: <Sparkles className="w-8 h-8 text-amber-600" />,
    color: "bg-amber-50",
    image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: 2,
    title: "Gương mặt có duyên, dễ gần",
    description: "Sự hiền hậu và thiện lương toát ra từ ánh mắt, nụ cười khiến người đối diện cảm thấy ấm áp, tin tưởng và muốn kết giao ngay từ lần đầu gặp gỡ.",
    icon: <Smile className="w-8 h-8 text-rose-600" />,
    color: "bg-rose-50",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: 3,
    title: "Được trẻ nhỏ và động vật yêu thích",
    description: "Trẻ em và động vật có trực giác rất nhạy bén. Chúng thường bị thu hút bởi những người có năng lượng tích cực, ôn hòa và nhân hậu.",
    icon: <div className="flex gap-1"><Baby className="w-6 h-6 text-sky-600" /><PawPrint className="w-6 h-6 text-sky-600" /></div>,
    color: "bg-sky-50",
    image: "https://images.unsplash.com/photo-1484665754804-74b091211472?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: 4,
    title: "Sống tâm lành, thiện nhiều hơn ác",
    description: "Luôn giữ tâm thế bao dung, giúp đỡ mọi người mà không mưu cầu báo đáp. Họ tin vào nhân quả và luôn chọn con đường lương thiện trong mọi hoàn cảnh.",
    icon: <Heart className="w-8 h-8 text-emerald-600" />,
    color: "bg-emerald-50",
    image: "https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: 5,
    title: "Mang lại sự đông vui, nhộn nhịp",
    description: "Sự hiện diện của họ như một luồng gió mới, mang lại niềm vui, tiếng cười và sự gắn kết cho tập thể. Đi đến đâu, họ cũng thu hút những điều may mắn và tốt lành.",
    icon: <Users className="w-8 h-8 text-indigo-600" />,
    color: "bg-indigo-50",
    image: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=800&q=80"
  }
];

export default function App() {
  return (
    <div className="min-h-screen bg-[#f5f5f0] selection:bg-[#5A5A40] selection:text-white">
      {/* Hero Section */}
      <header className="relative h-[80vh] flex flex-col items-center justify-center overflow-hidden px-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="text-center z-10"
        >
          <span className="uppercase tracking-[0.3em] text-xs font-semibold text-[#5A5A40] mb-4 block">Tâm Linh & Cuộc Sống</span>
          <h1 className="serif text-5xl md:text-7xl font-light mb-6 leading-tight">
            5 Dấu Hiệu Của Người <br />
            <span className="italic font-medium">Có Phúc Khí Lớn</span>
          </h1>
          <p className="max-w-xl mx-auto text-gray-600 leading-relaxed font-light text-lg">
            Phúc khí không tự nhiên mà có, nó là kết quả của quá trình tu dưỡng tâm tính và sống thiện lương. Hãy cùng khám phá những dấu hiệu này.
          </p>
        </motion.div>

        {/* Decorative Elements */}
        <div className="absolute top-20 left-10 opacity-10">
          <Sun className="w-32 h-32 text-[#5A5A40]" />
        </div>
        <div className="absolute bottom-20 right-10 opacity-10">
          <Moon className="w-32 h-32 text-[#5A5A40]" />
        </div>
        
        <motion.div 
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 3 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
        >
          <div className="w-[1px] h-20 bg-gradient-to-b from-[#5A5A40] to-transparent" />
        </motion.div>
      </header>

      {/* Content Section */}
      <main className="max-w-6xl mx-auto px-6 py-24 space-y-32">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {signs.map((sign, index) => (
            <motion.div
              key={sign.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="group bg-white rounded-[2rem] shadow-sm border border-black/5 overflow-hidden hover:shadow-xl hover:-translate-y-2 transition-all duration-500"
            >
              <div className="relative h-48 overflow-hidden">
                <img 
                  src={sign.image} 
                  alt={sign.title} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
              </div>
              <div className="p-8">
                <div className={`w-12 h-12 ${sign.color} rounded-xl flex items-center justify-center mb-6`}>
                  {sign.icon}
                </div>
                <h3 className="serif text-2xl font-medium mb-4">{sign.title}</h3>
                <p className="text-gray-600 leading-relaxed font-light text-sm">
                  {sign.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Live Audio Section */}
        <section className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="serif text-4xl font-light mb-4">Trò Chuyện Trực Tiếp</h2>
            <p className="text-gray-500 max-w-lg mx-auto">
              Sử dụng giọng nói của bạn để trò chuyện với AI về những dấu hiệu này hoặc bất kỳ điều gì bạn đang băn khoăn trong cuộc sống.
            </p>
          </div>
          <LiveAudio />
        </section>
      </main>

      {/* Footer */}
      <footer className="py-20 border-t border-black/5 text-center">
        <div className="serif text-3xl font-light italic mb-8">"Tâm sinh tướng, mệnh do mình."</div>
        <div className="text-xs uppercase tracking-widest text-gray-400">
          &copy; 2026 Phúc Khí App &bull; Trí Tuệ Nhân Tạo & Tâm Linh
        </div>
      </footer>
    </div>
  );
}
