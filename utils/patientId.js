const mongoose = require("mongoose");

// Atomic counter schema for concurrent-safe ID generation
const CounterSchema = new mongoose.Schema({
  year: {
    type: Number,
    required: true,
    unique: true
  },
  seq: {
    type: Number,
    default: 0
  }
});

let Counter;
try {
  Counter = mongoose.model("Counter");
} catch {
  Counter = mongoose.model("Counter", CounterSchema);
}

/**
 * Generates a unique Patient ID in the format PT-YYYY-XXXX (e.g. PT-2026-0001).
 * Uses an atomic counter collection pattern to ensure thread safety and handle concurrency.
 * @returns {Promise<string>} The generated unique patient ID.
 */
async function generatePatientId() {
  const year = new Date().getFullYear();
  
  // Atomically increment the sequence for the current year
  const counter = await Counter.findOneAndUpdate(
    { year },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const formattedSequence = String(counter.seq).padStart(4, "0");
  return `PT-${year}-${formattedSequence}`;
}

module.exports = {
  generatePatientId
};
