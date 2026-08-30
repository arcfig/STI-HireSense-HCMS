const express = require('express');
const router = express.Router();
const Faculty = require('../models/Faculty');
const { processVerificationInBackground, verificationEmitter } = require('../services/verificationService');
const { verifyToken } = require('../middleware/authMiddleware');

// --------------------------------------------------------
// ROUTE: Trigger AI Verification (Async Fire-and-Forget)
// --------------------------------------------------------
router.post('/', verifyToken, async (req, res) => {
  try {
    const { facultyId } = req.body;

    if (!facultyId) {
      return res.status(400).json({ error: "Missing facultyId in request body." });
    }

    const faculty = await Faculty.findById(facultyId);
    if (!faculty) {
      return res.status(404).json({ error: "Faculty document not found." });
    }

    // Immediately update status to 'verifying'
    faculty.verificationStatus = 'verifying';
    await faculty.save();

    // Fire and forget the background process. 
    // The .catch() ensures any unhandled errors don't crash the node process.
    processVerificationInBackground(facultyId, req.user.username).catch(err => {
      console.error("Fatal error in background verification:", err);
    });

    // Return 202 Accepted immediately
    res.status(202).json({ 
      message: "Verification started in the background.", 
      facultyId,
      status: "verifying" 
    });

  } catch (error) {
    console.error("Error triggering verification:", error);
    res.status(500).json({ error: "An unexpected error occurred while starting verification." });
  }
});

// --------------------------------------------------------
// ROUTE: Server-Sent Events (SSE) Stream
// --------------------------------------------------------
router.get('/stream', verifyToken, (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // flush the headers to establish connection

  // Send an initial ping so the client knows connection is established
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE Connection Established' })}\n\n`);

  // Listener function
  const onVerificationComplete = (eventData) => {
    // Send data to the client
    res.write(`data: ${JSON.stringify({ type: 'verificationComplete', ...eventData })}\n\n`);
  };

  // Subscribe to the global verificationEmitter
  verificationEmitter.on('verificationComplete', onVerificationComplete);

  // Clean up when client disconnects
  req.on('close', () => {
    verificationEmitter.off('verificationComplete', onVerificationComplete);
  });
});

module.exports = router;
