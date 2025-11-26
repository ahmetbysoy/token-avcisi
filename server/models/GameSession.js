// server/models/GameSession.js
import mongoose from 'mongoose';

const GameSessionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  startTime: { 
    type: Date, 
    default: Date.now 
  },
  endTime: Date,
  durationSeconds: { 
    type: Number, 
    default: 0 
  },
  
  // --- Oyun İçi Kazanımlar/Kayıplar ---
  tokensEarned: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  xpGained: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  foodEaten: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  
  // --- Anti-Cheat Verisi (Client'tan Gelen) ---
  movementVariance: { 
    type: Number, 
    default: 0 // Hareket çeşitliliği (0 = Bot)
  },
  afkTime: { 
    type: Number, 
    default: 0 // AFK geçirilen süre
  },
  
  // --- Denetim ---
  flagged: { 
    type: Boolean, 
    default: false 
  },
  flagReason: String,
  
}, { timestamps: true });

const GameSession = mongoose.model('GameSession', GameSessionSchema);
export default GameSession;