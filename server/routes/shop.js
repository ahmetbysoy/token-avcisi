// server/routes/shop.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import Pet from '../models/Pet.js';
import PetService from '../services/PetService.js';

const router = express.Router();

// --- 1. KATALOG LİSTELEME (/api/shop/catalog) ---
// Tüm pet ve aksesuar kataloglarını döner.
router.get('/catalog', async (req, res) => {
    try {
        const catalog = PetService.getCatalog();
        res.json(catalog);
    } catch (error) {
        console.error('Katalog listeleme hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası: Katalog çekilemedi.' });
    }
});

// --- 2. SATIN ALMA İŞLEMİ (/api/shop/buy) ---
router.post(
    '/buy',
    [
        body('itemType').isIn(['pet', 'accessory']).withMessage('Geçersiz ürün tipi.'),
        body('itemName').isString().isLength({ min: 1 }).withMessage('Ürün adı boş olamaz.')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { itemType, itemName } = req.body;
        
        try {
            const user = await User.findById(req.userId).select('tokens ownedPets activePet accessories');
            if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

            const catalog = PetService.getCatalog();
            let cost = 0;
            let itemData = null;

            if (itemType === 'pet') {
                // Pet katalogunda ürünü bul
                for (const rarity in catalog.pets) {
                    if (catalog.pets[rarity][itemName]) {
                        itemData = catalog.pets[rarity][itemName];
                        cost = itemData.price;
                        break;
                    }
                }
            } else if (itemType === 'accessory') {
                // Aksesuar katalogunda ürünü bul (Player Aksesuarı)
                for (const slot in catalog.accessories) {
                    if (catalog.accessories[slot][itemName]) {
                        itemData = catalog.accessories[slot][itemName];
                        cost = itemData.price;
                        break;
                    }
                }
            }

            if (!itemData || cost === undefined) {
                return res.status(404).json({ message: 'Ürün katalogda bulunamadı.' });
            }

            // --- FİYAT KONTROLÜ ---
            if (user.tokens < cost) {
                return res.status(402).json({ message: 'Yetersiz Token! Satın alma başarısız.' });
            }

            // --- İŞLEM BAŞLANGICI ---
            user.tokens -= cost; // Token düşüşü

            if (itemType === 'pet') {
                // Yeni Pet oluştur
                const newPet = new Pet({
                    userId: user._id,
                    petType: itemName,
                    rarity: itemData.rarity,
                });
                await newPet.save();

                // Kullanıcıya Pet'i ekle
                user.ownedPets.push(newPet._id);

                // Eğer aktif Pet'i yoksa, bunu aktif et
                if (!user.activePet) {
                    user.activePet = newPet._id;
                }
                
                await user.save();
                res.json({ 
                    message: `${itemName} Pet'ini başarıyla satın aldın!`, 
                    tokens: user.tokens,
                    newPetId: newPet._id
                });

            } else if (itemType === 'accessory') {
                // Aksesuarı kullanıcıya ekle (eskisini değiştirir)
                const slot = itemData.slot;
                user.accessories[slot] = itemName;

                await user.save();
                res.json({ 
                    message: `${itemName} Aksesuarı başarıyla donatıldı!`, 
                    tokens: user.tokens,
                    slot: slot,
                    item: itemName
                });
            }

        } catch (error) {
            console.error('Satın alma işlemi hatası:', error);
            res.status(500).json({ message: 'Sunucu hatası: Satın alma gerçekleştirilemedi.' });
        }
    }
);

export default router;