import mongoose from 'mongoose';

const storeStockInSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  date: { type: String, required: true },
  fabricType: { type: String },
  qty: { type: Number, default: 0 },
  source: { type: String },
  notes: { type: String },
  operator: { type: String },
}, { timestamps: true });

export default mongoose.model('StoreStockIn', storeStockInSchema);
