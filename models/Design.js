import mongoose from 'mongoose';

const designSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  designNumber: { type: String, required: true },
  name: { type: String },
  // imageData is a base64 dataURL string. Can be megabytes.
  imageData: { type: String },
  notes: { type: String },
}, { timestamps: true });

export default mongoose.model('Design', designSchema);
