import mongoose from 'mongoose';

const machineSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  stationId: { type: String, required: true },
  model: { type: String },
  purchaseDate: { type: String },
  specs: { type: String },
  notes: { type: String },
}, { timestamps: true });

export default mongoose.model('Machine', machineSchema);
