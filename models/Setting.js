const mongoose = require("mongoose");

const SettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, "Setting key is required"],
      unique: true,
      trim: true
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, "Setting value is required"]
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Setting", SettingSchema);
