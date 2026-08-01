import mongoose from 'mongoose';

// Quality & R&D station collections. The records have varied, evolving shapes
// (fishbone 6M object, 5-Whys array, 8D discipline object, etc.), so these use
// strict:false — any fields the frontend sends are stored as-is. Every record
// carries a client-generated `id` (the upsert key) plus timestamps.
function qcModel(name) {
  const schema = new mongoose.Schema(
    { id: { type: String, required: true, unique: true } },
    { strict: false, timestamps: true },
  );
  return mongoose.model(name, schema);
}

export const QcDefectCode = qcModel('QcDefectCode');
export const QcDefectLog = qcModel('QcDefectLog');
export const QcFishbone = qcModel('QcFishbone');
export const QcFiveWhy = qcModel('QcFiveWhy');
export const QcPfmea = qcModel('QcPfmea');
export const QcEightD = qcModel('QcEightD');
