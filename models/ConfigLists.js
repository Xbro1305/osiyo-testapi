import mongoose from 'mongoose';

// Singleton-style collection holding the dropdown lists used across the artifact.
// We treat the first document as authoritative.
const configListsSchema = new mongoose.Schema({
  data: { type: Object, required: true, default: {} },
}, { timestamps: true });

export default mongoose.model('ConfigLists', configListsSchema);
