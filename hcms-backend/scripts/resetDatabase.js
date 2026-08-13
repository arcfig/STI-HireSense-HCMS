require('dotenv').config({ path: '../.env' }); // Assuming you run this from inside the scripts folder
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Assuming your models are one directory up
const User = require('../models/User');
const Faculty = require('../models/Faculty'); 

async function resetDatabase() {
  try {
    console.log("Connecting to MongoDB Atlas...");
    // Connect to the database using the URI from your .env
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected successfully.");

    // 1. Wipe the data
    console.log("Clearing existing Users and Faculty data...");
    await User.deleteMany({});
    await Faculty.deleteMany({});
    
    // Add other collections here if needed, e.g.:
    // await mongoose.connection.collection('notifications').deleteMany({});

    // 2. Recreate the Admin Role
    console.log("Seeding default Administrator account...");
    const adminPasswordHash = await bcrypt.hash("admin123", 10);
    
    await User.create([
      { 
        username: "main.admin", 
        passwordHash: adminPasswordHash, 
        role: "admin", 
        name: "System Administrator" 
      }
    ]);

    console.log("✅ Database reset complete! Clean slate ready for testing.");
    process.exit(0); // Exit the script successfully
  } catch (error) {
    console.error("❌ Error resetting database:", error);
    process.exit(1); // Exit with error
  }
}

// Execute the function
resetDatabase();
