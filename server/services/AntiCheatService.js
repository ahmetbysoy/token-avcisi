// server/services/AntiCheatService.js

// Güvenlik Sabitleri
const MAX_TOKEN_PER_XP_RATIO = 0.5; // Kazanılan Token / Kazanılan XP oranı (çok yüksekse şüpheli)
const MIN_MOVEMENT_VARIANCE = 0.2; // Minimum hareket varyansı eşiği
const MAX_AFK_RATIO = 0.5; // Oynama süresinin %50'sinden fazlası AFK olamaz

class AntiCheatService {

    /**
     * Oturum verilerini analiz eder ve hile bayraklarını (flag) döndürür.
     * @param {Object} sessionData - models/GameSession.js'deki veriler
     * @returns {Array<string>} Tespit edilen hile nedenleri listesi
     */
    static validateSession(sessionData) {
        const flags = [];
        
        // Oturum süresi kontrolü
        if (sessionData.durationSeconds <= 60) {
            // Çok kısa oturumları göz ardı edebiliriz
            return flags;
        }

        // 1. XP/Token Oranı Kontrolü
        if (sessionData.xpGained > 0) {
            const tokenXpRatio = sessionData.tokensEarned / sessionData.xpGained;
            if (tokenXpRatio > MAX_TOKEN_PER_XP_RATIO) {
                flags.push(`RatioCheck: Token/XP oranı (${tokenXpRatio.toFixed(2)}) çok yüksek.`);
            }
        }
        
        // 2. Hareket Varyansı Kontrolü (Bot Tespiti)
        if (sessionData.movementVariance < MIN_MOVEMENT_VARIANCE) {
            flags.push(`BotCheck: Düşük hareket varyansı (${sessionData.movementVariance.toFixed(2)}).`);
        }
        
        // 3. AFK Süresi Kontrolü
        if (sessionData.durationSeconds > 0) {
            const afkRatio = sessionData.afkTime / sessionData.durationSeconds;
            if (afkRatio > MAX_AFK_RATIO) {
                flags.push(`AFKCheck: AFK oranı (${(afkRatio * 100).toFixed(0)}%) çok yüksek.`);
            }
        }
        
        // 4. Token Manipülasyon Kontrolü (Client'tan gelen token miktarı)
        // Bu kontrol, /game/save endpoint'inde yapılmalıdır:
        // Client'tan gelen tokensEarned, sunucunun beklediği (yemek sayısına göre hesapladığı) 
        // miktardan çok farklıysa şüpheli sayılır.
        
        return flags;
    }
    
    /**
     * Oturum verilerini günceller ve anti-cheat kontrolünü çalıştırır.
     * @param {Object} session - GameSession Mongoose modeli
     * @param {Object} endData - Oturum sonu client verileri
     */
    static async finalizeSession(session, endData) {
        
        const now = Date.now();
        session.endTime = now;
        session.durationSeconds = Math.floor((now - session.startTime) / 1000);
        
        // Client'tan gelen verileri kaydet
        session.tokensEarned = endData.tokensEarned || 0;
        session.xpGained = endData.xpGained || 0;
        session.foodEaten = endData.foodEaten || 0;
        session.movementVariance = endData.movementVariance || 0;
        session.afkTime = endData.afkTime || 0;
        
        // Anti-Cheat kontrolünü çalıştır
        const flags = this.validateSession(session);

        if (flags.length > 0) {
            session.flagged = true;
            session.flagReason = flags.join('; ');
            
            // Kullanıcının şüpheli aktivite skorunu artır
            await User.findByIdAndUpdate(session.userId, { $inc: { suspiciousActivity: flags.length } });
        }

        await session.save();
        return { flagged: session.flagged, reason: session.flagReason };
    }
}

export default AntiCheatService;