// server/server.js
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import http from 'http'; // Socket.io için gerekli modül

// --- Config & Middleware ---
import connectDB from './config/database.js';
import { verifyToken } from './middleware/auth.js'; 
import { adminCheck } from './middleware/adminCheck.js'; 

// --- Services ---
import NotificationService from './services/NotificationService.js'; 

// --- Routes (Tüm Fazlar) ---
import authRoutes from './routes/auth.js';
import gameRoutes from './routes/game.js'; 
import shopRoutes from './routes/shop.js';
import petRoutes from './routes/pet.js';
import transferRoutes from './routes/transfer.js'; 
import friendsRoutes from './routes/friends.js'; 
import adminRoutes from './routes/admin.js'; 

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Express uygulamasını HTTP sunucusuna bağla
const httpServer = http.createServer(app); 

// Rate Limiting (Tüm API'lar için)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 100, // Her IP'den 100 istek
  message: 'Çok fazla istek. Lütfen daha sonra tekrar deneyin.'
});

// --- Güvenlik ve Middleware'ler ---
app.use(express.json()); 

// CORS AYARI: Sadece process.env.CORS_ORIGIN adresinden gelen isteklere izin verilir.
app.use(cors({ 
    origin: process.env.CORS_ORIGIN,
    credentials: true // JWT ve diğer kimlik bilgilerini geçirmeye izin verir
})); 
app.use(apiLimiter); 

// MongoDB Bağlantısı
connectDB();

// --- Socket.io Başlatma ---
NotificationService.initialize(httpServer, process.env.CORS_ORIGIN); 

// --- API Rotaları ---

// 1. Auth/Public Rotalar (JWT gerektirmez)
app.use('/api/auth', authRoutes);

// 2. Korumalı Rotalar (JWT gerektirir)
app.use('/api/game', verifyToken, gameRoutes);
app.use('/api/shop', verifyToken, shopRoutes); 
app.use('/api/pet', verifyToken, petRoutes); 
app.use('/api/transfer', verifyToken, transferRoutes);
app.use('/api/friends', verifyToken, friendsRoutes); 

// 3. ADMIN ROTALARI (Çift Korumalı)
app.use('/api/admin', verifyToken, adminCheck, adminRoutes); 

app.get('/', (req, res) => {
    // Vercel'in ana rotası için sağlık kontrolü
    res.send('Token Avcısı Ultimate Backend Çalışıyor! 🚀');
});

// Sunucuyu app.listen yerine httpServer.listen ile başlat
httpServer.listen(PORT, () => {
    console.log(`Sunucu ${PORT} adresinde çalışıyor`);
});