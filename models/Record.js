import mongoose from 'mongoose';

// All "table" data in the artifact (input batches, bleach records, dyeing
// records, printing, curing, finishing, calendering, folding, gray store,
// gray out, dispatch in/out, maintenance, breakdown, daily checks, trash)
// goes into THIS collection, discriminated by stationKey.
//
// Why one model: the data shapes evolve over time and Mongoose schemas would
// be more friction than help. We keep `data` as a free-form object.
const recordSchema = new mongoose.Schema({
  // Client-supplied id (the artifact generates these via uid()).
  id: { type: String, required: true },
  stationKey: { type: String, required: true, index: true },
  data: { type: Object, required: true },
}, { timestamps: true });

// Same id can repeat across different stations, but must be unique within one.
recordSchema.index({ stationKey: 1, id: 1 }, { unique: true });
// Speed up date-sorted queries.
recordSchema.index({ stationKey: 1, 'data.date': -1 });

export default mongoose.model('Record', recordSchema);
