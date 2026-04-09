const mongoose = require('mongoose');

const programSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  // This line links the Program to the Department we just made
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true }
});

module.exports = mongoose.model('Program', programSchema);