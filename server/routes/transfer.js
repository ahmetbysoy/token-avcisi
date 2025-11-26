// server/routes/transfer.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose'; // MongoDB Transaction için gerekli

const router = express.Router();
const TRANSFER_FEE_RATE = 0.05; // %5 Komisyon

// --- 1. TOKEN GÖNDER (/api/transfer/send) ---
router.post(
    '/send',
    [
        body('toUsername').isLength({ min: 3, max: 15 }).withMessage('Alıcı kullanıcı adı geçerli değil.'),
        body('amount').isInt({ min: 10, max: 50000 }).withMessage('Transfer miktarı 10 ile 50000 arasında olmalı.')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { toUsername, amount } = req.body;
        const session = await mongoose.startSession(); // İşlem başlat

        try {
            session.startTransaction();

            const sender = await User.findById(req.userId).session(session);
            const receiver = await User.findOne({ username: toUsername }).session(session);

            if (!sender || !receiver) {
                await session.abortTransaction();
                return res.status(404).json({ message: 'Gönderici veya alıcı bulunamadı.' });
            }

            // --- 1. Kontroller ---
            if (sender._id.equals(receiver._id)) {
                await session.abortTransaction();
                return res.status(400).json({ message: 'Kendinize token gönderemezsiniz.' });
            }
            if (sender.tokens < amount) {
                await session.abortTransaction();
                return res.status(402).json({ message: 'Yetersiz Token bakiyesi.' });
            }

            // --- 2. Komisyon Hesaplama ---
            const fee = Math.floor(amount * TRANSFER_FEE_RATE);
            const netAmount = amount - fee;

            // --- 3. Bakiyeleri Güncelle ---
            sender.tokens -= amount; // Toplam miktar göndericiden düşülür
            receiver.tokens += netAmount; // Net miktar alıcıya eklenir

            await sender.save({ session });
            await receiver.save({ session });

            // --- 4. Transaction Kaydı ---
            const transaction = new Transaction({
                fromUser: sender._id,
                toUser: receiver._id,
                amount: amount,
                fee: fee,
                type: 'transfer',
                status: 'completed',
                // Anti-Fraud alanları (şimdilik varsayılan)
                sameDevice: sender.deviceId === receiver.deviceId, 
                sameIP: sender.ipAddress === req.ip, 
            });
            await transaction.save({ session });

            await session.commitTransaction(); // İşlemi onayla

            res.json({
                message: `${toUsername}'a ${amount} token başarıyla gönderildi. Komisyon: ${fee} (Yeni bakiyeniz: ${sender.tokens})`,
                newBalance: sender.tokens,
                fee: fee
            });

        } catch (error) {
            await session.abortTransaction(); // Hata durumunda tüm değişiklikleri geri al
            console.error('Token transfer hatası:', error);
            res.status(500).json({ message: 'Sunucu hatası: Token transferi yapılamadı.' });
        } finally {
            session.endSession();
        }
    }
);

// --- 2. TRANSFER GEÇMİŞİ (/api/transfer/history) ---
router.get('/history', async (req, res) => {
    try {
        const history = await Transaction.find({
            $or: [{ fromUser: req.userId }, { toUser: req.userId }]
        })
        .sort({ createdAt: -1 }) // En yeni işlemler en başta
        .limit(50) // Son 50 işlemi göster
        .populate('fromUser', 'username') // Gönderen kullanıcı adını getir
        .populate('toUser', 'username'); // Alan kullanıcı adını getir

        res.json(history);

    } catch (error) {
        console.error('Transfer geçmişi hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası: Geçmiş çekilemedi.' });
    }
});


// --- 3. TOKEN İSTEME (/api/transfer/request) ---
// Not: Bu sadece bir istek kaydı oluşturur, gerçek transferi yapmaz.
router.post(
    '/request',
    [
        body('fromUsername').isLength({ min: 3, max: 15 }).withMessage('Gönderici kullanıcı adı geçerli değil.'),
        body('amount').isInt({ min: 10, max: 10000 }).withMessage('İstenen miktar 10 ile 10000 arasında olmalı.')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { fromUsername, amount } = req.body;
        
        try {
            const requester = await User.findById(req.userId);
            const targetUser = await User.findOne({ username: fromUsername });

            if (!targetUser) {
                return res.status(404).json({ message: 'İstek gönderilecek kullanıcı bulunamadı.' });
            }

            // Normalde bu istek, hedef kullanıcının 'friendRequests' alanına eklenir veya
            // bir 'Notification' olarak Socket.io üzerinden gönderilirdi.
            // Şimdilik basitçe bir "pending" Transaction kaydı oluşturabiliriz.
            
            const requestTransaction = new Transaction({
                fromUser: targetUser._id, // Asıl gönderici (istek kabul edilirse)
                toUser: requester._id,     // İsteyen
                amount: amount,
                fee: 0,
                type: 'request',
                status: 'pending',
                flagReason: `Token isteği. Miktar: ${amount}`
            });
            await requestTransaction.save();
            
            // Eğer Socket.io kurulursa, buradan hedef kullanıcıya bildirim gönderilmelidir.
            
            res.json({
                message: `${fromUsername} adlı kullanıcıdan ${amount} token istendi. Onay bekleniyor.`,
                transactionId: requestTransaction._id
            });

        } catch (error) {
            console.error('Token istek hatası:', error);
            res.status(500).json({ message: 'Sunucu hatası: İstek gönderilemedi.' });
        }
    }
);

export default router;