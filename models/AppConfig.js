import mongoose from 'mongoose';

// Generic key/value store for app-level config.
// Used for: 'numbering' (rout-card numbering presets), 'prefs' (lang/theme),
// and any future singletons.
const appConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  data: { type: Object, required: true, default: {} },
}, { timestamps: true });

export default mongoose.model('AppConfig', appConfigSchema);
