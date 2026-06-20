const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { verifyToken, requireRole } = require("../middleware/auth");

// All routes here require verification and are admin-only
router.use(verifyToken, requireRole("admin"));

// GET /api/users - List all users
router.get("/", userController.getUsers);

// POST /api/users - Register a new employee/user
router.post("/", userController.createUser);

// PUT /api/users/:id/access - Update active flag or form permissions
router.put("/:id/access", userController.updateUserAccess);

module.exports = router;
