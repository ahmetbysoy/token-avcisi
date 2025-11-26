// server/routes/game.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import GameSession from '../models/GameSession.js'; 
import AntiCheatService from '../services/AntiCheatService.js'; 

const router = express.Router();

// --- 1. OYUN DURUMUNU KAYDET (/api/game/save) ---
router.post(
    '/save',
    [
        body('tokens').isInt({ min: 0 }).withMessage('Token değeri pozitif tam sayı olmalı.'),
        body('xp').isFloat({ min: 0 }).withMessage('XP değeri pozitif olmalı.'),
        body('level').isInt({ min: 1 }).withMessage('Level en az 1 olmalı.'),
        body('size').isFloat({ min: 20, max: 2000 }).withMessage('Boyut geçerli aralıkta olmalı.'),
        body('speedUpgrade').isInt({ min: 0 }).withMessage('Hız yükseltme sayısı geçerli olmalı.'),
        body('penaltyFactor').isFloat({ min: 0.0001, max: 0.005 }).withMessage('Ceza faktörü geçerli aralıkta olmalı.'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.warn(`[ANTI-CHEAT WARNING] Kullanıcı ID: ${req.userId} hatalı veri göndermeye çalıştı.`);
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { 
                tokens, xp, level, size, 
                speedUpgrade, penaltyFactor, 
                skinColor 
            } = req.body;

            const user = await User.findById(req.userId);

            if (!user) {
                return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
            }

            // Eğer client'tan gelen token miktarı sunucudaki son kayıttan 
            // çok büyük bir farkla düşükse, bu da şüpheli olabilir. (Daha detaylı Anti-Cheat'e bırakıldı)
            
            // Verileri güncelle
            user.tokens = tokens;
            user.xp = xp;
            user.level = level;
            user.size = size;
            user.speedUpgrade = speedUpgrade;
            user.penaltyFactor = penaltyFactor;
            user.skinColor = skinColor || user.skinColor; 
            
            await user.save();
            
            res.json({ message: 'Oyun durumu başarıyla kaydedildi.', tokens: user.tokens });

        } catch (error) {
            console.error('Oyun kaydetme hatası:', error);
            res.status(500).json({ message: 'Sunucu hatası: Kayıt yapılamadı.' });
        }
    }
);

// --- 2. LİDERLİK TABLOSU (/api/game/leaderboard) ---
router.get('/leaderboard', async (req, res) => {
    try {
        const topPlayers = await User.find({ isBanned: false })
            .select('username tokens level size skinColor activePet') 
            .sort({ tokens: -1 }) 
            .limit(10)
            .populate({
                path: 'activePet',
                select: 'petType level' 
            });

        res.json(topPlayers);

    } catch (error) {
        console.error('Liderlik tablosu hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası: Liderlik tablosu çekilemedi.' });
    }
});

// --- 3. KULLANICI DETAYI (/api/game/me) ---
router.get('/me', async (req, res) => {
    try {
        const user = await User.findById(req.userId)
            .select('-password -isAdmin -ipAddress -deviceId -suspiciousActivity -friendRequests')
            .populate('activePet', 'petType level xp'); // Aktif Pet detaylarını ekle

        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        res.json(user);

    } catch (error) {
        console.error('Kullanıcı verisi çekme hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
});

// **********************************************
// --- ANTI-CHEAT VE OTURUM YÖNETİMİ (YENİ) ---
// **********************************************

// --- 4. OYUN OTURUMU BAŞLAT (/api/game/session/start) ---
router.post('/session/start', async (req, res) => {
    try {
        // Kullanıcının daha önce bitmemiş aktif bir oturumu var mı kontrol et
        const existingSession = await GameSession.findOne({ 
            userId: req.userId, 
            endTime: null 
        });

        if (existingSession) {
            // Var olan oturumu döndür, tekrar başlatmaya izin verme (client hatası önlenir)
            return res.json({ message: 'Var olan oturum devam ediyor.', sessionId: existingSession._id });
        }

        // Yeni bir oturum kaydı oluştur
        const session = await GameSession.create({
            userId: req.userId,
            startTime: Date.now()
        });

        res.json({ message: 'Oturum başlatıldı.', sessionId: session._id });
    } catch (error) {
        console.error('Oturum başlatma hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
});

// --- 5. OYUN OTURUMU BİTİR (/api/game/session/end/:id) ---
router.post(
    '/session/end/:id',
    [
        body('tokensEarned').isInt({ min: 0 }).withMessage('Token kazanımı pozitif tamsayı olmalı.'),
        body('xpGained').isFloat({ min: 0 }).withMessage('XP kazanımı pozitif olmalı.'),
        body('movementVariance').isFloat({ min: 0, max: 1 }).withMessage('Varyans 0 ile 1 arasında olmalı.'),
        body('afkTime').isInt({ min: 0 }).withMessage('AFK süresi tamsayı olmalı.')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.warn(`[DATA TAMPERING WARNING] Kullanıcı ID: ${req.userId} hatalı oturum bitiş verisi gönderdi.`);
            return res.status(400).json({ errors: errors.array() });
        }
        
        const sessionId = req.params.id;
        const endData = req.body;

        try {
            // Oturumu ID ve Kullanıcı ID ile güvenli şekilde bul
            const session = await GameSession.findOne({ _id: sessionId, userId: req.userId });
            
            if (!session) return res.status(404).json({ message: 'Oturum bulunamadı veya size ait değil.' });
            if (session.endTime) return res.status(400).json({ message: 'Oturum zaten bitirilmiş.' });

            // Anti-Cheat kontrolünü çalıştır (Session'ı günceller ve flag'ler)
            const { flagged, reason } = await AntiCheatService.finalizeSession(session, endData);
            
            res.json({ 
                message: 'Oturum başarıyla sonlandırıldı.', 
                flagged, 
                reason 
            });

        } catch (error) {
            console.error('Oturum sonlandırma hatası:', error);
            res.status(500).json({ message: 'Sunucu hatası: Oturum sonlandırılamadı.' });
        }
    }
);


export default router;