import mongoose from 'mongoose';

const designSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  designNumber: { type: String, required: true },
  name: { type: String },
  // New: server-side path (e.g. "/uploads/designs/<uuid>.png") returned by
  // POST /api/designs/upload. The frontend stores only this path; the actual
  // bytes live on disk.
  imageUrl: { type: String },
  // Legacy: base64 dataURL string. Old records may still carry this; new uploads
  // always go through imageUrl + disk storage to keep the DB small.
  imageData: { type: String },
  notes: { type: String },
}, { timestamps: true });

export default mongoose.model('Design', designSchema);
