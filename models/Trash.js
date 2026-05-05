import mongoose from 'mongoose';

// Soft-delete bin. Items deleted from any collection get copied here with
// metadata so they can be restored within the retention window.
// `type` describes the original collection: 'rec_input', 'rec_dyeing',
// 'user', 'design', 'machine', 'program', 'customer', etc.
const trashSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  type: { type: String, required: true, index: true },
  recordId: { type: String, required: true },
  // Frozen copy of the original item.
  item: { type: Object, required: true },
  deletedAt: { type: String, required: true },
  deletedBy: { type: String, default: 'system' },
}, { timestamps: true });

export default mongoose.model('Trash', trashSchema);
