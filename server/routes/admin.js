// server/routes/admin.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import BanLog from '../models/BanLog.js';
import mongoose from 'mongoose';

const router = express.Router();

// --- 1. KULLANICI LİSTESİ (/api/admin/users) ---
router.get('/users', async (req, res) => {
    try {
        const users = await User.find({})
            .select('-password -friendRequests -friends') // Şifre ve sosyal verileri gönderme
            .sort({ createdAt: -1 });

        res.json(users);
    } catch (error) {
        console.error('Admin kullanıcı listeleme hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
});

// --- 2. KULLANICI DÜZENLEME (TOKEN, XP, LEVEL) (/api/admin/user/:id) ---
router.put(
    '/user/:id',
    [
        body('tokens').optional().isInt({ min: 0 }).withMessage('Token pozitif tamsayı olmalı.'),
        body('level').optional().isInt({ min: 1 }).withMessage('Level en az 1 olmalı.'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.params.id;
        const { tokens, level, isBanned, isAdmin, banReason } = req.body;
        
        try {
            const user = await User.findById(userId);
            if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

            // Sadece admin yetkisi varsa adminlik ayarını değiştir
            if (isAdmin !== undefined && req.isAdmin) {
                user.isAdmin = isAdmin;
            }

            // Oyun statlarını güncelle
            if (tokens !== undefined) user.tokens = tokens;
            if (level !== undefined) user.level = level;

            // Ban durumu güncellenirse (bu genelde ayrı ban endpoint'i ile yapılır ama burada da kontrol edelim)
            if (isBanned !== undefined) {
                user.isBanned = isBanned;
                user.banReason = isBanned ? (banReason || 'Manuel Yönetici Müdahalesi') : null;
            }
            
            await user.save();

            // Token veya XP değiştirildiyse Transaction kaydı atılabilir.
            if (tokens !== undefined) {
                 await Transaction.create({
                    fromUser: req.userId, // Admin ID
                    toUser: user._id,
                    amount: tokens, // Net miktar
                    fee: 0,
                    type: 'admin_edit',
                    status: 'completed',
                    flagReason: `Admin tarafından token değeri ${tokens} olarak ayarlandı.`
                });
            }

            res.json({ message: `${user.username} kullanıcısı başarıyla güncellendi.`, user });
        } catch (error) {
            console.error('Admin kullanıcı güncelleme hatası:', error);
            res.status(500).json({ message: 'Sunucu hatası.' });
        }
    }
);

// --- 3. KULLANICI BANLAMA (/api/admin/ban) ---
router.post(
    '/ban',
    [
        body('userId').isMongoId().withMessage('Geçerli bir kullanıcı ID olmalı.'),
        body('reason').isLength({ min: 5 }).withMessage('Ban sebebi en az 5 karakter olmalı.'),
        body('duration').optional().isInt({ min: 0 }).withMessage('Süre milisaniye cinsinden pozitif tamsayı olmalı.') // 0 = süresiz
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { userId, reason, duration } = req.body;
        
        try {
            const user = await User.findById(userId);
            if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

            if (user.isBanned) return res.status(400).json({ message: 'Bu kullanıcı zaten banlı.' });

            // 1. Kullanıcıyı banla
            user.isBanned = true;
            user.banReason = reason;

            // 2. Ban Log kaydını oluştur
            const expiresAt = duration ? new Date(Date.now() + duration) : null;
            const newBan = await BanLog.create({
                userId,
                adminId: req.userId,
                reason,
                duration,
                expiresAt,
            });

            await user.save();
            
            res.json({ message: `${user.username} başarıyla banlandı.`, banLog: newBan });
            
        } catch (error) {
            console.error('Banlama hatası:', error);
            res.status(500).json({ message: 'Sunucu hatası: Banlama yapılamadı.' });
        }
    }
);

// --- 4. BAN KALDIRMA (/api/admin/unban/:id) ---
router.delete('/unban/:userId', async (req, res) => {
    const userId = req.params.userId;
    
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

        if (!user.isBanned) return res.status(400).json({ message: 'Bu kullanıcı zaten banlı değil.' });

        // 1. Kullanıcının banını kaldır
        user.isBanned = false;
        user.banReason = null;
        await user.save();

        // 2. Aktif Ban Loglarını Pasif Yap
        await BanLog.updateMany(
            { userId: userId, isActive: true },
            { $set: { isActive: false } }
        );

        res.json({ message: `${user.username} kullanıcısının banı başarıyla kaldırıldı.` });

    } catch (error) {
        console.error('Ban kaldırma hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası: Ban kaldırılamadı.' });
    }
});

// --- 5. PLATFORM İSTATİSTİKLERİ (/api/admin/stats) ---
router.get('/stats', async (req, res) => {
    try {
        // Toplam Kullanıcı Sayısı
        const totalUsers = await User.countDocuments();
        
        // Banlı Kullanıcı Sayısı
        const bannedUsers = await User.countDocuments({ isBanned: true });

        // Toplam Token Sirkülasyonu
        const totalTokenInCirculation = await User.aggregate([
            { $group: { _id: null, totalTokens: { $sum: '$tokens' } } }
        ]);

        // Son 24 Saatteki Transfer Hacmi
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const dailyTransferVolume = await Transaction.aggregate([
            { $match: { createdAt: { $gte: oneDayAgo }, type: 'transfer', status: 'completed' } },
            { $group: { _id: null, totalAmount: { $sum: '$amount' } } }
        ]);

        res.json({
            totalUsers,
            bannedUsers,
            totalTokens: totalTokenInCirculation[0]?.totalTokens || 0,
            dailyTransferVolume: dailyTransferVolume[0]?.totalAmount || 0,
            // Daha fazla istatistik buraya eklenecek
        });

    } catch (error) {
        console.error('Admin istatistik çekme hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası: İstatistikler çekilemedi.' });
    }
});

// --- 6. İŞLEM KAYITLARI (TRANSACTION LOG) (/api/admin/transactions) ---
router.get('/transactions', async (req, res) => {
    try {
        const transactions = await Transaction.find({})
            .sort({ createdAt: -1 })
            .limit(100)
            .populate('fromUser', 'username')
            .populate('toUser', 'username');

        res.json(transactions);
    } catch (error) {
        console.error('Admin transaction log hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
});


export default router;