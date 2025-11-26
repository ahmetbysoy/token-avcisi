// server/routes/pet.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import Pet from '../models/Pet.js';
import PetService from '../services/PetService.js';

const router = express.Router();

// --- 1. KULLANICININ PETLERİNİ GÖRÜNTÜLE (/api/pet) ---
// Aktif pet ve sahip olunan tüm petlerin detaylarını döner.
router.get('/', async (req, res) => {
    try {
        const user = await User.findById(req.userId)
            .select('activePet ownedPets')
            .populate('activePet') // Aktif petin tüm detaylarını getir
            .populate('ownedPets'); // Sahip olunan petlerin tüm detaylarını getir

        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        const activePet = user.activePet ? {
            ...user.activePet.toObject(),
            tokenBonus: PetService.calculateTokenBonus(user.activePet)
        } : null;

        res.json({
            activePet: activePet,
            ownedPets: user.ownedPets,
        });

    } catch (error) {
        console.error('Pet listeleme hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası: Petler çekilemedi.' });
    }
});


// --- 2. PET DONAT (/api/pet/equip) ---
// Kullanıcının sahip olduğu bir Pet'i aktif hale getirir.
router.post(
    '/equip',
    [
        body('petId').isMongoId().withMessage('Geçerli bir Pet ID olmalı.')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const { petId } = req.body;

        try {
            const user = await User.findById(req.userId).select('ownedPets activePet');
            
            if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

            // Kullanıcının gerçekten bu Pet'e sahip olup olmadığını kontrol et
            if (!user.ownedPets.includes(petId)) {
                return res.status(403).json({ message: 'Bu Pet size ait değil.' });
            }

            // Pet'i aktif et
            user.activePet = petId;
            await user.save();

            res.json({ message: 'Pet başarıyla donatıldı!', activePetId: petId });

        } catch (error) {
            console.error('Pet donatma hatası:', error);
            res.status(500).json({ message: 'Sunucu hatası: Pet donatılamadı.' });
        }
    }
);


// --- 3. PET BESLE (XP HARCA) (/api/pet/feed) ---
// Kullanıcının XP'sini harcayarak Pet'e XP verir ve seviye atlatır.
router.post(
    '/feed',
    [
        body('petId').isMongoId().withMessage('Geçerli bir Pet ID olmalı.'),
        body('xpAmount').isInt({ min: 100, max: 5000 }).withMessage('XP miktarı 100-5000 arasında olmalı.') // Besleme miktarı kısıtlandı
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const { petId, xpAmount } = req.body;

        try {
            const user = await User.findById(req.userId).select('xp ownedPets');
            const pet = await Pet.findById(petId);
            
            if (!user || !pet) return res.status(404).json({ message: 'Kullanıcı veya Pet bulunamadı.' });
            if (!user.ownedPets.includes(petId)) return res.status(403).json({ message: 'Bu Pet size ait değil.' });

            // XP Kontrolü
            if (user.xp < xpAmount) {
                return res.status(402).json({ message: 'Yetersiz XP! Pet beslenemedi.' });
            }

            // İşlem Başlangıcı
            user.xp -= xpAmount;
            
            // PetService ile XP ekle ve seviye atlama kontrolü yap
            const leveledUp = await PetService.addXPAndLevelUp(pet, xpAmount);
            
            await user.save();
            await pet.save();

            res.json({ 
                message: leveledUp ? `Petiniz Seviye ${pet.level}'e atladı!` : `Petiniz beslendi.`, 
                petLevel: pet.level,
                petXP: pet.xp,
                userXP: user.xp,
                leveledUp: leveledUp
            });

        } catch (error) {
            console.error('Pet besleme hatası:', error);
            res.status(500).json({ message: 'Sunucu hatası: Pet beslenemedi.' });
        }
    }
);

// --- 4. PET'E AKSESUAR TAK (/api/pet/accessory) ---
// Pet'in kendisine aksesuar takar (Kullanıcının aksesuarları değil)
router.post(
    '/accessory',
    [
        body('petId').isMongoId().withMessage('Geçerli bir Pet ID olmalı.'),
        body('slot').isIn(['hat', 'glasses', 'chain', 'background']).withMessage('Geçersiz aksesuar slotu.'),
        body('itemName').isString().withMessage('Aksesuar adı boş olamaz.')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        
        const { petId, slot, itemName } = req.body;

        try {
            const user = await User.findById(req.userId).select('ownedPets accessories');
            const pet = await Pet.findById(petId);

            if (!user || !pet) return res.status(404).json({ message: 'Kullanıcı veya Pet bulunamadı.' });
            if (!user.ownedPets.includes(petId)) return res.status(403).json({ message: 'Bu Pet size ait değil.' });
            
            // Satın alma kontrolü: Kullanıcının bu aksesuara sahip olduğunu varsayıyoruz. 
            // (Envanter sistemi Phase 5'te daha detaylı kurulabilir, şimdilik user.accessories alanını kontrol edebiliriz.)
            const isOwned = user.accessories[slot] === itemName;
            if (!isOwned) {
                return res.status(403).json({ message: `Bu aksesuara sahip değilsiniz (${slot}: ${itemName}).` });
            }

            // Pet'e aksesuarı tak
            pet.accessories[slot] = itemName;
            await pet.save();

            res.json({ 
                message: `Pet'e ${itemName} başarıyla takıldı.`, 
                slot: slot,
                item: itemName
            });

        } catch (error) {
            console.error('Pet aksesuar takma hatası:', error);
            res.status(500).json({ message: 'Sunucu hatası: Aksesuar takılamadı.' });
        }
    }
);

export default router;