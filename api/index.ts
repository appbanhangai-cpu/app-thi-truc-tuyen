import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { google } from 'googleapis';
import cookieParser from 'cookie-parser';
import session from 'express-session';

const app = express();

// Middleware
app.use(cors({ origin: '*', credentials: false }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());
app.use(session({
    secret: 'exam-score-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true, sameSite: 'none', httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

const DATA_FILE = "/tmp/app_data.json"; // Vercel cho phép ghi vào /tmp
const DEFAULT_STATE = {
  questionBank: [],
  examResults: [],
  lessonParsed: null,
  allowTranslation: false,
  currentSessionId: 'Đợt thi mặc định',
  googleDriveFileId: '1CVB9NhOpEJxCfUbpGOVKJCrG51IG-b8n',
  googleTokens: null,
  googleSheetUrl: 'https://script.google.com/macros/s/AKfycbyOawiCl3Zr8Ez7wpXAo2oFW9lC3Xi6WE1vZSgpPelv2UBAL6856Ge8Gvh8i9YZEzhYeg/exec'
};

function safeJsonParse(str: string, fallback: any) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const content = fs.readFileSync(DATA_FILE, "utf-8");
      return safeJsonParse(content, { ...DEFAULT_STATE });
    } catch (e) { return { ...DEFAULT_STATE }; }
  }
  return { ...DEFAULT_STATE };
}

function saveData(data: any) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8"); } catch (e) {}
}

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const state = loadData();

// Helper to get Google Sheet URL with prioritized fallback
const getGoogleSheetUrl = () => {
    const envUrl = process.env.GOOGLE_SHEET_WEBAPP_URL;
    const stateUrl = state.googleSheetUrl;
    const isValidWebAppUrl = (url: string | undefined) => url && url.trim() && url.startsWith('https://script.google.com/macros/s/');
    
    if (isValidWebAppUrl(stateUrl)) return stateUrl.trim();
    if (isValidWebAppUrl(envUrl)) return envUrl!.trim();
    return DEFAULT_STATE.googleSheetUrl;
};

async function syncToDrive() {
    const tokens = state.googleTokens;
    const fileId = state.googleDriveFileId;
    if (!tokens || !fileId) return;
    try {
        oauth2Client.setCredentials(tokens);
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        await drive.files.update({
            fileId: fileId,
            media: { mimeType: 'application/json', body: JSON.stringify(state.examResults, null, 2) },
        });
    } catch (error) { console.error('[Drive] Sync Error:', error); }
}

// Request logging for debugging
app.use((req, res, next) => {
    if (req.url.startsWith('/api/')) {
        console.log(`[API Request] ${new Date().toISOString()} - ${req.method} ${req.url}`);
    }
    next();
});

// API Routes
app.get("/api/health", (req, res) => res.json({ status: "ok", vercel: true, version: "1.0.7" }));
app.get("/health", (req, res) => res.json({ status: "ok", vercel: true, version: "1.0.7", relative: true }));

app.get("/api/bank", (req, res) => res.json({ 
    questionBank: state.questionBank, 
    lessonParsed: state.lessonParsed, 
    allowTranslation: state.allowTranslation, 
    currentSessionId: state.currentSessionId 
}));
app.get("/bank", (req, res) => res.json({ 
    questionBank: state.questionBank, 
    lessonParsed: state.lessonParsed, 
    allowTranslation: state.allowTranslation, 
    currentSessionId: state.currentSessionId 
}));

app.post(["/api/bank", "/bank"], (req, res) => {
    if (req.body.questionBank !== undefined) state.questionBank = req.body.questionBank;
    if (req.body.lessonParsed !== undefined) state.lessonParsed = req.body.lessonParsed;
    if (req.body.allowTranslation !== undefined) state.allowTranslation = req.body.allowTranslation;
    if (req.body.currentSessionId !== undefined) state.currentSessionId = req.body.currentSessionId;
    saveData(state);
    res.json({ success: true });
});

app.get(["/api/results", "/results"], (req, res) => res.json(state.examResults));

app.post(["/api/submit-results", "/submit-results"], async (req, res) => {
    try {
        const result = req.body;
        console.log(`[API] Received submission for student: ${result?.name}`);

        if (!result || Object.keys(result).length === 0) {
            return res.status(400).json({ error: "Missing result data" });
        }

        if (!result.id) result.id = `res_${Date.now()}`;
        
        const exists = state.examResults.some((r: any) => r.id === result.id);
        if (!exists) {
            state.examResults = [result, ...state.examResults].slice(0, 200);
            saveData(state);
            syncToDrive();
        }

        const googleSheetUrl = getGoogleSheetUrl();
        const rank = result.score >= 9 ? "Xuất sắc" : result.score >= 8 ? "Giỏi" : result.score >= 6.5 ? "Khá" : result.score >= 5 ? "Trung bình" : "Yếu";
        
        // Format duration if available
        let durationDisplay = "...";
        if (result.duration !== undefined) {
            const mins = Math.floor(result.duration / 60);
            const secs = result.duration % 60;
            durationDisplay = `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        // Prepare sheet data
        const sheetData = {
            sheetName: "BangDiem", 
            name: result.name || "N/A", 
            className: result.className || "N/A",
            subject: result.subject || state.lessonParsed?.title || "Ôn tập", 
            correctCount: `${result.correctAnswers || 0}/${result.totalQuestions || 0}`,
            score: Number(result.score || 0), 
            rank: rank,
            duration: durationDisplay,
            date: new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }), 
            time: new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
        };

        console.log(`[API] Syncing to Sheet: ${googleSheetUrl}`);
        
        let syncStatus = "initiated";
        let attempt = 0;
        let lastErrorMsg = "";

        while (attempt < 2 && syncStatus !== "success") {
            attempt++;
            try {
                const response = await fetch(googleSheetUrl, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify(sheetData), 
                    redirect: 'follow' 
                });
                
                const respText = await response.text();
                console.log(`[API] Sheet Response (Attempt ${attempt}):`, respText.substring(0, 100));
                
                if (response.ok || respText.toLowerCase().includes("success")) {
                    syncStatus = "success";
                } else {
                    syncStatus = `failed: ${response.status}`;
                    lastErrorMsg = respText;
                }
            } catch (err: any) {
                console.error(`[API] Sheet Sync Error (Attempt ${attempt}):`, err.message);
                syncStatus = `error: ${err.message}`;
                lastErrorMsg = err.message;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        res.json({ 
            success: syncStatus === "success", 
            sheetSync: syncStatus === "success", 
            details: syncStatus !== "success" ? lastErrorMsg.substring(0, 100) : undefined
        });
    } catch (e: any) { 
        console.error("[API] Critical Error:", e.message);
        res.status(500).json({ error: e.message }); 
    }
});

app.post(["/api/start-exam", "/start-exam"], async (req, res) => {
    const { name, className, subject } = req.body;
    const googleSheetUrl = getGoogleSheetUrl();
    const sheetData = {
        sheetName: "BangDiem", 
        name: name, 
        className: className,
        subject: subject || state.lessonParsed?.title || "Ôn tập", 
        correctCount: "Đang thi...", 
        score: "...", 
        rank: "Đang làm bài",
        duration: "...",
        date: new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }), 
        time: new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    };
    try {
        await fetch(googleSheetUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sheetData), redirect: 'follow' });
    } catch (e) {}
    res.json({ success: true });
});

app.get(['/api/auth/google/url', '/auth/google/url'], (req, res) => {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/api/auth/google/callback`;
    const url = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'], prompt: 'consent', redirect_uri: redirectUri });
    res.json({ url });
});

app.get(['/api/auth/google/callback', '/auth/google/callback'], async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code as string);
        state.googleTokens = tokens;
        saveData(state);
        res.send(`<html><body><script>if(window.opener){window.opener.postMessage({type:'GOOGLE_AUTH_SUCCESS'},'*');window.close();}else{window.location.href='/';}</script></body></html>`);
    } catch (e) { res.status(500).send('Auth failed'); }
});

app.get(['/api/auth/google/status', '/auth/google/status'], (req, res) => res.json({ authenticated: !!state.googleTokens }));

app.post(['/api/drive/config', '/drive/config'], (req, res) => {
    if (req.body.fileId) { state.googleDriveFileId = req.body.fileId; saveData(state); res.json({ success: true }); }
    else res.status(400).json({ error: 'Missing fileId' });
});

app.post(["/api/config/sheet", "/config/sheet"], (req, res) => {
    if (req.body.url !== undefined) { state.googleSheetUrl = req.body.url; saveData(state); res.json({ success: true }); }
    else res.status(400).json({ error: "Missing url" });
});

// 404 API fallback - ensure JSON is returned for all /api requests
app.all("/api/*", (req, res) => {
    res.status(404).json({ error: "API Route not found", path: req.url, method: req.method });
});

export default app;
