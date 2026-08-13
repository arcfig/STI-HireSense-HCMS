require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Faculty = require('../models/Faculty');
const User = require('../models/User');

async function fixDepartments() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB.");

    const mapping = {
      'Quality Management': 'General Education',
      'Education': 'General Education',
      'Science and Mathematics': 'General Education',
      'Computer Systems': 'Information Technology',
      'IT': 'Information Technology'
    };

    for (const [oldDept, newDept] of Object.entries(mapping)) {
      const facRes = await Faculty.updateMany({ department: oldDept }, { $set: { department: newDept } });
      const userRes = await User.updateMany({ department: oldDept }, { $set: { department: newDept } });
      console.log(`Mapped '${oldDept}' to '${newDept}' -> Faculty: ${facRes.modifiedCount}, Users: ${userRes.modifiedCount}`);
    }

    console.log('Legacy departments standardized successfully!');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

fixDepartments();
