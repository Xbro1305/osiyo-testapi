import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  login: { type: String, required: true, unique: true },
  // We store the BCRYPT HASH here — never the plaintext.
  passcode: { type: String, required: true },
  role: {
    type: String,
    required: true,
    // Match the role list used in the artifact.
    enum: ['admin', 'dept_admin', 'operator', 'guest']
  },
  // Optional access fields — used by dept_admin / operator / guest roles.
  departmentId: { type: String, default: null },
  stationId: { type: String, default: null },
  allowedDepartments: { type: [String], default: [] },
  allowedPages: { type: [String], default: [] },
  active: { type: Boolean, default: true },
}, { timestamps: true });

// Pre-save hook: if the passcode field was modified and isn't already a bcrypt
// hash, hash it before saving. This means callers can pass plaintext to .save()
// safely — the hash happens here.
userSchema.pre('save', async function (next) {
  if (!this.isModified('passcode')) return next();
  // Skip rehashing if it already looks like a bcrypt hash.
  if (typeof this.passcode === 'string' && /^\$2[aby]\$/.test(this.passcode)) return next();
  this.passcode = await bcrypt.hash(this.passcode, 10);
  next();
});

// Verify a plaintext passcode against the stored hash.
userSchema.methods.verifyPasscode = function (plaintext) {
  return bcrypt.compare(plaintext, this.passcode);
};

export default mongoose.model('User', userSchema);
