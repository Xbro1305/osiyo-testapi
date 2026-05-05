import mongoose from 'mongoose';

const storeSaleSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  date: { type: String, required: true },
  customerId: { type: String, required: true, index: true },
  fabricType: { type: String },
  qty: { type: Number, default: 0 },
  unitPrice: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  notes: { type: String },
  operator: { type: String },
}, { timestamps: true });

export default mongoose.model('StoreSale', storeSaleSchema);
