import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  phone: { type: String },
  address: { type: String },
  notes: { type: String },
  createdAt: { type: String },
}, { timestamps: true });

export default mongoose.model('Customer', customerSchema);
