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

// API Routes
app.get("/api/health", (req, res) => res.json({ status: "ok", vercel: true }));
app.get("/api/ping", (req, res) => res.json({ pong: true }));

app.get("/api/bank", (req, res) => res.json({ 
    questionBank: state.questionBank, 
    lessonParsed: state.lessonParsed, 
    allowTranslation: state.allowTranslation, 
    currentSessionId: state.currentSessionId 
}));

app.post("/api/bank", (req, res) => {
    if (req.body.questionBank !== undefined) state.questionBank = req.body.questionBank;
    if (req.body.lessonParsed !== undefined) state.lessonParsed = req.body.lessonParsed;
    if (req.body.allowTranslation !== undefined) state.allowTranslation = req.body.allowTranslation;
    if (req.body.currentSessionId !== undefined) state.currentSessionId = req.body.currentSessionId;
    saveData(state);
    res.json({ success: true });
});

app.get("/api/results", (req, res) => res.json(state.examResults));

app.post("/api/submit-results", async (req, res) => {
    try {
        const result = req.body;
        if (!result.id) result.id = `res_${Date.now()}`;
        
        const exists = state.examResults.some((r: any) => r.id === result.id);
        if (!exists) {
            state.examResults = [result, ...state.examResults].slice(0, 100);
            saveData(state);
            syncToDrive();
        }

        const rank = result.score >= 9 ? "Xuất sắc" : result.score >= 8 ? "Giỏi" : result.score >= 6.5 ? "Khá" : result.score >= 5 ? "Trung bình" : "Yếu";
        
        // Sync to Google Sheet
        const sheetData = {
            sheetName: "BangDiem", 
            name: result.name, 
            className: result.className,
            subject: state.lessonParsed?.title || "Ôn tập", 
            correctCount: `${result.correctAnswers || 0}/${result.totalQuestions || 0}`,
            score: Number(result.score || 0), 
            rank: rank,
            date: new Date().toLocaleDateString('vi-VN'), 
            time: new Date().toLocaleTimeString('vi-VN')
        };

        const response = await fetch(state.googleSheetUrl, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(sheetData), 
            redirect: 'follow' 
        });
        
        res.json({ success: true, sheetSync: response.ok });
    } catch (e: any) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.post("/api/start-exam", async (req, res) => {
    const { name, className } = req.body;
    const sheetData = {
        sheetName: "BangDiem", name: name, className: className,
        subject: state.lessonParsed?.title || "Ôn tập", correctCount: "Đang thi...", score: "...", rank: "Đang làm bài",
        date: new Date().toLocaleDateString('vi-VN'), time: new Date().toLocaleTimeString('vi-VN')
    };
    try {
        await fetch(state.googleSheetUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sheetData), redirect: 'follow' });
    } catch (e) {}
    res.json({ success: true });
});

app.get('/api/auth/google/url', (req, res) => {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/api/auth/google/callback`;
    const url = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'], prompt: 'consent', redirect_uri: redirectUri });
    res.json({ url });
});

app.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code as string);
        state.googleTokens = tokens;
        saveData(state);
        res.send(`<html><body><script>if(window.opener){window.opener.postMessage({type:'GOOGLE_AUTH_SUCCESS'},'*');window.close();}else{window.location.href='/';}</script></body></html>`);
    } catch (e) { res.status(500).send('Auth failed'); }
});

app.post('/api/drive/config', (req, res) => {
    if (req.body.fileId) { state.googleDriveFileId = req.body.fileId; saveData(state); res.json({ success: true }); }
    else res.status(400).json({ error: 'Missing fileId' });
});

app.post("/api/config/sheet", (req, res) => {
    if (req.body.url !== undefined) { state.googleSheetUrl = req.body.url; saveData(state); res.json({ success: true }); }
    else res.status(400).json({ error: "Missing url" });
});

export default app;
