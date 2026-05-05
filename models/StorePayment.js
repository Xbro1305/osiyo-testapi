import mongoose from 'mongoose';

const storePaymentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  date: { type: String, required: true },
  customerId: { type: String, required: true, index: true },
  amount: { type: Number, default: 0 },
  notes: { type: String },
  operator: { type: String },
}, { timestamps: true });

export default mongoose.model('StorePayment', storePaymentSchema);
