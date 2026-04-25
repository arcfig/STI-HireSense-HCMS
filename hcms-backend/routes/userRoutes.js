const express = require('express');
const User = require('../models/User');
const router = express.Router();

// 1. Import the new jose JWT middleware
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

// ==========================================
// SECTION 1: SPECIFIC ROUTES (Must go first)
// ==========================================

// 1. Fetch Active Users (Secured: Admin only)
router.get('/active', verifyToken, requireRole(['admin']), async (req, res) => {
  try {
    const activeUsers = await User.find({ isArchived: { $ne: true } }).select('-passwordHash').sort({ createdAt: -1 });
    res.status(200).json(activeUsers);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch active users." });
  }
});

// 2. Fetch Archived Users (Secured: Admin only)
router.get('/archived', verifyToken, requireRole(['admin']), async (req, res) => {
  try {
    const archivedUsers = await User.find({ isArchived: true }).select('-passwordHash').sort({ createdAt: -1 });
    res.status(200).json(archivedUsers);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch archived users." });
  }
});

// 3. Get ALL users (Legacy route, Secured: Admin or HR)
router.get('/', verifyToken, requireRole(['admin', 'hr']), async (req, res) => {
  try {
    const users = await User.find({}, '-passwordHash').sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users." });
  }
});

// ==========================================
// SECTION 2: DYNAMIC ROUTES (Must go last)
// ==========================================

// Archive User (Secured: Admin only)
router.put('/:id/archive', verifyToken, requireRole(['admin']), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isArchived: true }, { new: true });
    if (!user) return res.status(404).json({ error: "User not found." });
    res.status(200).json({ message: "User successfully archived." });
  } catch (error) {
    res.status(500).json({ error: "Failed to archive user." });
  }
});

// Restore User (Secured: Admin only)
router.put('/:id/restore', verifyToken, requireRole(['admin']), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isArchived: false }, { new: true });
    if (!user) return res.status(404).json({ error: "User not found." });
    res.status(200).json({ message: "User successfully restored." });
  } catch (error) {
    res.status(500).json({ error: "Failed to restore user." });
  }
});

// Update a user's role (Secured: Admin only)
router.put('/:id/role', verifyToken, requireRole(['admin']), async (req, res) => {
  try {
    const { role } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id, 
      { role }, 
      { returnDocument: 'after' }
    ).select('-passwordHash');
    
    res.status(200).json({ message: "Role updated successfully", user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: "Failed to update user role." });
  }
});

// Update a user's skill ratings (Secured: Any logged-in user)
router.put('/:id/skills', verifyToken, async (req, res) => {
  try {
    const { skillRatings } = req.body;
    
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id, 
      { skillRatings }, 
      { returnDocument: 'after' }
    ).select('-passwordHash');
    
    if (!updatedUser) return res.status(404).json({ error: "User not found." });

    res.status(200).json({ message: "Skill ratings saved successfully!", user: updatedUser });
  } catch (error) {
    console.error("Error saving skills:", error);
    res.status(500).json({ error: "Failed to save skill ratings." });
  }
});

// Update a user's account details (Secured: Any logged-in user)
router.put('/:id/profile', verifyToken, async (req, res) => {
  try {
    const { username, email, phoneNumber } = req.body;
    
    const existingUser = await User.findOne({ username });
    if (existingUser && existingUser._id.toString() !== req.params.id) {
      return res.status(400).json({ error: "That username is already taken." });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id, 
      { username, email, phoneNumber }, 
      { returnDocument: 'after' }
    ).select('-passwordHash');
    
    if (!updatedUser) return res.status(404).json({ error: "User not found." });

    res.status(200).json({ message: "Profile updated successfully!", user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: "Failed to update profile details." });
  }
});

// Delete a user (Secured: Admin only)
router.delete('/:id', verifyToken, requireRole(['admin']), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (user.username === 'admin.user') {
      return res.status(403).json({ error: "Cannot delete the master administrator account." });
    }

    await User.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "User deleted successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user." });
  }
});

module.exports = router;