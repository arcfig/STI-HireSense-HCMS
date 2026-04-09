const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const express = require('express');
const router = express.Router();
const Faculty = require('../models/Faculty'); 
const { cloudinary, upload } = require('../config/cloudinary');
const User = require('../models/User'); 
const bcrypt = require('bcryptjs'); 

// --------------------------------------------------------
// ROUTE 2: AI Document Extraction (Auto-Fill)
// This ONLY reads the file and returns JSON. It does not save to the DB.
// --------------------------------------------------------
router.post('/extract', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No document provided for extraction." });
    }

    const b64 = Buffer.from(req.file.buffer).toString("base64");
    const filePart = { inlineData: { data: b64, mimeType: req.file.mimetype } };

    const prompt = `You are a highly accurate HR data extraction AI. Read the attached resume or certificate.
    Extract the person's first name, last name, the exact title of the document, and infer their academic department.
    Also extract the "dateReceived" (YYYY-MM-DD), the "expirationDate" (YYYY-MM-DD, leave blank if none), and the "issuingInstitution" (e.g., Cisco).
    
    STRICT INSTRUCTION REGARDING SKILLS/TAGS:
    - Extract a comma-separated string of key skills or technologies ONLY if explicitly mentioned or strongly implied by the text.
    - If absolutely no discerning information is present, or the document is blank/unreadable, the "tags" field MUST be an empty string ("").
    - DO NOT invent, assume, or hallucinate tags. 
    
    If you cannot find a specific piece of information, leave the string empty ("").
    Return ONLY a raw, valid JSON object with no formatting.
    Example format: {"firstName": "John", "lastName": "Doe", "documentTitle": "AWS Certified", "department": "Information Technology", "dateReceived": "2023-01-15", "issuingInstitution": "Amazon", "tags": "AWS, Cloud Architecture"}`;

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
// ROUTE 2: AI Document Extraction (Auto-Fill)
// --------------------------------------------------------
router.post('/extract', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No document provided for extraction." });
    }

    const b64 = Buffer.from(req.file.buffer).toString("base64");
    const filePart = { inlineData: { data: b64, mimeType: req.file.mimetype } };

    const prompt = `You are a highly accurate HR data extraction AI. Read the attached resume or certificate.
    Extract the person's first name, last name, the exact title of the document, and infer their academic department.
    Also extract the "dateReceived" (YYYY-MM-DD), the "expirationDate" (YYYY-MM-DD, leave blank if none), and the "issuingInstitution" (e.g., Cisco).
    
    STRICT INSTRUCTION REGARDING SKILLS/TAGS:
    - Extract a comma-separated string of key skills or technologies ONLY if explicitly mentioned or strongly implied by the text.
    - If absolutely no discerning information is present, or the document is blank/unreadable, the "tags" field MUST be an empty string ("").
    - DO NOT invent, assume, or hallucinate tags. 
    
    If you cannot find a specific piece of information, leave the string empty ("").
    You MUST return ONLY a valid JSON object. Do not use markdown.
    Example format: {"firstName": "John", "lastName": "Doe", "documentTitle": "AWS Certified", "department": "Information Technology", "dateReceived": "2023-01-15", "issuingInstitution": "Amazon", "tags": "AWS, Cloud Architecture"}`;

    // 1. DEFENSE-PROOF FIX: Force application/json response type
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json"
      }
    });
    
    // 2. ENTERPRISE RETRY LOGIC
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    let result;
    let retries = 3; 

    while (retries > 0) {
      try {
        result = await model.generateContent([prompt, filePart]);
        break; // Success! Break the loop.
      } catch (apiError) {
        if (apiError.status === 503 && retries > 1) {
          console.warn(`[Extraction API 503] Server overloaded. Retrying... (${retries - 1} attempts left)`);
          await delay(2500); // Wait 2.5 seconds
          retries--;
        } else {
          throw apiError; // Out of retries or a different error
        }
      }
    }
    
    // 3. SAFE PARSING
    const rawText = result.response.text();
    let extractedData;
    
    try {
        extractedData = JSON.parse(rawText);
    } catch (parseError) {
        console.error("Failed to parse Gemini JSON:", rawText);
        return res.status(500).json({ error: "AI returned an unparsable format. Please try again." });
    }
    
    res.status(200).json(extractedData);

  } catch (error) {
    console.error("Extraction Error:", error);
    res.status(500).json({ error: "Failed to extract data from document due to server load. Please try again." });
  }
});

// --------------------------------------------------------
// ROUTE 2: Get all 'Pending' profiles for Head Roles (GET)
// --------------------------------------------------------
router.get('/pending', async (req, res) => {
  try {
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
    const { id } = req.params;     
    const { status } = req.body;   

    const updatedFaculty = await Faculty.findByIdAndUpdate(
      id, 
      { status: status }, 
      { new: true } 
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
    
    let updatedTags = tags;
    if (typeof tags === 'string') {
      updatedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
    }

    const updatedFaculty = await Faculty.findByIdAndUpdate(
      req.params.id,
      { firstName, lastName, department, documentTitle, documentType, tags: updatedTags },
      { returnDocument: 'after' } // <--- Replaces { new: true }
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
// ROUTE: AI Candidate Matcher (Aggregated by User)
// --------------------------------------------------------
router.post('/match', async (req, res) => {
  try {
    const { requirements } = req.body;
    if (!requirements) return res.status(400).json({ error: "Please provide job requirements." });

    const User = require('../models/User'); 
    const [candidates, users] = await Promise.all([
      Faculty.find({ status: 'approved' }),
      User.find({}, '-passwordHash')
    ]);

    if (candidates.length === 0) return res.status(404).json({ error: "No approved candidates found." });

    // 1. Aggregate candidate data
    const groupedProfiles = candidates.reduce((acc, doc) => {
      const nameKey = `${doc.firstName} ${doc.lastName}`.toUpperCase();
      if (!acc[nameKey]) {
        acc[nameKey] = {
          id: nameKey, name: `${doc.firstName} ${doc.lastName}`, department: doc.department,
          tags: new Set(), documents: []
        };
      }
      if (doc.tags) doc.tags.forEach(tag => acc[nameKey].tags.add(tag));
      if (doc.documentTitle) acc[nameKey].documents.push(doc.documentTitle);
      return acc;
    }, {});

    const candidateData = Object.values(groupedProfiles).map(profile => {
      const matchedUser = users.find(u => u.name.toLowerCase() === profile.name.toLowerCase());
      return {
        id: profile.id, name: profile.name, department: profile.department,
        skills: Array.from(profile.tags), skillRatings: matchedUser?.skillRatings || {}, documents: profile.documents
      };
    });

    const prompt = `You are an expert HR Candidate Matching AI.
    The HR Department needs a candidate with these requirements: "${requirements}"
    Here is the current pool of aggregated faculty profiles: ${JSON.stringify(candidateData)}
    Rank the best matches. Return ONLY a JSON array of objects formatted exactly like this:
    [{"id": "THE_ID_STRING", "score": 85, "reason": "1-2 short sentences explaining why."}]`;

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });
    
    // --- ENTERPRISE RETRY LOGIC ---
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    let result;
    let retries = 3; // Maximum number of attempts

    while (retries > 0) {
      try {
        result = await model.generateContent(prompt);
        break; // If successful, break out of the loop
      } catch (apiError) {
        if (apiError.status === 503 && retries > 1) {
          console.warn(`[API 503] Google server overloaded. Retrying... (${retries - 1} attempts left)`);
          await delay(2000); // Wait 2 seconds before hitting the API again
          retries--;
        } else {
          throw apiError; // If it's a different error, or we ran out of retries, throw it down to the main catch block
        }
      }
    }
    
    // Parse the strict JSON output
    let matchResults;
    try {
        matchResults = JSON.parse(result.response.text());
    } catch (parseError) {
        console.error("Failed to parse Gemini JSON:", result.response.text());
        return res.status(500).json({ error: "AI returned an unparsable format." });
    }
    
    // Map results back to the profiles
    const finalMatches = matchResults.map(match => {
      const profile = candidateData.find(c => c.id === match.id);
      if (!profile) return null;
      return { ...profile, matchScore: match.score, matchReason: match.reason };
    }).filter(m => m !== null && m.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore);

    res.status(200).json(finalMatches);

  } catch (error) {
    console.error("CRITICAL Backend Matching Error:", error);
    res.status(500).json({ error: "The AI matching engine is currently overloaded. Please try again in a few moments." });
  }
});

module.exports = router;