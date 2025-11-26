// server/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true, 
    minlength: 3, 
    maxlength: 15 
  },
  email: { 
    type: String, 
    unique: true, 
    sparse: true, 
    trim: true // null değerlere izin verirken benzersizliği korur
  },
  password: { 
    type: String, 
    required: true 
  },
  
  // --- Oyun Stats ---
  tokens: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  xp: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  level: { 
    type: Number, 
    default: 1, 
    min: 1 
  },
  size: { 
    type: Number, 
    default: 20 
  },
  
  // --- Upgrades ---
  speedUpgrade: { 
    type: Number, 
    default: 0 
  },
  penaltyFactor: { 
    type: Number, 
    default: 0.002 
  },
  skinColor: { 
    type: String, 
    default: '#00ffcc' 
  },
  
  // --- Pet (Phase 2 Entegrasyonu) ---
  activePet: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Pet', 
    default: null // Şu anda aktif olan Pet
  },
  ownedPets: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Pet' // Sahip olduğu tüm Pet'ler
  }],
  accessories: { // Player karakterinin aksesuarları
    hat: { type: String, default: null },
    glasses: { type: String, default: null },
    chain: { type: String, default: null },
    background: { type: String, default: null }
  },
  
  // --- Sosyal ---
  friends: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  friendRequests: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  
  // --- Anti-Cheat & Admin ---
  lastLogin: { 
    type: Date, 
    default: Date.now 
  },
  loginStreak: { 
    type: Number, 
    default: 1 
  },
  deviceId: String,
  ipAddress: String,
  isBanned: { 
    type: Boolean, 
    default: false 
  },
  isAdmin: { 
    type: Boolean, 
    default: false // Admin paneli için kritik alan
  },
  banReason: String,
  suspiciousActivity: { 
    type: Number, 
    default: 0 
  },
  
}, { timestamps: true }); // createdAt ve updatedAt otomatik eklendi

// ****************************
// Middleware: Şifreyi Kaydetmeden Önce Hashleme
// ****************************
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// ****************************
// Metod: Şifre Karşılaştırma
// ****************************
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', UserSchema);
export default User;