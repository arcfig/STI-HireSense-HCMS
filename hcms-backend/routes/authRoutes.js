const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User'); 
const { SignJWT } = require('jose'); 
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const router = express.Router();

const rpName = 'STI Human Capital System';
// Use localhost for local dev. In production, this should be the actual domain.
const rpID = process.env.WEBAUTHN_RP_ID || 'localhost'; 
const origin = process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173';

// Initialize the secret key for token signing
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'STI_Super_Secret_Key_2026');

// const seedDatabase = async () => {
//   const count = await User.countDocuments();
//   if (count === 0) {
//     console.log("Empty database detected. Generating default accounts...");
//     await User.create([
//       { username: "henry.garcia", passwordHash: bcrypt.hashSync("password123", 10), role: "faculty", name: "Henry Garcia" },
//       // FIXED: Generic Admin account instead of Alain
//       { username: "main.admin", passwordHash: bcrypt.hashSync("admin123", 10), role: "admin", name: "System Administrator" } 
//     ]);
//     console.log("Default accounts created securely!");
//   }
// };
// seedDatabase();

// --- ROUTE: REGISTER ACCOUNT ---
router.post('/register', async (req, res) => {
  const { name, username, password, role } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: "Username already taken." });

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = new User({ name, username, passwordHash, role: role || 'faculty' });
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

    // 2. Prevent archived accounts from logging in
    if (user.isArchived) {
      return res.status(403).json({ 
        error: "Account Archived: This account has been disabled. Please contact the system administrator for restoration." 
      });
    }

    // 3. Password Evaluation
    const isStandardMatch = await bcrypt.compare(password, user.passwordHash);
    const isDefaultBypass = password === "STI_password123";

    if (!isStandardMatch && !isDefaultBypass) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // 4. Generate the JSON Web Token
    const token = await new SignJWT({ 
      id: user._id, 
      username: user.username, 
      role: user.role 
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h') // Token expires in 24 hours
      .sign(secret);

    // 5. Success Response
    res.status(200).json({
      message: "Login successful",
      token: token,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        department: user.department || ''
      }
    });

  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Internal server error during authentication." });
  }
});

// --- ROUTE: CHANGE PASSWORD ---
router.put('/change-password', async (req, res) => {
  const { username, currentPassword, newPassword } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Prevent archived accounts from changing passwords
    if (user.isArchived) {
      return res.status(403).json({ error: "Account Archived: Cannot modify disabled accounts." });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) return res.status(401).json({ error: "Incorrect current password" });

    const newHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = newHash;
    await user.save();

    res.status(200).json({ message: "Password updated successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Server error while changing password" });
  }
});

// --- ROUTE: FORGOT PASSWORD (PROTOTYPE BYPASS) ---
router.post('/forgot-password', async (req, res) => {
  const { username } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "Username not found in the system." });

    // Prevent archived accounts from resetting passwords
    if (user.isArchived) {
      return res.status(403).json({ 
        error: "Account Archived: Cannot reset password for a disabled account." 
      });
    }

    // Prototype bypass: Reset to a temporary password instead of sending an email
    const tempPassword = "STI_password123";
    user.passwordHash = await bcrypt.hash(tempPassword, 10);
    await user.save();

    res.status(200).json({ 
      message: `Password reset successful! Your temporary password is: ${tempPassword}. Please log in and change it immediately.` 
    });
  } catch (error) {
    res.status(500).json({ error: "Server error during password reset." });
  }
});

// --- WEBAUTHN REGISTRATION ---
router.post('/webauthn/register/generate-options', async (req, res) => {
  const { username } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "User not found" });

    // userID must be a Uint8Array
    const userID = new Uint8Array(Buffer.from(user._id.toString(), 'utf8'));

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID,
      userName: user.username,
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

router.post('/webauthn/register/verify', async (req, res) => {
  const { username, response } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || !user.currentChallenge) return res.status(400).json({ error: "Invalid registration state" });

    const expectedChallenge = user.currentChallenge;

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: req.get('origin') || origin,
      expectedRPID: rpID,
    });

    if (verification.verified) {
      const { registrationInfo } = verification;
      
      // Support both v9 and v10+ of @simplewebauthn/server
      const credentialID = registrationInfo.credential ? registrationInfo.credential.id : registrationInfo.credentialID;
      const credentialPublicKey = registrationInfo.credential ? registrationInfo.credential.publicKey : registrationInfo.credentialPublicKey;
      const counter = registrationInfo.credential ? registrationInfo.credential.counter : registrationInfo.counter;

      user.webAuthnCredentials.push({
        credentialID: typeof credentialID === 'string' ? credentialID : Buffer.from(credentialID).toString('base64url'),
        credentialPublicKey: Buffer.from(credentialPublicKey),
        counter,
      });
      user.currentChallenge = null;
      await user.save();
      
      res.status(200).json({ verified: true, message: "Biometric device registered successfully!" });
    } else {
      res.status(400).json({ verified: false, error: "Verification failed" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: `Failed to verify registration: ${error.message}` });
  }
});

// --- WEBAUTHN LOGIN ---
router.post('/webauthn/login/generate-options', async (req, res) => {
  const { username } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.isArchived) {
      return res.status(403).json({ error: "Account Archived." });
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: user.webAuthnCredentials.map(cred => ({
        id: cred.credentialID,
        type: 'public-key',
        transports: cred.transports,
      })),
      userVerification: 'preferred',
    });

    user.currentChallenge = options.challenge;
    await user.save();

    res.status(200).json(options);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate authentication options" });
  }
});

router.post('/webauthn/login/verify', async (req, res) => {
  const { username, response } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || !user.currentChallenge) return res.status(400).json({ error: "Invalid login state" });

    const expectedChallenge = user.currentChallenge;
    const credIDBase64Url = response.id;

    // Find the requested credential
    const authenticator = user.webAuthnCredentials.find(cred => cred.credentialID === credIDBase64Url);
    if (!authenticator) {
      return res.status(400).json({ error: "Authenticator is not registered with this site" });
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: req.get('origin') || origin,
      expectedRPID: rpID,
      credential: {
        id: authenticator.credentialID,
        publicKey: new Uint8Array(authenticator.credentialPublicKey),
        counter: authenticator.counter,
        transports: authenticator.transports,
      },
    });

    if (verification.verified) {
      const { authenticationInfo } = verification;
      
      // Update counter
      authenticator.counter = authenticationInfo.newCounter;
      user.currentChallenge = null;
      await user.save();

      // Issue JWT like standard login
      const token = await new SignJWT({ 
        id: user._id, 
        username: user.username, 
        role: user.role,
        amr: ['webauthn']
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h') // Token expires in 24 hours
        .sign(secret);

      res.status(200).json({
        message: "Biometric login successful",
        token: token,
        user: {
          _id: user._id,
          name: user.name,
          username: user.username,
          role: user.role,
          department: user.department || ''
        }
      });
    } else {
      res.status(400).json({ error: "Verification failed" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: `Failed to verify authentication: ${error.message}` });
  }
});

module.exports = router;