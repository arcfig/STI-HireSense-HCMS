const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User'); 
const router = express.Router();

const seedDatabase = async () => {
  const count = await User.countDocuments();
  if (count === 0) {
    console.log("Empty database detected. Generating default accounts...");
    await User.create([
      { username: "henry.garcia", passwordHash: bcrypt.hashSync("password123", 10), role: "faculty", name: "Henry Garcia" },
      // FIXED: Generic Admin account instead of Alain
      { username: "main.admin", passwordHash: bcrypt.hashSync("admin123", 10), role: "hr", name: "System Administrator" } 
    ]);
    console.log("Default accounts created securely!");
  }
};
seedDatabase();

// --- NEW ROUTE: REGISTER ACCOUNT ---
router.post('/register', async (req, res) => {
  const { name, username, password, role } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: "Username already taken." });

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = new User({ name, username, passwordHash, role: role || 'faculty' });
    await newUser.save();

    res.status(201).json({ message: "Account created successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Server error during registration." });
  }
});

// --- EXISTING ROUTES: LOGIN & CHANGE PASSWORD ---
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: "Invalid username or password" });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (isMatch) {
      res.status(200).json({
        message: "Login successful",
        user: { id: user._id, username: user.username, role: user.role, name: user.name }
      });
    } else {
      res.status(401).json({ error: "Invalid username or password" });
    }
  } catch (error) {
    res.status(500).json({ error: "Server error during login" });
  }
});

router.put('/change-password', async (req, res) => {
  const { username, currentPassword, newPassword } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) return res.status(401).json({ error: "Incorrect current password" });

    const newHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = newHash;
    await user.save();

    res.status(200).json({ message: "Password updated successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Server error while changing password" });
  }
});


// --- NEW ROUTE: FORGOT PASSWORD (PROTOTYPE BYPASS) ---
router.post('/forgot-password', async (req, res) => {
  const { username } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "Username not found in the system." });

    // Prototype bypass: Reset to a temporary password instead of sending an email
    const tempPassword = "STI_password123";
    user.passwordHash = await bcrypt.hash(tempPassword, 10);
    await user.save();

    res.status(200).json({ 
      message: `Password reset successful! Your temporary password is: ${tempPassword}. Please log in and change it immediately.` 
    });
  } catch (error) {
    res.status(500).json({ error: "Server error during password reset." });
  }
});
module.exports = router;