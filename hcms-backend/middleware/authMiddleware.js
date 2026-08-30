const { jwtVerify } = require('jose');

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'STI_Super_Secret_Key_2026');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: "Access denied. No authentication token provided." });
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    req.user = payload;
    next();
  } catch (error) {
    // Expose the native error to the backend logs
    console.error("JWT Verification Failure:", error.code, error.message);
    return res.status(403).json({ error: "Invalid or expired token." });
  }
};

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions." });
    }
    next();
  };
};

module.exports = { verifyToken, requireRole, secret };