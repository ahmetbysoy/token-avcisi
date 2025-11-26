// server/services/PetService.js

// PET STATİK KATALOĞU (Bonuslar server-side token hesaplamasında kullanılacak)
const PET_CATALOG = {
    starter: {
        cat: { price: 0, bonus: 1.0, description: "Başlangıç kedisi", rarity: "starter" },
        dog: { price: 0, bonus: 1.0, description: "Sadık köpek", rarity: "starter" }
    },
    common: {
        rabbit: { price: 500, bonus: 1.1, description: "Hızlı tavşan (+%10 Token)", rarity: "common" },
        bird: { price: 800, bonus: 1.15, description: "Şanslı kuş (+%15 Token)", rarity: "common" }
    },
    rare: {
        panda: { price: 2000, bonus: 1.3, description: "Pasif panda (+%30 Token)", rarity: "rare" },
        fox: { price: 3000, bonus: 1.4, description: "Kurnaz tilki (+%40 Token)", rarity: "rare" }
    },
    epic: {
        lion: { price: 8000, bonus: 1.6, description: "Kral aslan (+%60 Token)", rarity: "epic" },
        dragon: { price: 15000, bonus: 2.0, description: "Efsanevi ejderha (+%100 Token)", rarity: "epic" }
    },
    legendary: {
        phoenix: { price: 50000, bonus: 3.0, description: "Anka kuşu (x3 Token)", rarity: "legendary" },
        unicorn: { price: 100000, bonus: 5.0, description: "Tekboynuz (x5 Token)", rarity: "legendary" }
    }
};

// AKSESUAR KATALOĞU
const ACCESSORIES_CATALOG = {
    hats: { 
        cap: { price: 100, slot: 'hat' }, 
        cowboy: { price: 500, slot: 'hat' }, 
        crown: { price: 2000, slot: 'hat' } 
    },
    glasses: { 
        sunglasses: { price: 200, slot: 'glasses' }, 
        nerd: { price: 300, slot: 'glasses' }, 
        laser: { price: 5000, slot: 'glasses' } 
    },
    chains: { 
        silver: { price: 400, slot: 'chain' }, 
        gold: { price: 1500, slot: 'chain' }, 
        diamond: { price: 10000, slot: 'chain' } 
    },
    backgrounds: { 
        beach: { price: 300, slot: 'background' }, 
        space: { price: 2000, slot: 'background' }, 
        heaven: { price: 8000, slot: 'background' } 
    }
};


class PetService {
    
    /**
     * Tüm pet ve aksesuar kataloglarını döner (Mağaza için kullanılır)
     */
    static getCatalog() {
        return { pets: PET_CATALOG, accessories: ACCESSORIES_CATALOG };
    }
    
    /**
     * Pet'in token bonus çarpanını hesaplar
     * @param {Object} pet - Pet Mongoose modeli (populated)
     * @returns {number} Token bonus çarpanı (örneğin 1.3)
     */
    static calculateTokenBonus(pet) {
        if (!pet) return 1.0;
        
        for (const rarity in PET_CATALOG) {
            if (PET_CATALOG[rarity][pet.petType]) {
                // Seviyeye göre bonus ekleyebiliriz (örnek: her level +%1)
                const baseBonus = PET_CATALOG[rarity][pet.petType].bonus;
                const levelBonus = (pet.level - 1) * 0.01; 
                return baseBonus + levelBonus;
            }
        }
        return 1.0; 
    }

    /**
     * Pet'in seviye atlaması için gereken XP'yi hesaplar.
     */
    static getRequiredXP(level) {
        return 100 + (level * level * 20); // Üstel artış
    }

    /**
     * Pet'e XP ekler ve seviye atlayıp atlamadığını kontrol eder.
     * @param {Object} pet - Pet Mongoose modeli
     * @param {number} amount - Eklenecek XP miktarı
     * @returns {boolean} Seviye atladıysa true
     */
    static async addXPAndLevelUp(pet, amount) {
        pet.xp += amount;
        let leveledUp = false;
        
        let requiredXP = this.getRequiredXP(pet.level);
        while (pet.xp >= requiredXP) {
            pet.xp -= requiredXP;
            pet.level += 1;
            requiredXP = this.getRequiredXP(pet.level);
            leveledUp = true;
        }
        return leveledUp;
    }
}

export default PetService;