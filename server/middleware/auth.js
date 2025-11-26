// server/middleware/auth.js
import jwt from 'jsonwebtoken';

export const verifyToken = (req, res, next) => {
  // Bearer token formatını bekler: "Bearer [token]"
  const token = req.headers.authorization?.split(' ')[1]; 
  
  if (!token) {
    return res.status(401).json({ error: 'Erişim reddedildi. Token yok.' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.isAdmin = decoded.isAdmin; // Admin bilgisini de ekle
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token geçersiz veya süresi dolmuş.' });
  }
};
