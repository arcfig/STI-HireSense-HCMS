const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { SignJWT, jwtVerify } = require('jose');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const { verifyToken } = require('../middleware/authMiddleware');
const { auditLogger, recordAuditEvent } = require('../middleware/auditLogger');
const { maskEmail, sendTwoFactorOtp } = require('../services/emailService');
const router = express.Router();

const rpName = 'STI Human Capital System';
// Use localhost for local dev. In production, this should be the actual domain.
const rpID = process.env.WEBAUTHN_RP_ID || 'localhost';
const origin = process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173';

function resolveWebAuthnConfig(req) {
  const reqOrigin = req.get('origin') || origin;
  try {
    const parsed = new URL(reqOrigin);
    const hostname = parsed.hostname.replace(/^www\./i, '');
    return {
      rpID: hostname || rpID,
      expectedOrigin: reqOrigin
    };
  } catch {
    return {
      rpID,
      expectedOrigin: reqOrigin
    };
  }
}

// Initialize the secret key for token signing
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'STI_Super_Secret_Key_2026');

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function findAuthenticatedUser(req) {
  const rawId = req.user?.id || req.user?._id;
  if (typeof rawId === 'string' && /^[a-f\d]{24}$/i.test(rawId)) {
    const byId = await User.findById(rawId);
    if (byId) return byId;
  }
  const username = req.user?.username || req.body?.username;
  if (username) {
    return User.findOne({ username });
  }
  return null;
}

function serializeUser(user) {
  return {
    _id: user._id,
    name: user.name,
    username: user.username,
    role: user.role,
    department: user.department || '',
    email: user.email || '',
    phoneNumber: user.phoneNumber || '',
    twoFactorEnabled: Boolean(user.twoFactorEnabled)
  };
}

function serializePasskeys(user) {
  return (user.webAuthnCredentials || []).map((cred, index) => ({
    id: cred.credentialID,
    deviceName: cred.deviceName || `Passkey #${index + 1}`,
    createdAt: cred.createdAt || user.updatedAt || user.createdAt || null,
    lastUsedAt: cred.lastUsedAt || null
  }));
}

function detectDeviceName(userAgent = '') {
  const ua = String(userAgent);
  let os = 'Device';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = '';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome / Brave';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  return browser ? `${os} Passkey (${browser})` : `${os} Passkey`;
}

// const seedDatabase = async () => {
//   const count = await User.countDocuments();
//   if (count === 0) {
//     console.log("Empty database detected. Generating default accounts...");
//     await User.create([
//       { username: "faculty.user", passwordHash: bcrypt.hashSync("password123", 10), role: "faculty", name: "Faculty Member" },
//       { username: "main.admin", passwordHash: bcrypt.hashSync("admin123", 10), role: "admin", name: "System Administrator" } 
//     ]);
//     console.log("Default accounts created securely!");
//   }
// };
// seedDatabase();

// --- ROUTE: REGISTER ACCOUNT ---
router.post('/register', async (req, res) => {
  const { name, username, password, department, email, phoneNumber } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: "Username already taken." });

    const passwordHash = await bcrypt.hash(password, 10);
    // Security Fix: Hardcode role to 'faculty' to prevent privilege escalation
    const newUser = new User({ 
      name, 
      username, 
      passwordHash, 
      role: 'faculty',
      department: department || '',
      email: email || '',
      phoneNumber: phoneNumber || ''
    });
    await newUser.save();

    res.status(201).json({ message: "Account created successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Server error during registration." });
  }
});

// --- ROUTE: LOGIN (Generates JWT) ---
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. Find the user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // 2. Prevent archived accounts from logging in (still record attempt in audit trail)
    if (user.isArchived) {
      recordAuditEvent(req, res, { userId: user._id, username: user.username, userRole: user.role, actionType: 'LOGIN', targetResource: '/api/auth/login [archived-blocked]' });
    }
    if (user.isArchived) {
      return res.status(403).json({
        error: "Account Archived: This account has been disabled. Please contact the system administrator for restoration."
      });
    }

    // 3. Password Evaluation
    const isStandardMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isStandardMatch) {
      recordAuditEvent(req, res, { userId: user._id, username: user.username, userRole: user.role, actionType: 'LOGIN', targetResource: '/api/auth/login [invalid-password]' });
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // 4. If Email Two-Factor Authentication (2FA) is enabled, issue a 6-digit OTP instead of a JWT
    if (user.twoFactorEnabled && user.email) {
      const otpCode = generateOtpCode();
      user.twoFactorCodeHash = await bcrypt.hash(otpCode, 10);
      user.twoFactorCodeExpires = new Date(Date.now() + OTP_EXPIRY_MS);
      user.twoFactorPurpose = 'login';
      await user.save();

      const delivery = await sendTwoFactorOtp({
        toEmail: user.email,
        recipientName: user.name,
        otpCode,
        purpose: 'login'
      });

      recordAuditEvent(req, res, {
        userId: user._id,
        username: user.username,
        userRole: user.role,
        actionType: 'LOGIN',
        targetResource: '/api/auth/login [2fa-challenge-sent]'
      });

      return res.status(200).json({
        requiresTwoFactor: true,
        username: user.username,
        maskedEmail: maskEmail(user.email),
        deliveryMode: delivery.deliveryMode,
        message: `A 6-digit verification code has been sent to ${maskEmail(user.email)}.`
      });
    }

    // 5. Generate the JSON Web Token
    const token = await new SignJWT({
      id: user._id.toString(),
      username: user.username,
      role: user.role
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h') // Token expires in 24 hours
      .sign(secret);

    // 6. Success Response (record sign-in for admins and all roles)
    recordAuditEvent(req, res, { userId: user._id, username: user.username, userRole: user.role, actionType: 'LOGIN', targetResource: '/api/auth/login [method:password]' });
    res.status(200).json({
      message: "Login successful",
      token: token,
      user: serializeUser(user)
    });

  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Internal server error during authentication." });
  }
});

// --- ROUTE: VERIFY 2FA CODE DURING LOGIN ---
router.post('/login/verify-2fa', async (req, res) => {
  try {
    const { username, code } = req.body;
    const sanitizedCode = String(code || '').trim();

    if (!username || !/^\d{6}$/.test(sanitizedCode)) {
      return res.status(400).json({ error: "Please enter a valid 6-digit verification code." });
    }

    const user = await User.findOne({ username });
    if (!user || user.isArchived) {
      return res.status(401).json({ error: "Invalid verification request." });
    }

    if (
      user.twoFactorPurpose !== 'login' ||
      !user.twoFactorCodeHash ||
      !user.twoFactorCodeExpires ||
      user.twoFactorCodeExpires.getTime() < Date.now()
    ) {
      return res.status(400).json({ error: "Verification code has expired. Please request a new code." });
    }

    const isCodeValid = await bcrypt.compare(sanitizedCode, user.twoFactorCodeHash);
    if (!isCodeValid) {
      recordAuditEvent(req, res, {
        userId: user._id,
        username: user.username,
        userRole: user.role,
        actionType: 'LOGIN',
        targetResource: '/api/auth/login/verify-2fa [invalid-otp]'
      });
      return res.status(401).json({ error: "Incorrect 6-digit verification code." });
    }

    user.twoFactorCodeHash = null;
    user.twoFactorCodeExpires = null;
    user.twoFactorPurpose = null;
    await user.save();

    const token = await new SignJWT({
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      amr: ['pwd', 'otp']
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    recordAuditEvent(req, res, {
      userId: user._id,
      username: user.username,
      userRole: user.role,
      actionType: 'LOGIN',
      targetResource: '/api/auth/login/verify-2fa [method:password+email-otp]'
    });

    res.status(200).json({
      message: "Login successful",
      token,
      user: serializeUser(user)
    });
  } catch (error) {
    console.error("2FA Login Verify Error:", error);
    res.status(500).json({ error: "Internal server error during 2FA verification." });
  }
});

// --- ROUTE: RESEND 2FA CODE DURING LOGIN ---
router.post('/login/resend-2fa', async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ username });
    if (!user || user.isArchived || !user.twoFactorEnabled || !user.email) {
      return res.status(400).json({ error: "Unable to resend verification code." });
    }

    const otpCode = generateOtpCode();
    user.twoFactorCodeHash = await bcrypt.hash(otpCode, 10);
    user.twoFactorCodeExpires = new Date(Date.now() + OTP_EXPIRY_MS);
    user.twoFactorPurpose = 'login';
    await user.save();

    const delivery = await sendTwoFactorOtp({
      toEmail: user.email,
      recipientName: user.name,
      otpCode,
      purpose: 'login'
    });

    res.status(200).json({
      maskedEmail: maskEmail(user.email),
      deliveryMode: delivery.deliveryMode,
      message: `A new 6-digit verification code was sent to ${maskEmail(user.email)}.`
    });
  } catch (error) {
    console.error("2FA Resend Error:", error);
    res.status(500).json({ error: "Failed to resend verification code." });
  }
});

// --- ROUTE: SEND 2FA SETUP VERIFICATION CODE (From My Profile) ---
router.post('/2fa/send-setup-code', verifyToken, async (req, res) => {
  try {
    const user = await findAuthenticatedUser(req);
    if (!user) return res.status(404).json({ error: "User not found." });

    const candidateEmail = (req.body.email !== undefined ? req.body.email : user.email || '').trim();
    if (!candidateEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) {
      return res.status(400).json({ error: "Please provide a valid Email Address (For 2FA) before enabling Two-Factor Authentication." });
    }

    user.email = candidateEmail;
    const otpCode = generateOtpCode();
    user.twoFactorCodeHash = await bcrypt.hash(otpCode, 10);
    user.twoFactorCodeExpires = new Date(Date.now() + OTP_EXPIRY_MS);
    user.twoFactorPurpose = 'enable';
    await user.save();

    const delivery = await sendTwoFactorOtp({
      toEmail: user.email,
      recipientName: user.name,
      otpCode,
      purpose: 'enable'
    });

    res.status(200).json({
      maskedEmail: maskEmail(user.email),
      deliveryMode: delivery.deliveryMode,
      user: serializeUser(user),
      message: `Verification code sent to ${maskEmail(user.email)}. Enter the 6-digit code below to activate 2FA.`
    });
  } catch (error) {
    console.error("2FA Setup Code Error:", error);
    res.status(500).json({ error: "Failed to send 2FA verification code." });
  }
});

// --- ROUTE: VERIFY & ENABLE 2FA (From My Profile) ---
router.post('/2fa/verify-setup', verifyToken, auditLogger(), async (req, res) => {
  try {
    const sanitizedCode = String(req.body.code || '').trim();

    if (!/^\d{6}$/.test(sanitizedCode)) {
      return res.status(400).json({ error: "Please enter a valid 6-digit verification code." });
    }

    const user = await findAuthenticatedUser(req);
    if (!user) return res.status(404).json({ error: "User not found." });

    if (
      user.twoFactorPurpose !== 'enable' ||
      !user.twoFactorCodeHash ||
      !user.twoFactorCodeExpires ||
      user.twoFactorCodeExpires.getTime() < Date.now()
    ) {
      return res.status(400).json({ error: "Verification code has expired. Please request a new code." });
    }

    const isCodeValid = await bcrypt.compare(sanitizedCode, user.twoFactorCodeHash);
    if (!isCodeValid) {
      return res.status(401).json({ error: "Incorrect 6-digit verification code." });
    }

    user.twoFactorEnabled = true;
    user.twoFactorCodeHash = null;
    user.twoFactorCodeExpires = null;
    user.twoFactorPurpose = null;
    await user.save();

    res.status(200).json({
      twoFactorEnabled: true,
      user: serializeUser(user),
      message: "Email Two-Factor Authentication is now enabled!"
    });
  } catch (error) {
    console.error("2FA Enable Verify Error:", error);
    res.status(500).json({ error: "Failed to verify 2FA setup code." });
  }
});

// --- ROUTE: DISABLE 2FA (From My Profile) ---
router.post('/2fa/disable', verifyToken, auditLogger(), async (req, res) => {
  try {
    const user = await findAuthenticatedUser(req);
    if (!user) return res.status(404).json({ error: "User not found." });

    user.twoFactorEnabled = false;
    user.twoFactorCodeHash = null;
    user.twoFactorCodeExpires = null;
    user.twoFactorPurpose = null;
    await user.save();

    res.status(200).json({
      twoFactorEnabled: false,
      user: serializeUser(user),
      message: "Email Two-Factor Authentication has been disabled."
    });
  } catch (error) {
    console.error("2FA Disable Error:", error);
    res.status(500).json({ error: "Failed to disable Two-Factor Authentication." });
  }
});

// --- ROUTE: CHANGE PASSWORD ---
router.put('/change-password', verifyToken, auditLogger(), async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await findAuthenticatedUser(req);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Prevent archived accounts from changing passwords
    if (user.isArchived) {
      return res.status(403).json({ error: "Account Archived: Cannot modify disabled accounts." });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required." });
    }

    if (String(newPassword).length < 8 || !/\S/.test(String(newPassword))) {
      return res.status(400).json({ error: "New password must be at least 8 characters and contain at least one non-whitespace character." });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) return res.status(401).json({ error: "Incorrect current password" });

    const newHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = newHash;
    await user.save();

    res.status(200).json({ message: "Password updated successfully!" });
  } catch (error) {
    console.error("Change Password Error:", error);
    res.status(500).json({ error: "Server error while changing password" });
  }
});

// --- ROUTE: FORGOT PASSWORD (SEND 6-DIGIT EMAIL OTP) ---
router.post('/forgot-password', async (req, res) => {
  try {
    const rawIdentifier = String(req.body.identifier || req.body.username || req.body.email || '').trim();
    if (!rawIdentifier) {
      return res.status(400).json({ error: "Please enter your System Username or registered Email Address." });
    }

    const escaped = rawIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await User.findOne({
      $or: [
        { username: rawIdentifier },
        { email: new RegExp(`^${escaped}$`, 'i') }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: "No account found matching that username or email address." });
    }

    if (user.isArchived) {
      return res.status(403).json({ error: "Account Archived: Please contact the system administrator for restoration." });
    }

    if (!user.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
      return res.status(400).json({
        error: "This account does not have a registered email address on file. Please contact the system administrator to reset your password."
      });
    }

    const otpCode = generateOtpCode();
    user.twoFactorCodeHash = await bcrypt.hash(otpCode, 10);
    user.twoFactorCodeExpires = new Date(Date.now() + OTP_EXPIRY_MS);
    user.twoFactorPurpose = 'reset';
    await user.save();

    const delivery = await sendTwoFactorOtp({
      toEmail: user.email,
      recipientName: user.name,
      otpCode,
      purpose: 'reset'
    });

    recordAuditEvent(req, res, {
      userId: user._id,
      username: user.username,
      userRole: user.role,
      actionType: 'WRITE',
      targetResource: '/api/auth/forgot-password [otp-sent]'
    });

    res.status(200).json({
      username: user.username,
      maskedEmail: maskEmail(user.email),
      deliveryMode: delivery.deliveryMode,
      message: `A 6-digit password reset code has been sent to ${maskEmail(user.email)}.`
    });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ error: "Failed to send password reset code." });
  }
});

// --- ROUTE: RESET PASSWORD WITH 6-DIGIT EMAIL OTP ---
router.post('/reset-password', async (req, res) => {
  try {
    const { username, code, newPassword } = req.body;
    const sanitizedCode = String(code || '').trim();

    if (!username || !/^\d{6}$/.test(sanitizedCode)) {
      return res.status(400).json({ error: "Please enter a valid 6-digit reset code." });
    }

    if (!newPassword || String(newPassword).length < 8 || !/\S/.test(String(newPassword))) {
      return res.status(400).json({
        error: "New password must be at least 8 characters and contain at least one non-whitespace character."
      });
    }

    const user = await User.findOne({ username });
    if (!user || user.isArchived) {
      return res.status(400).json({ error: "Invalid password reset request." });
    }

    if (
      user.twoFactorPurpose !== 'reset' ||
      !user.twoFactorCodeHash ||
      !user.twoFactorCodeExpires ||
      user.twoFactorCodeExpires.getTime() < Date.now()
    ) {
      return res.status(400).json({ error: "Reset code has expired. Please request a new code." });
    }

    const isCodeValid = await bcrypt.compare(sanitizedCode, user.twoFactorCodeHash);
    if (!isCodeValid) {
      recordAuditEvent(req, res, {
        userId: user._id,
        username: user.username,
        userRole: user.role,
        actionType: 'WRITE',
        targetResource: '/api/auth/reset-password [invalid-otp]'
      });
      return res.status(401).json({ error: "Incorrect 6-digit reset code." });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.twoFactorCodeHash = null;
    user.twoFactorCodeExpires = null;
    user.twoFactorPurpose = null;
    await user.save();

    recordAuditEvent(req, res, {
      userId: user._id,
      username: user.username,
      userRole: user.role,
      actionType: 'WRITE',
      targetResource: '/api/auth/reset-password [success]'
    });

    res.status(200).json({
      message: "Password reset successful! You can now sign in with your new password."
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ error: "Failed to reset password." });
  }
});

// --- WEBAUTHN / PASSKEY DEVICE MANAGEMENT ---
router.get('/webauthn/credentials', verifyToken, async (req, res) => {
  try {
    const user = await findAuthenticatedUser(req);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.status(200).json({
      credentials: serializePasskeys(user),
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      email: user.email || '',
      phoneNumber: user.phoneNumber || ''
    });
  } catch (error) {
    console.error("Fetch Passkeys Error:", error);
    res.status(500).json({ error: "Failed to load registered passkeys." });
  }
});

router.delete('/webauthn/credentials/:credentialId', verifyToken, auditLogger(), async (req, res) => {
  try {
    const targetCredId = decodeURIComponent(req.params.credentialId);

    const user = await findAuthenticatedUser(req);
    if (!user) return res.status(404).json({ error: "User not found" });

    const initialCount = user.webAuthnCredentials.length;
    user.webAuthnCredentials = user.webAuthnCredentials.filter(
      (cred) => cred.credentialID !== targetCredId
    );

    if (user.webAuthnCredentials.length === initialCount) {
      return res.status(404).json({ error: "Passkey not found." });
    }

    await user.save();

    res.status(200).json({
      message: "Passkey removed successfully.",
      credentials: serializePasskeys(user)
    });
  } catch (error) {
    console.error("Delete Passkey Error:", error);
    res.status(500).json({ error: "Failed to remove passkey." });
  }
});

// --- WEBAUTHN REGISTRATION ---
router.post('/webauthn/register/generate-options', verifyToken, async (req, res) => {
  try {
    const user = await findAuthenticatedUser(req);
    if (!user) return res.status(404).json({ error: "User not found" });

    // userID must be a Uint8Array
    const userID = new Uint8Array(Buffer.from(user._id.toString(), 'utf8'));
    const { rpID: activeRpID } = resolveWebAuthnConfig(req);

    const options = await generateRegistrationOptions({
      rpName,
      rpID: activeRpID,
      userID,
      userName: user.username,
      userDisplayName: user.name || user.username,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      excludeCredentials: user.webAuthnCredentials.map(cred => ({
        id: cred.credentialID,
        type: 'public-key',
        transports: cred.transports,
      })),
    });

    user.currentChallenge = options.challenge;
    await user.save();

    res.status(200).json(options);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate registration options" });
  }
});

router.post('/webauthn/register/verify', verifyToken, auditLogger(), async (req, res) => {
  const { response, deviceName } = req.body;
  try {
    const user = await findAuthenticatedUser(req);
    if (!user || !user.currentChallenge) return res.status(400).json({ error: "Invalid registration state" });

    const expectedChallenge = user.currentChallenge;
    const { rpID: activeRpID, expectedOrigin } = resolveWebAuthnConfig(req);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: activeRpID,
    });

    if (verification.verified) {
      const { registrationInfo } = verification;

      // Support both v9 and v10+ of @simplewebauthn/server
      const credentialID = registrationInfo.credential ? registrationInfo.credential.id : registrationInfo.credentialID;
      const credentialPublicKey = registrationInfo.credential ? registrationInfo.credential.publicKey : registrationInfo.credentialPublicKey;
      const counter = registrationInfo.credential ? registrationInfo.credential.counter : registrationInfo.counter;
      const resolvedDeviceName = String(deviceName || '').trim() || detectDeviceName(req.get('user-agent'));

      user.webAuthnCredentials.push({
        credentialID: typeof credentialID === 'string' ? credentialID : Buffer.from(credentialID).toString('base64url'),
        credentialPublicKey: Buffer.from(credentialPublicKey),
        counter,
        transports: Array.isArray(response?.response?.transports) ? response.response.transports : [],
        deviceName: resolvedDeviceName,
        createdAt: new Date()
      });
      user.currentChallenge = null;
      await user.save();

      res.status(200).json({
        verified: true,
        message: "Passkey registered successfully!",
        credentials: serializePasskeys(user)
      });
    } else {
      res.status(400).json({ verified: false, error: "Verification failed" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: `Failed to verify registration: ${error.message}` });
  }
});

// --- WEBAUTHN LOGIN (Supports both One-Tap Username-less Discoverable Passkeys & Username-scoped Passkeys) ---
router.post('/webauthn/login/generate-options', async (req, res) => {
  const trimmedUsername = String(req.body?.username || '').trim();
  try {
    const { rpID: activeRpID } = resolveWebAuthnConfig(req);
    let allowCredentials = undefined;
    let user = null;

    if (trimmedUsername) {
      user = await User.findOne({ username: trimmedUsername });
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.isArchived) {
        return res.status(403).json({ error: "Account Archived." });
      }
      if (!user.webAuthnCredentials || user.webAuthnCredentials.length === 0) {
        return res.status(400).json({ error: "No passkeys are registered for this username." });
      }
      allowCredentials = user.webAuthnCredentials.map(cred => ({
        id: cred.credentialID,
        type: 'public-key',
        transports: cred.transports,
      }));
    }

    const options = await generateAuthenticationOptions({
      rpID: activeRpID,
      ...(allowCredentials ? { allowCredentials } : {}),
      userVerification: 'preferred',
    });

    if (user) {
      user.currentChallenge = options.challenge;
      await user.save();
    }

    // Issue a short-lived signed challenge token so One-Tap username-less passkeys can verify statelessly
    const challengeToken = await new SignJWT({
      challenge: options.challenge,
      purpose: 'webauthn-login'
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret);

    res.status(200).json({
      ...options,
      challengeToken
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate authentication options" });
  }
});

router.post('/webauthn/login/verify', async (req, res) => {
  const { username, response, challengeToken } = req.body;
  try {
    const credIDBase64Url = response?.id;
    if (!credIDBase64Url) {
      return res.status(400).json({ error: "Missing passkey credential ID." });
    }

    // Resolve user either by the returned credentialID (One-Tap username-less) or by username
    let user = await User.findOne({ 'webAuthnCredentials.credentialID': credIDBase64Url });
    if (!user && username) {
      user = await User.findOne({ username: String(username).trim() });
    }

    if (!user) {
      return res.status(400).json({ error: "This passkey is not registered with any account on this site." });
    }

    if (user.isArchived) {
      recordAuditEvent(req, res, { userId: user._id, username: user.username, userRole: user.role, actionType: 'LOGIN', targetResource: '/api/auth/webauthn/login/verify [archived-blocked]' });
      return res.status(403).json({
        error: "Account Archived: This account has been disabled. Please contact the system administrator for restoration."
      });
    }

    let expectedChallenge = user.currentChallenge;
    if (challengeToken) {
      try {
        const { payload } = await jwtVerify(challengeToken, secret);
        if (payload?.purpose === 'webauthn-login' && payload?.challenge) {
          expectedChallenge = payload.challenge;
        }
      } catch {
        // Fallback to user.currentChallenge if token expired or invalid
      }
    }

    if (!expectedChallenge) {
      return res.status(400).json({ error: "Passkey login session expired. Please try again." });
    }

    // Find the requested credential
    const authenticator = user.webAuthnCredentials.find(cred => cred.credentialID === credIDBase64Url);
    if (!authenticator) {
      return res.status(400).json({ error: "Authenticator is not registered with this account." });
    }

    const { rpID: activeRpID, expectedOrigin } = resolveWebAuthnConfig(req);

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: activeRpID,
      credential: {
        id: authenticator.credentialID,
        publicKey: new Uint8Array(authenticator.credentialPublicKey),
        counter: authenticator.counter,
        transports: authenticator.transports,
      },
    });

    if (verification.verified) {
      const { authenticationInfo } = verification;

      // Update counter & lastUsedAt timestamp
      authenticator.counter = authenticationInfo.newCounter;
      authenticator.lastUsedAt = new Date();
      user.currentChallenge = null;
      await user.save();

      // Issue JWT like standard login and record biometric sign-in
      recordAuditEvent(req, res, { userId: user._id, username: user.username, userRole: user.role, actionType: 'LOGIN', targetResource: '/api/auth/webauthn/login/verify [method:webauthn]' });
      const token = await new SignJWT({
        id: user._id.toString(),
        username: user.username,
        role: user.role,
        amr: ['webauthn']
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h') // Token expires in 24 hours
        .sign(secret);

      res.status(200).json({
        message: "Passkey login successful",
        token: token,
        user: serializeUser(user)
      });
    } else {
      recordAuditEvent(req, res, { userId: user._id, username: user.username, userRole: user.role, actionType: 'LOGIN', targetResource: '/api/auth/webauthn/login/verify [failed]' });
      res.status(400).json({ error: "Verification failed" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: `Failed to verify authentication: ${error.message}` });
  }
});

module.exports = router;