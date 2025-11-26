// server/services/NotificationService.js
import { Server } from 'socket.io';

let io = null;

class NotificationService {
    
    /**
     * Socket.io sunucusunu başlatır ve kullanıcının soket ID'sini kaydeder.
     * @param {Object} httpServer - Node.js HTTP sunucusu
     * @param {string} origin - CORS kaynağı
     */
    static initialize(httpServer, origin) {
        // Socket.io sunucusunu başlat
        io = new Server(httpServer, {
            cors: {
                origin: origin,
                methods: ["GET", "POST"]
            }
        });

        // Bağlantı olaylarını dinle
        io.on('connection', (socket) => {
            console.log(`[Socket] Yeni bağlantı: ${socket.id}`);
            
            // Kullanıcı kimlik doğrulamasını (JWT ile) burada yapmalıyız.
            // Örneğin, client'tan gelen token'ı doğrulayarak socket.userId'ı atayabiliriz.
            
            socket.on('authenticate', (token) => {
                // Not: Bu kısım JWT doğrulamasını içerir. Basitçe varsayalım:
                // try {
                //     const decoded = jwt.verify(token, process.env.JWT_SECRET);
                //     socket.userId = decoded.userId;
                //     console.log(`[Socket] Kullanıcı ${decoded.userId} kimliği doğrulandı.`);
                // } catch (error) {
                //     socket.disconnect(); 
                // }
            });

            socket.on('disconnect', () => {
                console.log(`[Socket] Bağlantı kesildi: ${socket.id}`);
            });
        });
    }

    /**
     * ID'si bilinen belirli bir kullanıcıya bildirim gönderir.
     * @param {string} userId - Hedef kullanıcının MongoDB ID'si
     * @param {string} type - Bildirim tipi (e.g., 'friendRequest', 'tokenTransfer')
     * @param {Object} payload - Bildirim verisi
     */
    static sendNotificationToUser(userId, type, payload) {
        if (!io) return;
        
        // Bu kullanıcıya ait tüm soketlere gönder
        io.sockets.sockets.forEach((socket) => {
            if (socket.userId && socket.userId.toString() === userId.toString()) {
                socket.emit('notification', { type, payload });
            }
        });
    }
    
    /**
     * Tüm bağlı kullanıcılara genel duyuru gönderir (Admin duyuruları için).
     * @param {string} message - Duyuru mesajı
     */
    static broadcastAnnouncement(message) {
        if (!io) return;
        io.emit('announcement', { message, timestamp: Date.now() });
        console.log(`[Socket] Genel duyuru yayınlandı: ${message}`);
    }

    /**
     * Belirli bir admin API'sinden sonra bu metot çağrılmalıdır.
     * Örneğin, `routes/transfer.js` içinde token transferi başarılı olduğunda:
     * NotificationService.sendNotificationToUser(receiver._id, 'tokenTransfer', { amount: netAmount, sender: sender.username });
     */
}

export default NotificationService;