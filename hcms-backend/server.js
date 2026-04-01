require('dotenv').config(); // Loads your .env file
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
// Import the routes


const app = express();
const PORT = process.env.PORT || 5000;

// Middleware to handle JSON and Cross-Origin requests
app.use(express.json());
app.use(cors());
const facultyRoutes = require('./routes/facultyRoutes');
const authRoutes = require('./routes/authRoutes');

// Tell the server to use them
app.use('/api/faculty', facultyRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
// The actual connection to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Successfully connected to MongoDB Atlas!'))
  .catch((error) => console.error('Database connection failed:', error));

// A simple test route
app.get('/', (req, res) => {
  res.send('HCMS API is running securely...');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});