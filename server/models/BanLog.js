// server/models/BanLog.js
import mongoose from 'mongoose';

const BanLogSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  adminId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true // Hangi adminin banladığı
  },
  reason: { 
    type: String, 
    required: true 
  },
  duration: { 
    type: Number, 
    default: null // null ise süresiz (milisaniye cinsinden)
  },
  bannedAt: { 
    type: Date, 
    default: Date.now 
  },
  expiresAt: { 
    type: Date, 
    default: null // Ban süresinin ne zaman biteceği
  },
  isActive: { 
    type: Boolean, 
    default: true // Ban hala geçerli mi
  }
}, { timestamps: true });

const BanLog = mongoose.model('BanLog', BanLogSchema);
export default BanLog;