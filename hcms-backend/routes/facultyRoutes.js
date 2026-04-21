const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const express = require('express');
const router = express.Router();
const Faculty = require('../models/Faculty'); 
const { cloudinary, upload } = require('../config/cloudinary');
const User = require('../models/User'); 
const bcrypt = require('bcryptjs'); 
const Department = require('../models/Department');
const Program = require('../models/Program');
const Subject = require('../models/Subject');

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
    Example format: {"firstName": "John", "lastName": "Doe", "documentTitle": "AWS Certified", "department": "Information Technology", "dateReceived": "2023-01-15", "expirationDate": "2026-01-15", "issuingInstitution": "Amazon", "tags": "AWS, Cloud Architecture"}`;
    
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
// ROUTE: Fetch ONLY Approved & Active Profiles (For Directory/Portfolio)
// --------------------------------------------------------
router.get('/approved', async (req, res) => {
  try {
    // 1. Fetch only ACTIVE users from the User collection
    const activeUsers = await User.find({ isArchived: { $ne: true } });
    const activeUserNames = activeUsers.map(u => u.name.toLowerCase());

    // 2. Fetch approved profiles from the Faculty collection
    const approvedProfiles = await Faculty.find({ status: 'approved' }).sort({ createdAt: -1 });

    // 3. SECURITY FILTER: Only return profiles that belong to active users
    const activeApprovedProfiles = approvedProfiles.filter(profile => {
      const fullName = `${profile.firstName} ${profile.lastName}`.toLowerCase();
      return activeUserNames.includes(fullName);
    });

    res.status(200).json(activeApprovedProfiles);
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
      { returnDocument: 'after' } 
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
// ROUTE: AI Candidate Matcher (Aggregated by Active User)
// --------------------------------------------------------
router.post('/match', async (req, res) => {
  try {
    const { requirements } = req.body;
    if (!requirements) return res.status(400).json({ error: "Please provide job requirements." });

    const User = require('../models/User'); 
    const [candidates, users] = await Promise.all([
      Faculty.find({ status: 'approved' }),
      // SECURITY FILTER: Only match against active users
      User.find({ isArchived: { $ne: true } }, '-passwordHash')
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
      
      // SECURITY FILTER: If they aren't in the active users list, skip them entirely
      if (!matchedUser) return null;

      return {
        id: profile.id, name: profile.name, department: profile.department,
        skills: Array.from(profile.tags), skillRatings: matchedUser?.skillRatings || {}, documents: profile.documents
      };
    }).filter(Boolean); // Remove the nulls

    if (candidateData.length === 0) return res.status(404).json({ error: "No active candidates available for matching." });

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
    let retries = 3; 

    while (retries > 0) {
      try {
        result = await model.generateContent(prompt);
        break; 
      } catch (apiError) {
        if (apiError.status === 503 && retries > 1) {
          console.warn(`[API 503] Google server overloaded. Retrying... (${retries - 1} attempts left)`);
          await delay(2000); 
          retries--;
        } else {
          throw apiError; 
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

// --------------------------------------------------------
// ROUTE 1: Create Profile + Cloudinary + AI Vision OCR (POST)
// --------------------------------------------------------
router.post('/add', upload.single('document'), async (req, res) => {
  try {
    const { firstName, lastName, department, documentTitle, documentType, uploaderRole, autoApprove } = req.body;
    let fileUrl = "";
    let aiInput = []; 

    // 1. Cloudinary Upload
    if (req.file) {
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      let dataURI = "data:" + req.file.mimetype + ";base64," + b64;
      
      const cldRes = await cloudinary.uploader.upload(dataURI, {
        resource_type: "auto",
        folder: "HCMS_Certificates"
      });
      fileUrl = cldRes.secure_url;

      // 2. Gemini Vision Setup
      const filePart = { inlineData: { data: b64, mimeType: req.file.mimetype } };

      const prompt = `You are a highly accurate HR data extraction AI. Read the attached STI document.
      Extract a list of key skills, certifications, and technologies ONLY if explicitly mentioned or strongly implied by the text.
      If absolutely no discerning information is present, return an empty array.
      You MUST return ONLY a JSON object containing a "tags" array of strings. Do not use markdown blocks. 
      Example: {"tags": ["Java", "Cloud Computing", "SAP"]}`;
    
      aiInput = [prompt, filePart]; 
      
    } else {
      const prompt = `You are an HR assistant for a university. 
      Generate exactly 3 professional skill tags for a faculty member in the ${department} department. 
      You MUST return ONLY a JSON object containing a "tags" array of strings.`;
      
      aiInput = [prompt];
    }

    // 3. DEFENSE-PROOF RETRY LOGIC FOR GEMINI
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });
    
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    let result;
    let retries = 3; 

    while (retries > 0) {
      try {
        result = await model.generateContent(aiInput);
        break;
      } catch (apiError) {
        if (apiError.status === 503 && retries > 1) {
          console.warn(`[Add API 503] Server overloaded. Retrying... (${retries - 1} attempts left)`);
          await delay(2500);
          retries--;
        } else {
          throw apiError; 
        }
      }
    }
    
    // 4. Safe Parsing
    let tagsArray = [];
    try {
      const aiText = result.response.text();
      const parsedData = JSON.parse(aiText);
      tagsArray = parsedData.tags || [];
    } catch (parseError) {
      console.error("Failed to parse Gemini output in /add route:", parseError);
    }

    // 5. Status & Shadow Provisioning
    const finalStatus = (['hr', 'admin'].includes(uploaderRole) && autoApprove === 'true') ? 'approved' : 'pending';

    const fullName = `${firstName} ${lastName}`;
    const existingUser = await User.findOne({ name: { $regex: new RegExp(`^${fullName}$`, 'i') } });
    
    if (!existingUser) {
      const baseUsername = `${firstName.toLowerCase().replace(/\s+/g, '')}.${lastName.toLowerCase().replace(/\s+/g, '')}`;
      let uniqueUsername = baseUsername;
      let counter = 1;
      while (await User.findOne({ username: uniqueUsername })) {
        uniqueUsername = `${baseUsername}${counter}`;
        counter++;
      }

      const defaultPassword = "STI_password123";
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      const newUser = new User({
        name: fullName, username: uniqueUsername, passwordHash: hashedPassword, role: 'faculty'
      });
      await newUser.save();
    }

    // Merge AI tags with any tags passed from the frontend extraction
    let formattedTags = tagsArray;
    if (req.body.tags) {
      let frontendTags = [];
      if (typeof req.body.tags === 'string') {
        frontendTags = req.body.tags.split(',').map(tag => tag.trim()).filter(tag => tag !== "");
      } else if (Array.isArray(req.body.tags)) {
        frontendTags = req.body.tags;
      }
      formattedTags = [...new Set([...formattedTags, ...frontendTags])]; // Deduplicate
    }

    // 6. Save to Database
    const newFaculty = new Faculty({
      firstName, lastName, department, 
      documentTitle, documentType, 
      issuingInstitution: req.body.issuingInstitution,
      dateReceived: req.body.dateReceived,
      documentUrl: fileUrl, 
      tags: formattedTags,
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
// ROUTE: Get Subject Hierarchy for Department Heads
// --------------------------------------------------------
router.get('/subjects/hierarchy', async (req, res) => {
  try {
    const subjects = await Subject.find()
      .populate('programId', 'name')
      .populate('departmentId', 'name');

    const hierarchy = subjects.reduce((acc, sub) => {
      if (!sub.departmentId || !sub.programId) return acc;

      const dept = sub.departmentId.name;
      const prog = sub.programId.name;

      if (!acc[dept]) acc[dept] = {};
      if (!acc[dept][prog]) acc[dept][prog] = [];
      
      acc[dept][prog].push({
        courseCode: sub.courseCode,
        subjectName: sub.subjectName
      });

      return acc;
    }, {});

    res.status(200).json(hierarchy);
  } catch (error) {
    console.error("Hierarchy Error:", error);
    res.status(500).json({ error: "Failed to retrieve subject hierarchy." });
  }
});

// --------------------------------------------------------
// ROUTE: Get Eligible Faculty by Course Code
// --------------------------------------------------------
router.get('/subjects/:courseCode/faculty', async (req, res) => {
  try {
    const { courseCode } = req.params;
    
    // Find faculty who are approved AND have this exact course code in their array
    const eligibleFaculty = await Faculty.find({ 
      eligibleSubjects: courseCode,
      status: 'approved' 
    }).select('firstName lastName department tags'); 

    res.status(200).json(eligibleFaculty);
  } catch (error) {
    console.error("Eligibility Fetch Error:", error);
    res.status(500).json({ error: "Failed to retrieve eligible faculty." });
  }
});

// --------------------------------------------------------
// TEMPORARY SEED ROUTE: Auto-populate the Database with BSIT Curriculum
// --------------------------------------------------------
router.get('/seed-subjects', async (req, res) => {
  try {
    // 1. HARD WIPE: Drop collections entirely to destroy old ghost indexes
    try { await Subject.collection.drop(); } catch (e) {} 
    try { await Program.collection.drop(); } catch (e) {}
    try { await Department.collection.drop(); } catch (e) {}

    // 2. Create Departments based on course prefixes
    const itDept = new Department({ name: "Information Technology" });
    const genEdDept = new Department({ name: "General Education" });
    const peDept = new Department({ name: "Physical Education" });
    const nstpDept = new Department({ name: "National Service Training" });

    await itDept.save();
    await genEdDept.save();
    await peDept.save();
    await nstpDept.save();

    // 3. Create the Program (Owned by IT)
    const bsitProg = new Program({ name: "BSIT", departmentId: itDept._id });
    await bsitProg.save();

    // 4. Define Subjects Mapping
    const subjectsData = [
      // Term 1
      { courseCode: "CITE1004", subjectName: "Introduction to Computing", deptId: itDept._id },
      { courseCode: "CITE1003", subjectName: "Computer Programming 1", deptId: itDept._id },
      { courseCode: "GEDC1002", subjectName: "The Contemporary World", deptId: genEdDept._id },
      { courseCode: "STIC1002", subjectName: "Euthenics 1", deptId: itDept._id },
      { courseCode: "GEDC1003", subjectName: "The Entrepreneurial Mind", deptId: genEdDept._id },
      { courseCode: "GEDC1005", subjectName: "Mathematics in the Modern World", deptId: genEdDept._id },
      { courseCode: "NSTP1008", subjectName: "National Service Training Program 1", deptId: nstpDept._id },
      { courseCode: "PHED1005", subjectName: "P.E./PATHFIT 1: Movement Competency Training", deptId: peDept._id },
      { courseCode: "GEDC1008", subjectName: "Understanding the Self", deptId: genEdDept._id },
      
      // Term 2
      { courseCode: "CITE1006", subjectName: "Computer Programming 2", deptId: itDept._id },
      { courseCode: "COSC1002", subjectName: "Discrete Structures 1 (Discrete Mathematics)", deptId: itDept._id },
      { courseCode: "GEDC1010", subjectName: "Art Appreciation", deptId: genEdDept._id },
      { courseCode: "GEDC1009", subjectName: "Ethics", deptId: genEdDept._id },
      { courseCode: "NSTP1010", subjectName: "National Service Training Program 2", deptId: nstpDept._id },
      { courseCode: "PHED1006", subjectName: "P.E./PATHFIT 2: Exercise-based Fitness Activities", deptId: peDept._id },
      { courseCode: "GEDC1016", subjectName: "Purposive Communication", deptId: genEdDept._id },
      { courseCode: "GEDC1013", subjectName: "Science, Technology, and Society", deptId: genEdDept._id },
      { courseCode: "INTE1006", subjectName: "Systems Administration and Maintenance", deptId: itDept._id }
    ];

    // 5. Save all subjects
    for (const sub of subjectsData) {
      const newSubject = new Subject({
        courseCode: sub.courseCode,
        subjectName: sub.subjectName,
        programId: bsitProg._id,
        departmentId: sub.deptId
      });
      await newSubject.save();
    }

    // 6. CLEAN SLATE: Remove all course eligibilities from everyone
    await Faculty.updateMany(
      {}, 
      { $set: { eligibleSubjects: [] } } 
    );

    res.status(200).json({ 
      message: "SUCCESS: Database seeded with BSIT Year 1 Curriculum." 
    });
  } catch (error) {
    console.error("Seeding Error:", error);
    res.status(500).json({ error: "Failed to seed database." });
  }
});

// --------------------------------------------------------
// TEMPORARY SEED ROUTE: Clean Slate Defense Accounts
// --------------------------------------------------------
router.get('/seed-users', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');

    // 1. HARD WIPE: Eradicate all existing users
    await User.deleteMany({});

    // 2. Prepare distinct hashed passwords
    const defaultHash = await bcrypt.hash("password123", 10);
    const adminHash = await bcrypt.hash("admin123", 10);

    // 3. Define the exact accounts requested
    const defenseUsers = [
      { name: "Faculty Demo", username: "faculty.demo", role: "faculty", passwordHash: defaultHash },
      { name: "Academic Head", username: "acad.head", role: "academic_head", passwordHash: defaultHash },
      { name: "Program Head", username: "prog.head", role: "program_head", passwordHash: defaultHash },
      { name: "System Admin", username: "admin.user", role: "admin", passwordHash: adminHash }
    ];

    // 4. Inject the clean slate users
    await User.insertMany(defenseUsers);

    res.status(200).json({ 
      message: "SUCCESS: Database users wiped and strictly reset to the 4 requested accounts." 
    });
  } catch (error) {
    console.error("User Seeding Error:", error);
    res.status(500).json({ error: "Failed to reset defense accounts." });
  }
});

// --------------------------------------------------------
// TEMPORARY ROUTE: Nuclear Wipe of Faculty Data
// --------------------------------------------------------
router.get('/wipe-faculty', async (req, res) => {
  try {
    // Drops the collection to clear all extracted profiles and ghost indexes
    try { await Faculty.collection.drop(); } catch (e) {} 
    
    res.status(200).json({ 
      message: "SUCCESS: Faculty directory is now completely empty. Ready for defense testing." 
    });
  } catch (error) {
    console.error("Faculty Wipe Error:", error);
    res.status(500).json({ error: "Failed to wipe faculty data." });
  }
});

module.exports = router;