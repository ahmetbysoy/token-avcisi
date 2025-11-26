// server/routes/auth.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// JWT oluşturma fonksiyonu
const generateToken = (userId, isAdmin) => {
    return jwt.sign({ userId, isAdmin }, process.env.JWT_SECRET, {
        expiresIn: '30d', // 30 gün geçerli
    });
};

// --- KAYIT (/api/auth/register) ---
router.post(
    '/register',
    [
        body('username').isLength({ min: 3, max: 15 }).withMessage('Kullanıcı adı 3-15 karakter olmalı.'),
        body('password').isLength({ min: 6 }).withMessage('Şifre en az 6 karakter olmalı.')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, password } = req.body;
        
        try {
            // Kullanıcı zaten var mı?
            const userExists = await User.findOne({ username });
            if (userExists) {
                return res.status(400).json({ message: 'Bu kullanıcı adı zaten alınmış.' });
            }

            // Yeni kullanıcı oluştur
            const user = await User.create({
                username,
                password,
                ipAddress: req.ip // IP adresini kaydet (Anti-cheat için)
            });

            // Başarılı cevap ve JWT token
            const token = generateToken(user._id, user.isAdmin);
            res.status(201).json({ 
                _id: user._id,
                username: user.username,
                token,
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Sunucu hatası. Kayıt yapılamadı.' });
        }
    }
);

// --- GİRİŞ (/api/auth/login) ---
router.post(
    '/login',
    async (req, res) => {
        const { username, password } = req.body;

        try {
            const user = await User.findOne({ username });

            // Kullanıcı var mı ve şifre doğru mu?
            if (user && (await user.matchPassword(password))) {
                
                // Anti-cheat: Ban kontrolü
                if (user.isBanned) {
                    return res.status(403).json({ message: 'Hesabınız banlanmıştır.' });
                }

                // Başarılı giriş: Token oluştur ve son giriş zamanını güncelle
                const token = generateToken(user._id, user.isAdmin);
                
                // Giriş serisi mantığı (V3.0)
                const now = new Date();
                const lastLogin = user.lastLogin ? new Date(user.lastLogin) : null;
                const isSameDay = lastLogin && lastLogin.toDateString() === now.toDateString();
                const isConsecutiveDay = lastLogin && (now.getTime() - lastLogin.getTime()) <= 86400000 * 1.5; 

                if (!isSameDay) {
                    user.loginStreak = (lastLogin && isConsecutiveDay) ? user.loginStreak + 1 : 1;
                    user.lastLogin = now;
                    await user.save();
                }

                res.json({
                    _id: user._id,
                    username: user.username,
                    isAdmin: user.isAdmin,
                    tokens: user.tokens,
                    token,
                });
            } else {
                res.status(401).json({ message: 'Geçersiz kullanıcı adı veya şifre.' });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Sunucu hatası.' });
        }
    }
);

export default router;
