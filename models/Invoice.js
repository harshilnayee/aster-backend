const mongoose = require("mongoose");

const InvoiceItemSchema = new mongoose.Schema(
  {
    hsnCode: { type: String, default: "--------NA---------" },
    description: { type: String, default: "General Health Check up charges- Per Person" },
    unit: { type: String, default: "NOS" },
    quantity: { type: Number, default: 1 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 }
  },
  { _id: false }
);

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true },
    date: { type: String, required: true },
    project: { type: String, default: "Adani Cargo Terminal - Gujarat" },
    companyName: { type: String, required: true },
    companyAddress: { type: String, default: "" },
    items: [InvoiceItemSchema],
    subtotal: { type: Number, default: 0 },
    cgstPercent: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstPercent: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstPercent: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    status: { type: String, enum: ["draft", "issued", "paid"], default: "issued" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Invoice", InvoiceSchema);
