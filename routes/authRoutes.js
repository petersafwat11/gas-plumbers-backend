const express = require("express");
const authController = require("../controllers/authController");

const router = express.Router();

// Signup routes for user
router.post("/signup/user", authController.signupUser);

// Login routes
router.post("/login", authController.login); // Email/password login for user

// Existing routes (no changes)
router.get("/logout", authController.logout);
router.post("/forgotPassword", authController.forgotPassword);
router.patch("/resetPassword/:token", authController.resetPassword);

// Protect all routes after this middleware
router.use(authController.protect);

router.patch("/updateMyPassword", authController.updatePassword);

module.exports = router;
