const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const { verifyToken } = require("../middleware/auth");

// GET /api/invoices - List all invoices
router.get("/", verifyToken, async (req, res) => {
  try {
    const invoices = await Invoice.find()
      .select("invoiceNo date project companyName companyAddress items subtotal cgstPercent cgstAmount sgstPercent sgstAmount igstPercent igstAmount totalAmount status createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, count: invoices.length, invoices });
  } catch (err) {
    console.error("Error fetching invoices:", err);
    res.status(500).json({ success: false, message: "Failed to fetch invoices" });
  }
});

// GET /api/invoices/:id - Get single invoice
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).lean();
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    res.status(200).json({ success: true, invoice });
  } catch (err) {
    console.error("Error fetching invoice:", err);
    res.status(500).json({ success: false, message: "Failed to fetch invoice" });
  }
});

// POST /api/invoices - Create new invoice
router.post("/", verifyToken, async (req, res) => {
  try {
    const {
      invoiceNo,
      date,
      project,
      companyName,
      companyAddress,
      items,
      subtotal,
      cgstPercent,
      cgstAmount,
      sgstPercent,
      sgstAmount,
      igstPercent,
      igstAmount,
      totalAmount,
      status
    } = req.body;

    if (!companyName) {
      return res.status(400).json({ success: false, message: "Company name is required" });
    }

    let resolvedInvoiceNo = invoiceNo;
    if (!resolvedInvoiceNo) {
      const count = await Invoice.countDocuments();
      resolvedInvoiceNo = String(100 + count + 1);
    }

    const newInvoice = new Invoice({
      invoiceNo: resolvedInvoiceNo,
      date: date || new Date().toISOString().split("T")[0],
      project: project || "Adani Cargo Terminal - Gujarat",
      companyName,
      companyAddress: companyAddress || "",
      items: items || [],
      subtotal: Number(subtotal) || 0,
      cgstPercent: Number(cgstPercent) || 0,
      cgstAmount: Number(cgstAmount) || 0,
      sgstPercent: Number(sgstPercent) || 0,
      sgstAmount: Number(sgstAmount) || 0,
      igstPercent: Number(igstPercent) || 0,
      igstAmount: Number(igstAmount) || 0,
      totalAmount: Number(totalAmount) || 0,
      status: status || "issued",
      createdBy: req.user?._id
    });

    const saved = await newInvoice.save();
    res.status(201).json({ success: true, invoice: saved });
  } catch (err) {
    console.error("Error creating invoice:", err);
    res.status(500).json({ success: false, message: "Failed to create invoice" });
  }
});

// PUT /api/invoices/:id - Update invoice
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const updated = await Invoice.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    res.status(200).json({ success: true, invoice: updated });
  } catch (err) {
    console.error("Error updating invoice:", err);
    res.status(500).json({ success: false, message: "Failed to update invoice" });
  }
});

// DELETE /api/invoices/:id - Delete invoice by MongoDB _id or invoiceNo
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    let deleted = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      deleted = await Invoice.findByIdAndDelete(id);
    }
    if (!deleted) {
      deleted = await Invoice.findOneAndDelete({ invoiceNo: id });
    }
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    res.status(200).json({ success: true, message: "Invoice deleted successfully" });
  } catch (err) {
    console.error("Error deleting invoice:", err);
    res.status(500).json({ success: false, message: "Failed to delete invoice" });
  }
});

module.exports = router;
