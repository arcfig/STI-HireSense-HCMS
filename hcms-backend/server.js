require('dotenv').config(); // Loads your .env file
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
const rateLimit = require('express-rate-limit');
// Import the routes


const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

// --- SECURITY: Rate Limiting ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 9999, // Limit each IP to 5 requests per windowMs
  message: { 
    error: "Too many login attempts from this IP, please try again after 15 minutes." 
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Middleware to handle JSON and Cross-Origin requests
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors({
    origin: '*', // Or explicitly define the frontend URL: 'https://purple-barracuda-906917.hostingersite.com'
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'], // The explicit inclusion of 'Authorization' resolves the 204 block
    credentials: true
}));
const facultyRoutes = require('./routes/facultyRoutes');
const authRoutes = require('./routes/authRoutes');

// Tell the server to use them
app.use('/api/faculty', facultyRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/verify-certificate', require('./routes/certificateVerification'));
// The actual connection to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Successfully connected to MongoDB Atlas!'))
  .catch((error) => console.error('Database connection failed:', error));

// A simple test route
app.get('/', (req, res) => {
  res.send('HCMS API is running securely...');
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});