// server/routes/friends.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
// import NotificationService from '../services/NotificationService.js'; // Phase 4'te eklenecek

const router = express.Router();

// --- 1. ARKADAŞ LİSTESİ (/api/friends) ---
router.get('/', async (req, res) => {
    try {
        const user = await User.findById(req.userId)
            .select('friends friendRequests')
            .populate('friends', 'username level size skinColor') // Arkadaşların temel oyun statlarını getir
            .populate('friendRequests', 'username'); // Bekleyen istekleri getir

        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        res.json({
            friends: user.friends,
            pendingRequests: user.friendRequests,
        });

    } catch (error) {
        console.error('Arkadaş listesi hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası: Arkadaş listesi çekilemedi.' });
    }
});

// --- 2. ARKADAŞLIK İSTEĞİ GÖNDER (/api/friends/add) ---
router.post(
    '/add',
    [
        body('targetUsername').isLength({ min: 3, max: 15 }).withMessage('Geçerli bir kullanıcı adı olmalı.'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const { targetUsername } = req.body;
        
        try {
            const senderId = req.userId;
            const targetUser = await User.findOne({ username: targetUsername });
            
            if (!targetUser) {
                return res.status(404).json({ message: 'Hedef kullanıcı bulunamadı.' });
            }
            if (senderId.equals(targetUser._id)) {
                return res.status(400).json({ message: 'Kendinize arkadaşlık isteği gönderemezsiniz.' });
            }

            // --- İSTEK KONTROLLERİ ---
            // Zaten arkadaş mı?
            if (targetUser.friends.includes(senderId)) {
                return res.status(400).json({ message: 'Bu kullanıcı zaten arkadaş listenizde.' });
            }
            // Zaten istek gönderilmiş mi? (Hedefte bekleyen olarak)
            if (targetUser.friendRequests.includes(senderId)) {
                return res.status(400).json({ message: 'Bu kullanıcıya zaten istek gönderdiniz.' });
            }
            // Hedef benden istek atmış mı? (Tersini kontrol et)
            if (targetUser.friendRequests.includes(senderId)) {
                return res.status(400).json({ message: 'Bu kullanıcıdan zaten bekleyen bir isteğiniz var. Kabul edin!' });
            }

            // İsteği hedef kullanıcının istek listesine ekle
            targetUser.friendRequests.push(senderId);
            await targetUser.save();
            
            // Eğer NotificationService olsaydı, targetUser'a bildirim gönderilirdi.
            // NotificationService.sendFriendRequest(senderId, targetUser._id);

            res.json({ message: `${targetUsername} adlı kullanıcıya arkadaşlık isteği gönderildi.` });

        } catch (error) {
            console.error('Arkadaşlık isteği hatası:', error);
            res.status(500).json({ message: 'Sunucu hatası: İstek gönderilemedi.' });
        }
    }
);

// --- 3. ARKADAŞLIK İSTEĞİNİ KABUL ET (/api/friends/accept) ---
router.post(
    '/accept',
    [
        body('senderId').isMongoId().withMessage('Geçerli bir gönderici ID olmalı.')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const receiverId = req.userId;
        const { senderId } = req.body;

        try {
            // İki kullanıcıyı da bul (işlem bütünlüğü için)
            const receiver = await User.findById(receiverId);
            const sender = await User.findById(senderId);
            
            if (!receiver || !sender) {
                return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
            }

            // İstek bekleyenler listesinde mi?
            const requestIndex = receiver.friendRequests.indexOf(senderId);
            if (requestIndex === -1) {
                return res.status(404).json({ message: 'Kabul edilecek bekleyen istek bulunamadı.' });
            }

            // 1. İsteği bekleyenler listesinden çıkar
            receiver.friendRequests.splice(requestIndex, 1);
            
            // 2. İki tarafı da arkadaş listesine ekle
            if (!receiver.friends.includes(senderId)) {
                receiver.friends.push(senderId);
            }
            if (!sender.friends.includes(receiverId)) {
                sender.friends.push(receiverId);
            }

            await receiver.save();
            await sender.save();

            // NotificationService.sendFriendAccept(receiverId, senderId);

            res.json({ message: `${sender.username} artık arkadaşın!` });

        } catch (error) {
            console.error('İstek kabul etme hatası:', error);
            res.status(500).json({ message: 'Sunucu hatası: İstek kabul edilemedi.' });
        }
    }
);

// --- 4. ARKADAŞ SİL (/api/friends/:id) ---
router.delete('/:friendId', async (req, res) => {
    const friendId = req.params.friendId;
    
    try {
        const user = await User.findById(req.userId).select('friends');
        const friend = await User.findById(friendId).select('friends username');

        if (!user || !friend) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        // 1. Kullanıcının listesinden sil
        user.friends = user.friends.filter(id => !id.equals(friendId));
        
        // 2. Arkadaşın listesinden de sil
        friend.friends = friend.friends.filter(id => !id.equals(req.userId));

        await user.save();
        await friend.save();

        res.json({ message: `${friend.username} arkadaş listenizden kaldırıldı.` });

    } catch (error) {
        console.error('Arkadaş silme hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası: Arkadaş silinemedi.' });
    }
});

// --- 5. AKTİVİTE FEED'İ (/api/friends/activity) ---
router.get('/activity', async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('friends');
        if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

        const friendIds = user.friends;
        
        // Arkadaşların son 50 Transaction kaydını çek
        const recentActivity = await Transaction.find({
            $or: [
                { fromUser: { $in: friendIds }, type: 'transfer' }, 
                { toUser: { $in: friendIds }, type: 'transfer' }
            ]
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('fromUser', 'username')
        .populate('toUser', 'username');

        // Burada daha sonra GameSession veya diğer loglar da birleştirilebilir.
        
        res.json(recentActivity);

    } catch (error) {
        console.error('Aktivite feed hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası: Aktivite feedi çekilemedi.' });
    }
});


export default router;