import mongoose from 'mongoose';

// Programs hold multi-design groupings used by the Printing and Dyeing stations.
// Discriminated by `programType` ('printing' | 'dyeing'). Existing programs
// without programType are treated as 'printing' for backward compat.
const programSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  programType: { type: String, enum: ['printing', 'dyeing'], default: 'printing' },
  status: { type: String, default: 'Active' },
  createdAt: { type: String },
  // Each line: { id, designNumber, designName, qty, foldingPlan }
  lines: { type: [Object], default: [] },
  notes: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('Program', programSchema);
