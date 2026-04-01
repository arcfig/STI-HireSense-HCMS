const express = require('express');
const User = require('../models/User');
const router = express.Router();

// ROUTE 1: Get all users (Hide the passwords!)
router.get('/', async (req, res) => {
  try {
    const users = await User.find({}, '-passwordHash').sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users." });
  }
});

// ROUTE 2: Update a user's role 
router.put('/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id, 
      { role }, 
      { returnDocument: 'after' } // <-- FIXED HERE!
    ).select('-passwordHash');
    
    res.status(200).json({ message: "Role updated successfully", user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: "Failed to update user role." });
  }
});

// ROUTE 3: Delete a user
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    // Safety check: Prevent the system from deleting the main.admin account!
    if (user.username === 'main.admin') {
      return res.status(403).json({ error: "Cannot delete the master administrator account." });
    }

    await User.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "User deleted successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user." });
  }
});

// ROUTE 4: Update a user's skill ratings
router.put('/:id/skills', async (req, res) => {
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
module.exports = router;