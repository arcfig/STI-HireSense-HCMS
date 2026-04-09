// middleware/authMiddleware.js

const requireHR = (req, res, next) => {
  // The frontend will send a custom "ID Badge" in the request headers
  const userRole = req.header('X-User-Role');

  if (!userRole) {
    return res.status(401).json({ error: "Access Denied: No role provided." });
  }

  if (userRole === 'hr' || userRole === 'admin') {
    next(); // They are HR or Admin! Let them through to the route.
  } else {
    res.status(403).json({ error: "Forbidden: HR clearance required to access this data." });
  }
};

module.exports = { requireHR };