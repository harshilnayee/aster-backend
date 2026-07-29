const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const { query } = require("../controllers/chatbotController");

router.post("/query", verifyToken, query);

module.exports = router;
