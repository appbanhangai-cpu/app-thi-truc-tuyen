
import { GoogleGenAI, Type } from "@google/genai";
import { Question, Difficulty, LanguageMode } from "../types";
import { safeJsonParse } from '../utils.ts';

export const extractAndAnalyzeLesson = async (text: string, mediaFiles?: {data: string, mimeType: string}[]): Promise<any> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Thiếu GEMINI_API_KEY. Vui lòng kiểm tra cấu hình hệ thống.");
  }
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-flash-latest";
  
  const prompt = `Bạn là một chuyên gia Hóa học và Toán học hàng đầu. Nhiệm vụ của bạn là trích xuất và hệ thống lại kiến thức TOÀN DIỆN dựa trên các tài liệu được cung cấp (văn bản, ảnh chụp, PDF).
  LƯU Ý QUAN TRỌNG: 
  - CHỈ trích xuất thông tin có trong tài liệu. KHÔNG tự ý thêm kiến thức bên ngoài trừ khi cần thiết để làm rõ nội dung.
  - PHẢI trích xuất các thông số, sơ đồ, hình vẽ một cách chi tiết.
  - Ghi nhớ thứ tự file được cung cấp: File 1 là index 0, File 2 là index 1...
  - Mọi công thức Toán/Lý/Hóa PHẢI được viết bằng định dạng LaTeX trong dấu $...$ hoặc $$...$$ (ví dụ: $x^2$, $H_2SO_4$).
  - Đối với công thức hóa học, hãy sử dụng định dạng LaTeX chuẩn với chỉ số dưới (ví dụ: $Fe_2O_3$ thay vì \\ce{Fe2O3}).
  - TUYỆT ĐỐI không sử dụng các từ "undefined" hoặc "null" trong nội dung văn bản.
  
  Hãy chuẩn hóa thành các mục: concepts, formulas, examples, commonMistakes, summary, flashcards.
  - flashcards: Danh sách các từ vựng, thuật ngữ quan trọng (đặc biệt là tiếng Anh - tiếng Việt nếu có) để học tập. Mỗi flashcard gồm "front" (mặt trước - từ/thuật ngữ) và "back" (mặt sau - nghĩa/giải thích).
  Trả về định dạng JSON nghiêm ngặt.`;

  const parts: any[] = [{ text: prompt }];
  
  if (text && text.trim()) {
    parts.push({ text: `Dữ liệu văn bản: \n${text}` });
  }

  if (mediaFiles && mediaFiles.length > 0) {
    // Chỉ gửi tối đa 10 file media để tránh quá tải payload
    mediaFiles.slice(0, 10).forEach((file, index) => {
      parts.push({ text: `--- HÌNH ẢNH INDEX ${index} ---` });
      parts.push({
        inlineData: {
          mimeType: file.mimeType || "application/pdf",
          data: file.data,
        },
      });
    });
  }

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
          formulas: { type: Type.ARRAY, items: { type: Type.STRING } },
          examples: { type: Type.ARRAY, items: { type: Type.STRING } },
          commonMistakes: { type: Type.ARRAY, items: { type: Type.STRING } },
          summary: { type: Type.STRING },
          flashcards: { 
            type: Type.ARRAY, 
            items: { 
              type: Type.OBJECT, 
              properties: { 
                front: { type: Type.STRING }, 
                back: { type: Type.STRING } 
              },
              required: ["front", "back"]
            } 
          },
        },
        required: ["concepts", "formulas", "summary"],
      },
    },
  });

  try {
    const responseText = response.text;
    if (!responseText) {
      throw new Error("AI không trả về nội dung. Có thể do nội dung bị chặn bởi bộ lọc an toàn.");
    }
    return safeJsonParse(responseText, { concepts: [], formulas: [], summary: "" });
  } catch (e: any) {
    console.error("Lỗi parse JSON bài học:", e);
    throw new Error(`Lỗi phân tích phản hồi từ AI: ${e.message}. Vui lòng thử lại.`);
  }
};

export const extractStudents = async (text?: string, mediaFiles?: {data: string, mimeType: string}[]): Promise<{name: string, phone?: string}[]> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Thiếu GEMINI_API_KEY. Vui lòng kiểm tra cấu hình hệ thống.");
  }
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-flash-latest";
  const prompt = `Hãy trích xuất danh sách HỌ VÀ TÊN và SỐ ĐIỆN THOẠI từ dữ liệu được cung cấp.
  Trả về kết quả dưới dạng mảng JSON các đối tượng {name, phone}.`;

  const parts: any[] = [{ text: prompt }];
  if (text) parts.push({ text: `Dữ liệu văn bản: ${text}` });
  if (mediaFiles && mediaFiles.length > 0) {
    mediaFiles.forEach((file) => {
      parts.push({ inlineData: { mimeType: file.mimeType || "application/pdf", data: file.data } });
    });
  }

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: { name: { type: Type.STRING }, phone: { type: Type.STRING } },
          required: ["name"]
        }
      },
    },
  });

  try {
    const responseText = response.text;
    if (!responseText) {
      throw new Error("AI không trả về dữ liệu học sinh. Có thể do file không chứa thông tin hợp lệ.");
    }
    return safeJsonParse(responseText, []);
  } catch (e: any) {
    console.error("Lỗi trích xuất học sinh:", e);
    throw new Error(`Lỗi trích xuất danh sách học sinh: ${e.message}. Vui lòng thử lại.`);
  }
};

export const generateQuestions = async (
  lessonData: any, 
  config: { 
    count: number; 
    difficulty: Difficulty; 
    mcqRatio: number; 
    keywords: string; 
    language: string; 
    optionsCount: number;
    subject?: string;
    educationLevel?: string;
    languageMode?: string;
    questionCategories?: string[];
  },
  mediaFiles?: {data: string, mimeType: string}[]
): Promise<Question[]> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Thiếu GEMINI_API_KEY. Vui lòng kiểm tra cấu hình hệ thống.");
  }
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-flash-latest";
  
  const contextPrompt = `
  MÔN HỌC: ${config.subject || 'Chưa xác định'}
  CẤP ĐỘ: ${config.educationLevel || 'Trung học phổ thông'}
  CHẾ ĐỘ: ${config.languageMode || 'Chế độ kiểm tra chung'}
  LOẠI CÂU HỎI: ${config.questionCategories?.join(', ') || 'Hỗn hợp'}
  `;

  const isEnglishSubject = config.subject?.toLowerCase().includes('anh') || config.subject?.toLowerCase().includes('english') || config.language === 'en';

  const vocabularyPrompt = config.languageMode === LanguageMode.VOCABULARY
    ? `YÊU CẦU ĐẶC BIỆT CHO CHẾ ĐỘ TỪ VỰNG:
    - Nhiệm vụ: Trích xuất các từ vựng/thuật ngữ quan trọng từ bài học và tạo câu hỏi kiểm tra nghĩa.
    - Cấu trúc: Đảo nhau 1 câu hỏi Anh-Việt, 1 câu hỏi Việt-Anh (50% mỗi loại).
    - Dạng 1 (Anh-Việt): Content là từ tiếng Anh, Options là các nghĩa tiếng Việt.
    - Dạng 2 (Việt-Anh): Content là từ tiếng Việt, Options là các từ tiếng Anh.
    - VÍ DỤ Dạng 1: "erupt" -> A. di chuyển, B. phun trào, C. bay lên, D. biến mất. Đáp án: B.
    - VÍ DỤ Dạng 2: "Ô tô" -> A. Car, B. Dog, C. Cat, D. Flow. Đáp án: A.
    - Tag: LUÔN LÀ "Vocabulary".
    - Content câu hỏi phải cực kỳ ngắn gọn (chỉ 1 từ hoặc cụm từ).`
    : "";

  const langPrompt = isEnglishSubject && config.languageMode !== LanguageMode.VOCABULARY
    ? `YÊU CẦU ĐẶC BIỆT CHO MÔN TIẾNG ANH:
    - ĐÂY LÀ MÔN TIẾNG ANH. TUYỆT ĐỐI KHÔNG tạo câu hỏi toàn bằng tiếng Việt.
    - PHẦN NỘI DUNG CÂU HỎI (content) BẮT BUỘC PHẢI BẰNG TIẾNG ANH.
    - Đối với các câu hỏi về phát âm (pronunciation), hãy sử dụng thẻ <u>...</u> để gạch chân phần cần kiểm tra. Ví dụ: "Choose the word whose underlined part is pronounced differently: A. h<u>o</u>me, B. g<u>o</u>, C. d<u>o</u>, D. n<u>o</u>"
    - Bạn có thể tạo 2 dạng câu hỏi và TRỘN chúng:
       Dạng 1 (Full English): Câu hỏi và tất cả đáp án đều bằng tiếng Anh.
       Dạng 2 (Kiểm tra từ vựng): Câu hỏi bằng tiếng Anh, các lựa chọn đáp án bằng tiếng Việt.
    - VÍ DỤ: "What does 'sustainable' mean?" -> A. Bền vững, B. Tạm thời...
    - NGHIÊM CẤM: Không được đặt câu hỏi kiểu "Nghĩa của từ 'sustainable' là gì?" hoàn toàn bằng tiếng Việt.` 
    : "YÊU CẦU: Tất cả câu hỏi và đáp án PHẢI bằng TIẾNG VIỆT.";

  const keywordPrompt = config.keywords && config.keywords.trim() 
    ? `\n  TRỌNG TÂM: Các câu hỏi PHẢI tập trung vào các chủ đề/từ khóa sau: ${config.keywords}.` 
    : "";

  const systemInstruction = `BẠN LÀ CHUYÊN GIA THIẾT KẾ ĐỀ THI VỚI KHẢ NĂNG PHÂN TÍCH HÌNH ẢNH CỰC KỲ CHÍNH XÁC. 
  
  ${vocabularyPrompt}

  QUY TẮC TỐI THƯỢNG VỀ SCHEMA JSON (BẮT BUỘC):
  - Không được sáng tạo schema. Phải copy đúng format chuẩn 100%.
  - Mỗi object phải có đủ 10 field: id, type, content, options, correctAnswer, explanation, difficulty, imageBox, imageIndex, tag.
  - type: LUÔN LÀ "multiple_choice".
  - difficulty: CHỈ DÙNG "Easy", "Medium", hoặc "Hard".
  - id: Format Q001, Q002, Q003... (zero-padding 3 chữ số, tăng dần, không trùng).
  - tag: CHỈ DÙNG các tag sau: Vocabulary, Grammar, Reading, Pronunciation, Word Stress, Communication, Sentence Transformation, Error Identification.

  QUY TẮC NỘI DUNG & ĐA DẠNG:
  - Tránh trùng lặp: Không lặp lại cùng 1 từ/cấu trúc quá 3 lần. Nếu lặp, phải đổi dạng câu hỏi (MCQ, điền từ, tìm lỗi sai, viết lại câu...).
  - Đa dạng hóa: Không để 1 dạng câu chiếm >70% ngân hàng. Trộn các dạng: nghĩa từ, điền từ, lỗi sai, viết lại câu, tình huống.
  - Phân bổ độ khó: 
    + Easy: Nhận diện, điền đơn giản.
    + Medium: Cần hiểu cấu trúc, phân biệt.
    + Hard: Suy luận, bẫy, kết hợp nhiều kiến thức.
  - Distractor (Đáp án gây nhiễu): Phải cùng loại từ, cùng cấu trúc, "có vẻ đúng" chứ không vô lý.

  QUY TẮC VỀ HÌNH ẢNH:
  1. NGHIÊM CẤM HIỂN THỊ HÌNH ẢNH CHỈ CHỨA CHỮ (VĂN BẢN). Trích xuất chữ vào 'content' và đặt imageIndex = null.
  2. CHỈ DÙNG imageIndex KHI CÓ ĐỒ HỌA: Biểu đồ, đồ thị, hình vẽ thí nghiệm, sơ đồ, hình minh họa trực quan.
  3. QUY TẮC CROP (imageBox): Tọa độ [ymin, xmin, ymax, xmax] (0-1000). PHẢI CẮT BỎ TOÀN BỘ CHỮ, chỉ lấy phần hình vẽ đồ họa.
  4. NẾU CÒN PHÂN VÂN: Hãy đặt imageIndex = null và trích xuất chữ. Thà thiếu ảnh còn hơn để ảnh chứa chữ.
  
  KIỂM TRA TRƯỚC KHI XUẤT (CHECKLIST):
  - Có đủ 10 field cho mỗi câu hỏi chưa?
  - ID có đúng format Qxxx chưa?
  - type và difficulty có đúng chuẩn tiếng Anh chưa?
  - Tag có thuộc danh sách chuẩn chưa?
  - Có câu nào bị trùng nội dung không?

  QUY TẮC KHÁC:
  - CHỈ tạo câu hỏi dựa trên nội dung kiến thức cung cấp.
  - Công thức Toán/Lý/Hóa PHẢI nằm trong cặp dấu $...$.
  - Mỗi câu có đúng ${config.optionsCount} lựa chọn.
  - ${langPrompt}`;

  const prompt = `BỐI CẢNH: ${contextPrompt}
  Dựa trên kiến thức: ${JSON.stringify(lessonData)}.
  Nhiệm vụ: Tạo ${config.count} câu hỏi trắc nghiệm.${keywordPrompt}
  Trả về mảng JSON các đối tượng Question.`;
  
  const parts: any[] = [{ text: prompt }];
  if (mediaFiles && mediaFiles.length > 0) {
    // Chỉ gửi tối đa 10 file media để tránh quá tải payload
    mediaFiles.slice(0, 10).forEach((file, index) => {
      parts.push({ text: `--- HÌNH ẢNH INDEX ${index} ---` });
      parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
    });
  }


  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            type: { type: Type.STRING },
            difficulty: { type: Type.STRING },
            content: { type: Type.STRING, description: "Nội dung câu hỏi. BẮT BUỘC trích xuất toàn bộ văn bản từ hình ảnh vào đây nếu hình ảnh đó chứa chữ." },
            imageIndex: { type: Type.NUMBER, nullable: true, description: "CHỈ dùng nếu có hình vẽ/đồ họa. TUYỆT ĐỐI để null nếu hình ảnh chỉ là chữ hoặc đoạn văn." },
            imageBox: { type: Type.ARRAY, items: { type: Type.NUMBER }, nullable: true, description: "Tọa độ [ymin, xmin, ymax, xmax] (0-1000). PHẢI CẮT BỎ TOÀN BỘ CHỮ, chỉ lấy phần hình vẽ đồ họa." },
            options: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: config.optionsCount, maxItems: config.optionsCount },
            correctAnswer: { type: Type.STRING },
            explanation: { type: Type.STRING },
            tag: { type: Type.STRING, description: "Tag chuẩn: Vocabulary, Grammar, Reading, Pronunciation, Word Stress, Communication, Sentence Transformation, Error Identification." },
          },
          required: ["id", "type", "content", "options", "correctAnswer", "explanation", "difficulty", "imageBox", "imageIndex", "tag"],
        },
      },
    },
  });

  try {
    const text = response.text;
    if (!text) {
      throw new Error("AI không trả về nội dung câu hỏi. Có thể do nội dung bị chặn bởi bộ lọc an toàn.");
    }
    const questions = safeJsonParse(text, []);
    if (!questions || questions.length === 0) {
      throw new Error("AI trả về dữ liệu trống hoặc không đúng định dạng JSON.");
    }
    
    // Chuẩn hóa câu hỏi: xử lý nhãn A, B, C, D và xáo trộn đáp án
    return questions.map((q: any) => {
      if (q.options && q.options.length > 0) {
        // 1. Xác định nội dung thực sự của đáp án đúng
        let actualCorrectText = q.correctAnswer || "";
        const trimmedCorrect = String(actualCorrectText).trim();
        
        // Nếu correctAnswer chỉ là một chữ cái (A, B, C, D...)
        if (trimmedCorrect.length === 1 && /^[A-Z]$/i.test(trimmedCorrect)) {
          const letter = trimmedCorrect.toUpperCase();
          // Tìm option bắt đầu bằng chữ cái đó (ví dụ "A." hoặc "A ")
          const foundOption = q.options.find((opt: string) => {
            const tOpt = String(opt).trim().toUpperCase();
            return tOpt.startsWith(letter + ".") || tOpt.startsWith(letter + " ");
          });
          
          if (foundOption) {
            actualCorrectText = foundOption;
          } else {
            // Nếu không tìm thấy theo nhãn, thử dùng chữ cái như một chỉ số (A=0, B=1...)
            const index = letter.charCodeAt(0) - 65;
            if (index >= 0 && index < q.options.length) {
              actualCorrectText = q.options[index];
            }
          }
        }

        // 2. Làm sạch các tùy chọn (loại bỏ tiền tố "A. ", "B. " nếu có)
        const cleanText = (t: string) => String(t).replace(/^[A-Z][.\s]\s*/i, '').trim();
        
        const cleanedOptions = q.options.map(cleanText);
        const cleanedCorrect = cleanText(actualCorrectText);

        // 3. Xáo trộn ngẫu nhiên
        const shuffled = [...cleanedOptions].sort(() => Math.random() - 0.5);

        return {
          ...q,
          options: shuffled,
          correctAnswer: cleanedCorrect
        };
      }
      return q;
    });
  } catch (e: any) {
    console.error("Lỗi parse JSON câu hỏi:", e);
    throw new Error(`Lỗi phân tích câu hỏi từ AI: ${e.message}. Vui lòng thử lại.`);
  }
};

export const extractQuestionsFromPDF = async (mediaFile: {data: string, mimeType: string}): Promise<Question[]> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Thiếu GEMINI_API_KEY. Vui lòng kiểm tra cấu hình hệ thống.");
  }
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-flash-latest";
  
  const prompt = `Bạn là một chuyên gia trích xuất dữ liệu. Nhiệm vụ của bạn là đọc file PDF được cung cấp và trích xuất TẤT CẢ các câu hỏi trắc nghiệm có trong đó.
  
  QUY TẮC BẮT BUỘC:
  1. Mỗi câu hỏi phải có đầy đủ 10 field: id, type, content, options, correctAnswer, explanation, difficulty, imageBox, imageIndex, tag.
  2. type: LUÔN LÀ "multiple_choice".
  3. difficulty: "Easy", "Medium", hoặc "Hard" (Dựa trên mức độ tư duy).
  4. id: Q001, Q002, Q003... (zero-padding 3 chữ số).
  5. tag: Vocabulary, Grammar, Reading, Pronunciation, Word Stress, Communication, Sentence Transformation, Error Identification.
  6. Mọi công thức Toán/Lý/Hóa PHẢI được viết bằng định dạng LaTeX trong cặp dấu $...$.
  7. Trả về kết quả dưới dạng mảng JSON các đối tượng Question.
  
  Cấu trúc JSON:
  - id: Qxxx
  - type: "multiple_choice"
  - content: nội dung câu hỏi
  - options: mảng các chuỗi lựa chọn
  - correctAnswer: nội dung đáp án đúng
  - explanation: lời giải chi tiết
  - difficulty: "Easy" | "Medium" | "Hard"
  - imageBox: null
  - imageIndex: null
  - tag: Tag chuẩn từ danh sách trên`;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { text: prompt },
        { inlineData: { mimeType: mediaFile.mimeType, data: mediaFile.data } }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            type: { type: Type.STRING },
            difficulty: { type: Type.STRING },
            content: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswer: { type: Type.STRING },
            explanation: { type: Type.STRING },
            imageBox: { type: Type.ARRAY, items: { type: Type.NUMBER }, nullable: true },
            imageIndex: { type: Type.NUMBER, nullable: true },
            tag: { type: Type.STRING },
          },
          required: ["id", "type", "content", "options", "correctAnswer", "explanation", "difficulty", "imageBox", "imageIndex", "tag"],
        },
      },
    },
  });

  try {
    const text = response.text;
    if (!text) {
      throw new Error("AI không trả về nội dung từ PDF. Có thể do file quá lớn hoặc bị chặn.");
    }
    const questions = safeJsonParse(text, []);
    if (!questions || questions.length === 0) {
      throw new Error("Không tìm thấy câu hỏi nào trong file PDF hoặc lỗi định dạng JSON.");
    }
    
    // Chuẩn hóa câu hỏi: xử lý nhãn A, B, C, D
    return questions.map((q: any) => {
      if (q.options && q.options.length > 0) {
        let actualCorrectText = q.correctAnswer || "";
        const trimmedCorrect = String(actualCorrectText).trim();
        
        if (trimmedCorrect.length === 1 && /^[A-Z]$/i.test(trimmedCorrect)) {
          const letter = trimmedCorrect.toUpperCase();
          const foundOption = q.options.find((opt: string) => {
            const tOpt = String(opt).trim().toUpperCase();
            return tOpt.startsWith(letter + ".") || tOpt.startsWith(letter + " ");
          });
          
          if (foundOption) {
            actualCorrectText = foundOption;
          } else {
            const index = letter.charCodeAt(0) - 65;
            if (index >= 0 && index < q.options.length) {
              actualCorrectText = q.options[index];
            }
          }
        }

        const cleanText = (t: string) => String(t).replace(/^[A-Z][.\s]\s*/i, '').trim();
        const cleanedOptions = q.options.map(cleanText);
        const cleanedCorrect = cleanText(actualCorrectText);

        return {
          ...q,
          options: cleanedOptions,
          correctAnswer: cleanedCorrect
        };
      }
      return q;
    });
  } catch (e: any) {
    console.error("Lỗi parse JSON trích xuất câu hỏi:", e);
    throw new Error(`Lỗi trích xuất câu hỏi từ PDF: ${e.message}. Vui lòng thử lại.`);
  }
};

export const translateAndAnalyzeText = async (text: string): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return "Lỗi: Thiếu API Key.";
  }
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-flash-latest";
  
  const prompt = `Bạn là một chuyên gia ngôn ngữ học. Hãy xử lý văn bản sau một cách CỰC KỲ NGẮN GỌN:
  1. Dịch sang tiếng Việt (ngắn gọn, sát nghĩa).
  2. Chỉ tên THÌ (Tense) của câu, KHÔNG giải thích dài dòng.
  
  Định dạng trả về duy nhất:
  [Bản dịch]
  ---
  Thì: [Tên thì]
  
  Văn bản: "${text}"`;

  const response = await ai.models.generateContent({
    model,
    contents: { parts: [{ text: prompt }] },
  });

  return response.text || "Không thể dịch đoạn văn bản này.";
};
