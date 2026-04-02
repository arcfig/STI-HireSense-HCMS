const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const express = require('express');
const router = express.Router();
const Faculty = require('../models/Faculty'); // Pulls in your blueprint
const { cloudinary, upload } = require('../config/cloudinary');
const User = require('../models/User'); // <-- Add this
const bcrypt = require('bcryptjs');     // <-- Add this

// --------------------------------------------------------
// ROUTE 2: AI Document Extraction (Auto-Fill)
// This ONLY reads the file and returns JSON. It does not save to the DB.
// --------------------------------------------------------
// --------------------------------------------------------
// ROUTE 2: AI Document Extraction (Auto-Fill)
// --------------------------------------------------------
router.post('/extract', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No document provided for extraction." });
    }

    const b64 = Buffer.from(req.file.buffer).toString("base64");
    const filePart = { inlineData: { data: b64, mimeType: req.file.mimetype } };

    // NEW: We specifically ask for the "documentTitle" in the prompt and example!
    const prompt = `You are a highly accurate HR data extraction AI. Read the attached resume or certificate.
    Extract the person's first name, last name, the exact title of the document, and infer their academic department. 
    Also extract the "dateReceived" (YYYY-MM-DD), the "expirationDate" (YYYY-MM-DD, leave blank if none), and the "issuingInstitution" (e.g., Cisco, Oracle, University Name).
    Generate exactly 3 professional skill tags based on the document.
    If you cannot find a specific piece of information, leave the string empty ("").
    Return ONLY a raw, valid JSON object with no formatting.
    Example format: {"firstName": "Henry", "lastName": "Garcia", "documentTitle": "AWS Certified Solutions Architect", "department": "Information Technology", "dateReceived": "2024-01-15", "expirationDate": "2027-01-15", "issuingInstitution": "Amazon Web Services", "tags": ["Cloud Architecture", "AWS", "Deployment"]}`;
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent([prompt, filePart]);
    
    let aiText = result.response.text().trim();
    aiText = aiText.replace(/```json/gi, '').replace(/```/gi, '').trim();
    
    const extractedData = JSON.parse(aiText);
    res.status(200).json(extractedData);

  } catch (error) {
    console.error("Extraction Error:", error);
    res.status(500).json({ error: "Failed to extract data from document." });
  }
});
// --------------------------------------------------------
// ROUTE 1: Create Profile + Cloudinary + AI Vision OCR (POST)
// --------------------------------------------------------
router.post('/add', upload.single('document'), async (req, res) => {
  try {
    // 1. Grab the new autoApprove variable
    const { firstName, lastName, department, documentTitle, documentType, uploaderRole, autoApprove } = req.body;
    let fileUrl = "";
    let aiInput = []; // This will hold what we send to Gemini

    // 1. If a file is attached, process it for Cloudinary AND Gemini
    if (req.file) {
      // --- CLOUDINARY UPLOAD ---
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      let dataURI = "data:" + req.file.mimetype + ";base64," + b64;
      
      const cldRes = await cloudinary.uploader.upload(dataURI, {
        resource_type: "auto",
        folder: "HCMS_Certificates"
      });
      fileUrl = cldRes.secure_url;

      // --- GEMINI VISION SETUP ---
      // We package the exact same file into a format Gemini can "see"
      const filePart = {
        inlineData: {
          data: b64,
          mimeType: req.file.mimetype
        }
      };

      const prompt = `You are an HR assistant evaluating a faculty member for the ${department} department. 
      Read the attached document. Based strictly on the skills, degrees, or certifications mentioned in this document, generate exactly 3 professional skill tags. 
      Return ONLY a raw, valid JSON array of strings. Do not use markdown blocks. Example: ["Java Programming", "Data Analysis", "Project Management"]`;

      aiInput = [prompt, filePart]; // Send BOTH the text instructions and the file
      
    } else {
      // Fallback: If they didn't upload a file, just guess based on the department like before
      const prompt = `You are an HR assistant for a university. 
      Generate exactly 3 professional skill tags for a faculty member in the ${department} department. 
      Return ONLY a raw, valid JSON array of strings. Do not use markdown blocks.`;
      
      aiInput = [prompt];
    }

    // 2. Ask Gemini to generate the tags!
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(aiInput);
    
    let aiText = result.response.text().trim();
    aiText = aiText.replace(/```json/gi, '').replace(/```/gi, '').trim();
    const tagsArray = JSON.parse(aiText);

    const finalStatus = (uploaderRole === 'hr' && autoApprove === 'true') ? 'approved' : 'pending';


   // --- FIXED: SHADOW PROVISIONING (Auto-Create Account) ---
    const fullName = `${firstName} ${lastName}`;
    
    // Case-insensitive search to see if this user already exists
    const existingUser = await User.findOne({ name: { $regex: new RegExp(`^${fullName}$`, 'i') } });
    
    if (!existingUser) {
      // Create a default username in ALL LOWERCASE: e.g., "henry.garcia"
      const baseUsername = `${firstName.toLowerCase().replace(/\s+/g, '')}.${lastName.toLowerCase().replace(/\s+/g, '')}`;
      
      // Ensure the username is unique
      let uniqueUsername = baseUsername;
      let counter = 1;
      while (await User.findOne({ username: uniqueUsername })) {
        uniqueUsername = `${baseUsername}${counter}`;
        counter++;
      }

      // Set the default password and hash it
      const defaultPassword = "STI_password123";
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      // Save the brand new account
      const newUser = new User({
        name: fullName,
        username: uniqueUsername,
        passwordHash: hashedPassword,
        role: 'faculty'
      });
      await newUser.save();
      console.log(`Auto-created account for ${fullName} with username: ${uniqueUsername}`);
    }
    // ------------------------------------------------------
    // ------------------------------------------------------

    // ... [Keep your existing finalStatus and new Faculty.save() logic below this] ...
    // 3. Save everything to MongoDB
    const newFaculty = new Faculty({
      firstName,
      lastName,
      department,
      documentTitle,
      documentType,
      tags: tagsArray,
      documentUrl: fileUrl,
      status: finalStatus
    });

    const savedFaculty = await newFaculty.save();
    res.status(201).json({ message: "Profile & Document submitted!", data: savedFaculty });

  } catch (error) {
    console.error("Upload/AI Error:", error);
    res.status(500).json({ error: "Failed to process submission", details: error.message });
  }
});

// --------------------------------------------------------
// ROUTE 2: Get all 'Pending' profiles for Head Roles (GET)
// --------------------------------------------------------
router.get('/pending', async (req, res) => {
  try {
    // Search the database for ONLY profiles where status is 'pending'
    const pendingProfiles = await Faculty.find({ status: 'pending' });
    res.status(200).json(pendingProfiles);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending profiles" });
  }
});

// --------------------------------------------------------
// ROUTE: Fetch ONLY Approved Profiles (For the Portfolio Page)
// --------------------------------------------------------
router.get('/approved', async (req, res) => {
  try {
    // We filter by status and sort by the newest uploads first
    const approvedProfiles = await Faculty.find({ status: 'approved' }).sort({ createdAt: -1 });
    res.status(200).json(approvedProfiles);
  } catch (error) {
    console.error("Error fetching approved profiles:", error);
    res.status(500).json({ error: "Failed to fetch portfolio data." });
  }
});

// --------------------------------------------------------
// ROUTE 3: Update Profile Status (PUT)
// --------------------------------------------------------
router.put('/status/:id', async (req, res) => {
  try {
    const { id } = req.params;     // Grabs the ID from the URL
    const { status } = req.body;   // Grabs the new status ('approved' or 'rejected')

    // Find the profile by ID and update its status
    const updatedFaculty = await Faculty.findByIdAndUpdate(
      id, 
      { status: status }, 
      { new: true } // Returns the updated document instead of the old one
    );

    res.status(200).json({ message: `Profile marked as ${status}`, data: updatedFaculty });
  } catch (error) {
    res.status(500).json({ error: "Failed to update status" });
  }
});

// --------------------------------------------------------
// ROUTE: Edit/Update an existing credential
// --------------------------------------------------------
router.put('/edit/:id', async (req, res) => {
  try {
    const { firstName, lastName, department, documentTitle, documentType, tags } = req.body;
    
    // If the frontend sends tags as a comma-separated string, convert it back into an array
    let updatedTags = tags;
    if (typeof tags === 'string') {
      updatedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
    }

    const updatedFaculty = await Faculty.findByIdAndUpdate(
      req.params.id,
      { firstName, lastName, department, documentTitle, documentType, tags: updatedTags },
      { returnDocument: 'after' } // <-- FIXED HERE!
    );

    if (!updatedFaculty) {
      return res.status(404).json({ error: "Document not found." });
    }

    res.status(200).json({ message: "Document updated successfully!", data: updatedFaculty });
  } catch (error) {
    console.error("Error updating document:", error);
    res.status(500).json({ error: "Failed to update the document." });
  }
});


// --------------------------------------------------------
// ROUTE: AI Candidate Matcher
// --------------------------------------------------------
// --------------------------------------------------------
// ROUTE: AI Candidate Matcher (Aggregated by User)
// --------------------------------------------------------
router.post('/match', async (req, res) => {
  try {
    const { requirements } = req.body;
    if (!requirements) return res.status(400).json({ error: "Please provide job requirements." });

    // 1. Fetch BOTH the approved documents AND the User accounts (for ratings)
    const User = require('../models/User'); // Ensure we can access the User model
    const [candidates, users] = await Promise.all([
      Faculty.find({ status: 'approved' }),
      User.find({}, '-passwordHash')
    ]);

    if (candidates.length === 0) return res.status(404).json({ error: "No approved candidates found." });

    // 2. Group all documents by the person's name (Case-Insensitive)
    const groupedProfiles = candidates.reduce((acc, doc) => {
      const nameKey = `${doc.firstName} ${doc.lastName}`.toUpperCase();
      
      if (!acc[nameKey]) {
        acc[nameKey] = {
          id: nameKey, // Use the uppercase name as the unique ID for the AI
          name: `${doc.firstName} ${doc.lastName}`,
          department: doc.department,
          tags: new Set(),
          documents: []
        };
      }
      
      // Combine all their tags and document titles
      doc.tags.forEach(tag => acc[nameKey].tags.add(tag));
      acc[nameKey].documents.push(doc.documentTitle);
      
      return acc;
    }, {});

    // 3. Attach their 1-5 Star Ratings and format for the AI
    const candidateData = Object.values(groupedProfiles).map(profile => {
      const matchedUser = users.find(u => u.name.toLowerCase() === profile.name.toLowerCase());
      return {
        id: profile.id,
        name: profile.name,
        department: profile.department,
        skills: Array.from(profile.tags),
        skillRatings: matchedUser?.skillRatings || {}, // Feed the 1-5 star ratings to Gemini!
        documents: profile.documents
      };
    });

    // 4. The Upgraded Prompt Architecture
    const prompt = `You are an expert HR Candidate Matching AI.
    The HR Department needs a candidate with these requirements: "${requirements}"
    
    Here is the current pool of aggregated faculty profiles (including their 1-5 star self-ratings for specific skills):
    ${JSON.stringify(candidateData)}

    Analyze the candidates' overall skills, ratings, and documents against the requirements. Rank the best matches.
    Return ONLY a raw JSON array of objects (no markdown, no backticks).
    Format exactly like this:
    [{"id": "THE_ID_STRING", "score": 85, "reason": "1-2 short sentences explaining why their overall profile matches."}]`;

    // 5. Ask Gemini to evaluate them
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    
    let aiText = result.response.text().trim();
    aiText = aiText.replace(/```json/gi, '').replace(/```/gi, '').trim();
    const matchResults = JSON.parse(aiText);
    
    // 6. Merge the AI's results back with the aggregated profile data
    const finalMatches = matchResults.map(match => {
      const profile = candidateData.find(c => c.id === match.id);
      if (!profile) return null;
      return { 
        ...profile, 
        matchScore: match.score, 
        matchReason: match.reason 
      };
    }).filter(m => m !== null && m.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore);

    res.status(200).json(finalMatches);

  } catch (error) {
    console.error("Matching Error:", error);
    res.status(500).json({ error: "AI matching engine failed to process." });
  }
});

module.exports = router;