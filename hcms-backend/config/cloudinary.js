const cloudinary = require('cloudinary').v2;
const multer = require('multer');
require('dotenv').config();

// 1. Log in directly to Cloudinary using your secure keys
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. Set Multer to use "Memory Storage"
// Instead of saving the file to your hard drive, it holds it in RAM just long enough to send it to Cloudinary.
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // Optional: Stops users from uploading files bigger than 5MB
});

// Export both tools so our routes can use them
module.exports = { cloudinary, upload };