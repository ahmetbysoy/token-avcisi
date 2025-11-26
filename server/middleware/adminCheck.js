// server/middleware/adminCheck.js

/**
 * JWT ile doğrulanan kullanıcının yönetici yetkisine sahip olup olmadığını kontrol eder.
 * verifyToken middleware'inden sonra kullanılmalıdır.
 */
export const adminCheck = (req, res, next) => {
    // req.isAdmin, verifyToken middleware'i tarafından JWT payload'undan çekilmiştir.
    if (req.isAdmin) {
        next(); // Yönetici, devam et
    } else {
        // 403 Forbidden
        res.status(403).json({ message: 'Erişim reddedildi. Yönetici yetkisi gerekli.' });
    }
};