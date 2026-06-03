import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  // Human-friendly short identifier (e.g. "C-001"). The frontend uses this
  // as the primary label in sale listings — operators recognise customers
  // by code faster than by full name. Optional for legacy records.
  code: { type: String },
  name: { type: String, required: true },
  // Customer category from lists.customerType (e.g. "Retail", "Wholesale").
  // Used for grouping/filtering in reports. Optional.
  type: { type: String },
  phone: { type: String },
  address: { type: String },
  notes: { type: String },
  createdAt: { type: String },
}, { timestamps: true });

export default mongoose.model('Customer', customerSchema);
