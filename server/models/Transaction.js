// server/models/Transaction.js
import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
  fromUser: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true // Hızlı arama için index
  },
  toUser: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true // Hızlı arama için index
  },
  // Transfer edilen net miktar
  amount: { 
    type: Number, 
    required: true, 
    min: 1 
  },
  // İşlemden kesilen komisyon (Transferler için %5)
  fee: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  type: {
    type: String,
    required: true,
    enum: ['transfer', 'gift', 'purchase', 'deposit', 'withdrawal', 'reward_streak', 'admin_edit']
  },
  status: {
    type: String,
    default: 'completed',
    enum: ['pending', 'completed', 'failed', 'refunded']
  },
  
  // --- Anti-Fraud Verileri ---
  // Aynı cihazdan/IP'den yapılan işlemleri izlemek için
  sameDevice: { 
    type: Boolean, 
    default: false 
  },
  sameIP: { 
    type: Boolean, 
    default: false 
  },
  flagged: { 
    type: Boolean, 
    default: false // Şüpheli işlem bayrağı
  },
  flagReason: String, // Neden şüpheli bulunduğu
  
}, { timestamps: true }); // İşlem zamanı kaydı

const Transaction = mongoose.model('Transaction', TransactionSchema);
export default Transaction;