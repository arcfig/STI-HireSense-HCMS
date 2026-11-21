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
const validator = require('ph-id-validator');
const ExcelJS = require('exceljs');

// 1. Import the new jose JWT middleware
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { auditLogger } = require('../middleware/auditLogger');

// --------------------------------------------------------
// ROUTE: AI Document Extraction (Auto-Fill) (Public for Sign-Up Fast-Track & Authenticated Uploads)
// --------------------------------------------------------
router.post('/extract', auditLogger(), upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No document provided for extraction." });
    }

    const b64 = Buffer.from(req.file.buffer).toString("base64");
    const filePart = { inlineData: { data: b64, mimeType: req.file.mimetype } };

    const prompt = `You are a highly accurate HR data extraction AI. Read the attached document.
    
    TASK 1: CLASSIFICATION
    Determine the exact document type. You MUST select strictly from one of these seven options:
    "201 File", "Certificate", "Faculty Evaluation", "Contract", "Letter of Intent", "Non-Renewal Contract", "Identification".
    
    TASK 2: STANDARD EXTRACTION
    Extract the person's first name, last name, the exact title of the document, and infer their academic department (MUST be the closest match from: "Information Technology", "General Education", or "Tourism & Hospitality").
    Also extract the "dateReceived" (YYYY-MM-DD), the "expirationDate" (YYYY-MM-DD, leave blank if none), and the "issuingInstitution".
    
    TASK 3: DYNAMIC METRICS
    - If the document is a "Faculty Evaluation", extract the "academicYear" (e.g., "SY 2025-2026"), "term" (e.g., "Term 1"), and the final overall "evaluationRating" as a number (e.g., 4.35).
    - If the document is an "Identification", extract the "idType" (MUST be one of: "Driver's License", "SSS", "TIN", "Pag-IBIG", "PhilHealth", "Passport", "Postal", "UMID", "PRC", "Other") and the "idNumber". You MUST extract the "idNumber" EXACTLY as printed on the card (e.g., "123-456-789-000" or "33-1234567-8"). DO NOT leave it blank if a number is visible.
    
    STRICT INSTRUCTION REGARDING SKILLS/TAGS:
    - ONLY extract a comma-separated string of key skills, technologies, or degree majors (e.g., if it's a Computer Science diploma, extract "Computer Science") if the document is classified as a "Certificate".
    - For ALL other document types (201 File, Contract, Evaluation, LOI, Identification), the "tags" field MUST be an empty string ("").
    
    You MUST return ONLY a valid JSON object. Do not use markdown.
    Example JSON response if it is an Identification: {"firstName": "Mia", "lastName": "Dela Cruz", "documentType": "Identification", "documentTitle": "Tax Identification Number ID", "department": "Information Technology", "dateReceived": "2026-01-26", "expirationDate": "", "issuingInstitution": "Bureau of Internal Revenue", "academicYear": "", "term": "", "evaluationRating": null, "idType": "TIN", "idNumber": "123-456-789-000", "tags": ""}`;
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    let result;
    let retries = 3;

    while (retries > 0) {
      try {
        result = await model.generateContent([prompt, filePart]);
        break;
      } catch (apiError) {
        if (apiError.status === 503 && retries > 1) {
          console.warn(`[Extraction API 503] Server overloaded. Retrying... (${retries - 1} attempts left)`);
          await delay(2500);
          retries--;
        } else {
          throw apiError;
        }
      }
    }

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
// ROUTE: Get all 'Pending' profiles (Secured: Admins and Heads Only)
// --------------------------------------------------------
router.get('/pending', verifyToken, auditLogger(), requireRole(['admin', 'academic_head', 'program_head']), async (req, res) => {
  try {
    const pendingProfiles = await Faculty.find({ status: 'pending' }).sort({ createdAt: -1 });
    res.status(200).json(pendingProfiles);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending profiles" });
  }
});

// --------------------------------------------------------
// ROUTE: Fetch ONLY Approved Profiles (Secured: All logged-in users)
// --------------------------------------------------------
router.get('/approved', verifyToken, auditLogger(), async (req, res) => {
  try {
    const activeUsers = await User.find({ isArchived: { $ne: true } });
    const activeUserNames = activeUsers.map(u => u.name.toLowerCase());

    const approvedProfiles = await Faculty.find({ status: 'approved' }).sort({ createdAt: -1 });

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
// ROUTE: Fetch Logged-In Faculty's Own Submissions (Pending, Approved, Rejected)
// --------------------------------------------------------
router.get('/my-submissions', verifyToken, auditLogger(), async (req, res) => {
  try {
    const username = req.user?.username;
    const rawId = req.user?.id || req.user?._id;
    let currentUser = null;

    if (typeof rawId === 'string' && /^[a-f\d]{24}$/i.test(rawId)) {
      currentUser = await User.findById(rawId);
    }
    if (!currentUser && username) {
      currentUser = await User.findOne({ username });
    }
    if (!currentUser) {
      return res.status(404).json({ error: "User not found." });
    }

    const normalizedTarget = String(currentUser.name || '').toLowerCase().replace(/\s+/g, '');
    const allDocs = await Faculty.find().sort({ createdAt: -1 });
    const mySubmissions = allDocs.filter((doc) => {
      const fullName = `${doc.firstName || ''} ${doc.lastName || ''}`.toLowerCase().replace(/\s+/g, '');
      return fullName === normalizedTarget;
    });

    res.status(200).json(mySubmissions);
  } catch (error) {
    console.error("Error fetching user submissions:", error);
    res.status(500).json({ error: "Failed to fetch your credential submissions." });
  }
});

// --------------------------------------------------------
// ROUTE: Update Profile Status & Trigger Notification (Secured: Admins and Heads)
// --------------------------------------------------------
router.put('/status/:id', verifyToken, auditLogger(), requireRole(['admin', 'academic_head', 'program_head']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    const facultyToUpdate = await Faculty.findById(id);
    if (!facultyToUpdate) return res.status(404).json({ error: "Document not found." });

    let updateFields = { status: status, remarks: remarks || '' };

    const updatedFaculty = await Faculty.findByIdAndUpdate(
      id,
      updateFields,
      { new: true }
    );

    if (!updatedFaculty) return res.status(404).json({ error: "Document not found." });

    const fullName = `${updatedFaculty.firstName} ${updatedFaculty.lastName}`;
    const targetUser = await User.findOne({ name: { $regex: new RegExp(`^${fullName}$`, 'i') } });

    if (targetUser) {
      targetUser.notifications.push({
        title: `Document ${status === 'approved' ? 'Approved' : 'Rejected'}`,
        message: `Your document "${updatedFaculty.documentTitle}" has been ${status}. ${remarks ? `HR Remarks: ${remarks}` : ''}`,
        type: status === 'approved' ? 'success' : 'danger'
      });
      await targetUser.save();
    }

    res.status(200).json({ message: `Profile marked as ${status}`, data: updatedFaculty });
  } catch (error) {
    console.error("Status Update Error:", error);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// --------------------------------------------------------
// ROUTE: Edit/Update an existing credential (Secured: Admins and Heads)
// --------------------------------------------------------
router.put('/edit/:id', verifyToken, auditLogger(), requireRole(['admin', 'academic_head', 'program_head']), async (req, res) => {
  try {
    const { firstName, lastName, department, documentTitle, documentType, tags, eligibleSubjects } = req.body;

    let updatedTags = tags;
    if (typeof tags === 'string') {
      updatedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
    }
    
    let updatedSubjects = eligibleSubjects;
    if (typeof eligibleSubjects === 'string') {
      updatedSubjects = eligibleSubjects.split(',').map(sub => sub.trim().toUpperCase()).filter(sub => sub !== '');
    } else if (Array.isArray(eligibleSubjects)) {
      updatedSubjects = eligibleSubjects.map(sub => String(sub).trim().toUpperCase()).filter(sub => sub !== '');
    }

    const updatedFaculty = await Faculty.findByIdAndUpdate(
      req.params.id,
      { firstName, lastName, department, documentTitle, documentType, tags: updatedTags, eligibleSubjects: updatedSubjects || [] },
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
// ROUTE: AI Candidate Matcher (Secured: Admins and Heads)
// --------------------------------------------------------
router.post('/match', verifyToken, auditLogger(), requireRole(['admin', 'academic_head', 'program_head']), async (req, res) => {
  try {
    const { requirements } = req.body;
    if (!requirements) return res.status(400).json({ error: "Please provide job requirements." });

    const User = require('../models/User');
    const [candidates, users] = await Promise.all([
      Faculty.find({ status: 'approved' }),
      User.find({ isArchived: { $ne: true } }, '-passwordHash')
    ]);

    if (candidates.length === 0) return res.status(404).json({ error: "No approved candidates found." });

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
      if (!matchedUser) return null;

      return {
        id: profile.id, name: profile.name, department: profile.department,
        skills: Array.from(profile.tags), skillRatings: matchedUser?.skillRatings || {}, documents: profile.documents
      };
    }).filter(Boolean);

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

    let matchResults;
    try {
      matchResults = JSON.parse(result.response.text());
    } catch (parseError) {
      console.error("Failed to parse Gemini JSON:", result.response.text());
      return res.status(500).json({ error: "AI returned an unparsable format." });
    }

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
// ROUTE: Create Profile + Cloudinary + AI Vision OCR (Secured: All logged-in users)
// --------------------------------------------------------
router.post('/add', verifyToken, auditLogger(), upload.single('document'), async (req, res) => {
  try {
    const { firstName, lastName, department, documentTitle, documentType, uploaderRole, autoValidate } = req.body;
    let fileUrl = "";

    if (req.file) {
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      let dataURI = "data:" + req.file.mimetype + ";base64," + b64;

      const cldRes = await cloudinary.uploader.upload(dataURI, {
        resource_type: "auto",
        folder: "HCMS_Certificates"
      });
      fileUrl = cldRes.secure_url;
    }

    let tagsArray = [];

    if (documentType === 'Certificate') {
      let aiInput = [];

      if (req.file) {
        const b64 = Buffer.from(req.file.buffer).toString("base64");
        const filePart = { inlineData: { data: b64, mimeType: req.file.mimetype } };
        const prompt = `You are a highly accurate HR data extraction AI. Read the attached document. Extract a list of key skills, certifications, and technologies. Return ONLY a JSON object containing a "tags" array of strings. Example: {"tags": ["Java", "Cloud Computing"]}`;

        aiInput = [prompt, filePart];
      } else {
        const prompt = `Generate exactly 3 professional skill tags for a faculty member in the ${department} department. Return ONLY a JSON object containing a "tags" array of strings.`;

        aiInput = [prompt];
      }

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { responseMimeType: "application/json" }
      });

      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      let result = null;
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
            console.error(`[AI Bypass] Gemini API failed: ${apiError.message}. Proceeding without secondary AI tags.`);
            break;
          }
        }
      }

      if (result) {
        try {
          const aiText = result.response.text();
          const parsedData = JSON.parse(aiText);
          tagsArray = parsedData.tags || [];
        } catch (parseError) {
          console.error("Failed to parse Gemini output in /add route:", parseError);
        }
      }
    }

    const finalStatus = (['hr', 'admin', 'academic_head', 'program_head'].includes(uploaderRole) && autoValidate === 'true') ? 'approved' : 'pending';

    // --- ID VALIDATION LOGIC ---
    if (documentType === 'Identification' && req.body.idNumber && req.body.idType) {
      let isValidFormat = true;
      const idNum = req.body.idNumber.trim();
      switch (req.body.idType) {
        case "Driver's License": isValidFormat = validator.isDriversLicense ? validator.isDriversLicense(idNum) : true; break;
        case "SSS": isValidFormat = validator.isSSSId ? validator.isSSSId(idNum) : true; break;
        case "TIN": isValidFormat = validator.isTinId ? validator.isTinId(idNum) : true; break;
        case "Pag-IBIG": isValidFormat = validator.isPagIbigLoyaltyCard ? validator.isPagIbigLoyaltyCard(idNum) : true; break;
        case "PhilHealth": isValidFormat = validator.isPhilhealthId ? validator.isPhilhealthId(idNum) : true; break;
        case "Passport": isValidFormat = validator.isPassport ? validator.isPassport(idNum) : true; break;
        case "Postal": isValidFormat = validator.isPostalId ? validator.isPostalId(idNum) : true; break;
        case "UMID": isValidFormat = validator.isUMID ? validator.isUMID(idNum) : true; break;
        case "PRC": isValidFormat = validator.isPRCId ? validator.isPRCId(idNum) : true; break;
        default: isValidFormat = true; // For 'Other'
      }
      
      if (!isValidFormat) {
        // Delete uploaded image from Cloudinary since we are rejecting
        if (fileUrl) {
          const publicIdMatch = fileUrl.match(/\/v\d+\/([^/]+\/[^.]+)\./);
          if (publicIdMatch) await cloudinary.uploader.destroy(publicIdMatch[1]).catch(e => console.error(e));
        }
        return res.status(400).json({ error: `Invalid format for ${req.body.idType}. Please correct the ID Number.` });
      }
    }
    // ---------------------------

    const firstWord = firstName.trim().split(/\s+/)[0];
    const lastWords = lastName.trim().split(/\s+/);
    const lastWord = lastWords[lastWords.length - 1];

    const nameRegex = new RegExp(`^${firstWord}\\b.*\\b${lastWord}$`, 'i');
    const existingUser = await User.findOne({ name: { $regex: nameRegex } });

    const fullName = `${firstName} ${lastName}`;

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

    let formattedTags = tagsArray;
    if (req.body.tags) {
      let frontendTags = [];
      if (typeof req.body.tags === 'string') {
        frontendTags = req.body.tags.split(',').map(tag => tag.trim()).filter(tag => tag !== "");
      } else if (Array.isArray(req.body.tags)) {
        frontendTags = req.body.tags;
      }
      formattedTags = [...new Set([...formattedTags, ...frontendTags])];
    }

    const newFaculty = new Faculty({
      firstName, lastName, department,
      documentTitle,
      documentType,
      issuingInstitution: req.body.issuingInstitution,
      dateReceived: req.body.dateReceived,
      expirationDate: req.body.expirationDate,
      documentUrl: fileUrl,
      tags: formattedTags,
      status: finalStatus,

      academicYear: req.body.academicYear || '',
      term: req.body.term || '',
      contractStart: req.body.contractStart || '',
      contractEnd: req.body.contractEnd || '',
      intent: req.body.intent || '',
      offenseType: req.body.offenseType || '',
      idType: req.body.idType || '',
      idNumber: req.body.idNumber || '',
      evaluationRating: req.body.evaluationRating ? parseFloat(req.body.evaluationRating) : null
    });

    const savedFaculty = await newFaculty.save();
    res.status(201).json({ message: "Profile & Document submitted!", data: savedFaculty });

  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: "Failed to process submission", details: error.message });
  }
});

// --------------------------------------------------------
// ROUTE: Get Subject Hierarchy (Secured: Admins and Heads)
// --------------------------------------------------------
router.get('/subjects/hierarchy', verifyToken, auditLogger(), requireRole(['admin', 'academic_head', 'program_head']), async (req, res) => {
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
// ROUTE: Export Curriculum Subjects (.xlsx or .csv) (Secured: Admins and Heads)
// --------------------------------------------------------
router.get('/subjects/export', verifyToken, auditLogger(), requireRole(['admin', 'academic_head', 'program_head']), async (req, res) => {
  try {
    const format = (req.query.format || 'xlsx').toLowerCase();
    const isTemplate = req.query.template === 'true';

    const subjects = isTemplate
      ? []
      : await Subject.find()
          .populate('programId', 'name')
          .populate('departmentId', 'name');

    let rows = subjects
      .filter(s => s.departmentId && s.programId)
      .map(s => ({
        department: s.departmentId.name,
        program: s.programId.name,
        courseCode: s.courseCode,
        subjectName: s.subjectName
      }))
      .sort((a, b) =>
        a.department.localeCompare(b.department) ||
        a.program.localeCompare(b.program) ||
        a.courseCode.localeCompare(b.courseCode)
      );

    if (rows.length === 0) {
      rows = [
        {
          department: 'Information Technology',
          program: 'BSIT',
          courseCode: 'IT1808',
          subjectName: 'Integrative Programming'
        },
        {
          department: 'Information Technology',
          program: 'BSCS',
          courseCode: 'CS1201',
          subjectName: 'Data Structures and Algorithms'
        }
      ];
    }

    if (format === 'csv') {
      const escapeCsv = (val) => {
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvLines = [
        'Department,Program,Course Code,Subject Name',
        ...rows.map(r => [r.department, r.program, r.courseCode, r.subjectName].map(escapeCsv).join(','))
      ];
      const csvBuffer = Buffer.from('\uFEFF' + csvLines.join('\r\n'), 'utf8');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${isTemplate ? 'HireSense_Curriculum_Template.csv' : 'HireSense_Curriculum_Subjects.csv'}"`
      );
      return res.status(200).send(csvBuffer);
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Curriculum Subjects');

    worksheet.columns = [
      { header: 'Department', key: 'department', width: 28 },
      { header: 'Program', key: 'program', width: 18 },
      { header: 'Course Code', key: 'courseCode', width: 18 },
      { header: 'Subject Name', key: 'subjectName', width: 42 }
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF08612F' }
    };

    rows.forEach(r => worksheet.addRow(r));

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${isTemplate ? 'HireSense_Curriculum_Template.xlsx' : 'HireSense_Curriculum_Subjects.xlsx'}"`
    );
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("Curriculum Export Error:", error);
    res.status(500).json({ error: "Failed to export curriculum subjects." });
  }
});

// --------------------------------------------------------
// ROUTE: Add or Update Single Subject (Secured: Admins and Heads)
// --------------------------------------------------------
router.post('/subjects/add', verifyToken, auditLogger(), requireRole(['admin', 'academic_head', 'program_head']), async (req, res) => {
  try {
    const { department, program, courseCode, subjectName } = req.body;
    if (!department?.trim() || !program?.trim() || !courseCode?.trim() || !subjectName?.trim()) {
      return res.status(400).json({ error: "Department, Program, Course Code, and Subject Name are all required." });
    }

    const cleanDept = department.trim();
    const cleanProg = program.trim().toUpperCase();
    const cleanCode = courseCode.trim().toUpperCase();
    const cleanName = subjectName.trim();

    const deptDoc = await Department.findOneAndUpdate(
      { name: cleanDept },
      { name: cleanDept },
      { upsert: true, new: true }
    );

    const progDoc = await Program.findOneAndUpdate(
      { name: cleanProg },
      { name: cleanProg, departmentId: deptDoc._id },
      { upsert: true, new: true }
    );

    const subjectDoc = await Subject.findOneAndUpdate(
      { courseCode: cleanCode },
      {
        courseCode: cleanCode,
        subjectName: cleanName,
        programId: progDoc._id,
        departmentId: deptDoc._id
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      message: `Subject ${cleanCode} (${cleanName}) saved to ${cleanProg}!`,
      subject: subjectDoc
    });
  } catch (error) {
    console.error("Add Subject Error:", error);
    res.status(500).json({ error: "Failed to save subject." });
  }
});

// --------------------------------------------------------
// ROUTE: Bulk Import Curriculum Subjects (.xlsx or .csv) (Secured: Admins and Heads)
// --------------------------------------------------------
router.post('/subjects/import', verifyToken, auditLogger(), requireRole(['admin', 'academic_head', 'program_head']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please attach an .xlsx or .csv curriculum file." });
    }

    const defaultDepartment = (req.body.defaultDepartment || 'Information Technology').trim();
    const defaultProgram = (req.body.defaultProgram || 'BSIT').trim().toUpperCase();
    const fileName = (req.file.originalname || '').toLowerCase();

    let rawRows = [];

    if (fileName.endsWith('.csv') || req.file.mimetype === 'text/csv') {
      const parseCsvLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (ch === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += ch;
          }
        }
        result.push(current.trim());
        return result;
      };

      const text = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      rawRows = lines.map(parseCsvLine);
    } else if (fileName.endsWith('.xlsx')) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(400).json({ error: "The uploaded Excel workbook contains no worksheets." });
      }

      const extractCellText = (cellVal) => {
        if (cellVal === null || cellVal === undefined) return '';
        if (typeof cellVal === 'object') {
          if (Array.isArray(cellVal.richText)) {
            return cellVal.richText.map(rt => rt.text).join('').trim();
          }
          if (cellVal.result !== undefined) return String(cellVal.result).trim();
          if (cellVal.text !== undefined) return String(cellVal.text).trim();
        }
        return String(cellVal).trim();
      };

      worksheet.eachRow({ includeEmpty: false }, (row) => {
        const rowValues = [];
        for (let c = 1; c <= Math.max(row.cellCount, 4); c++) {
          rowValues.push(extractCellText(row.getCell(c).value));
        }
        if (rowValues.some(v => v.length > 0)) {
          rawRows.push(rowValues);
        }
      });
    } else {
      return res.status(400).json({ error: "Unsupported file format. Please upload an .xlsx or .csv file." });
    }

    if (rawRows.length < 2) {
      return res.status(400).json({ error: "The uploaded file must include a header row and at least one subject row." });
    }

    // Flexible header detection
    const headerRow = rawRows[0].map(h => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
    let deptIdx = headerRow.findIndex(h => ['department', 'dept', 'departmentname', 'college', 'school'].includes(h));
    let progIdx = headerRow.findIndex(h => ['program', 'prog', 'programcode', 'programname', 'degree', 'course', 'curriculum', 'strand'].includes(h));
    let codeIdx = headerRow.findIndex(h => ['coursecode', 'subjectcode', 'code', 'subcode', 'courseid', 'courseno', 'subjectno'].includes(h));
    let nameIdx = headerRow.findIndex(h => ['subjectname', 'coursetitle', 'subjecttitle', 'descriptivetitle', 'title', 'description', 'subject', 'coursename', 'name'].includes(h));

    // Positional fallback if non-standard headers were used
    if (codeIdx === -1 && nameIdx === -1) {
      const colCount = rawRows[0].filter(Boolean).length;
      if (colCount >= 4) {
        deptIdx = 0; progIdx = 1; codeIdx = 2; nameIdx = 3;
      } else if (colCount === 3) {
        progIdx = 0; codeIdx = 1; nameIdx = 2;
      } else if (colCount === 2) {
        codeIdx = 0; nameIdx = 1;
      }
    }

    if (codeIdx === -1 || nameIdx === -1) {
      return res.status(400).json({
        error: "Could not locate 'Course Code' and 'Subject Name' columns. Please include headers such as Department, Program, Course Code, and Subject Name."
      });
    }

    const deptCache = new Map();
    const progCache = new Map();
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rawCode = (row[codeIdx] || '').trim().toUpperCase();
      const rawName = (row[nameIdx] || '').trim();

      if (!rawCode || !rawName) {
        skippedCount++;
        continue;
      }

      const rawDept = (deptIdx !== -1 && row[deptIdx] ? row[deptIdx].trim() : '') || defaultDepartment;
      const rawProg = ((progIdx !== -1 && row[progIdx] ? row[progIdx].trim() : '') || defaultProgram).toUpperCase();

      let deptDoc = deptCache.get(rawDept.toLowerCase());
      if (!deptDoc) {
        deptDoc = await Department.findOneAndUpdate(
          { name: rawDept },
          { name: rawDept },
          { upsert: true, new: true }
        );
        deptCache.set(rawDept.toLowerCase(), deptDoc);
      }

      const progKey = `${rawDept.toLowerCase()}::${rawProg.toLowerCase()}`;
      let progDoc = progCache.get(progKey);
      if (!progDoc) {
        progDoc = await Program.findOneAndUpdate(
          { name: rawProg },
          { name: rawProg, departmentId: deptDoc._id },
          { upsert: true, new: true }
        );
        progCache.set(progKey, progDoc);
      }

      const existingSub = await Subject.findOne({ courseCode: rawCode });
      if (existingSub) {
        existingSub.subjectName = rawName;
        existingSub.programId = progDoc._id;
        existingSub.departmentId = deptDoc._id;
        await existingSub.save();
        updatedCount++;
      } else {
        await Subject.create({
          courseCode: rawCode,
          subjectName: rawName,
          programId: progDoc._id,
          departmentId: deptDoc._id
        });
        createdCount++;
      }
    }

    res.status(200).json({
      message: `Curriculum import complete: ${createdCount} added, ${updatedCount} updated${skippedCount > 0 ? `, ${skippedCount} empty row(s) skipped` : ''}.`,
      totalProcessed: createdCount + updatedCount,
      createdCount,
      updatedCount,
      skippedCount
    });
  } catch (error) {
    console.error("Curriculum Import Error:", error);
    res.status(500).json({ error: "Failed to import curriculum file.", details: error.message });
  }
});

// --------------------------------------------------------
// ROUTE: Delete Subject by Course Code (Secured: Admins and Heads)
// --------------------------------------------------------
router.delete('/subjects/:courseCode', verifyToken, auditLogger(), requireRole(['admin', 'academic_head', 'program_head']), async (req, res) => {
  try {
    const courseCode = decodeURIComponent(req.params.courseCode).trim();
    const deleted = await Subject.findOneAndDelete({ courseCode });
    if (!deleted) {
      return res.status(404).json({ error: "Subject not found." });
    }
    res.status(200).json({ message: `Subject ${courseCode} removed from curriculum.` });
  } catch (error) {
    console.error("Delete Subject Error:", error);
    res.status(500).json({ error: "Failed to delete subject." });
  }
});

// --------------------------------------------------------
// ROUTE: Export Single Faculty 201 Portfolio as .XLSX (Secured: All logged-in users)
// --------------------------------------------------------
router.post('/portfolio/export-xlsx', verifyToken, auditLogger(), async (req, res) => {
  try {
    const {
      fullName = 'Faculty',
      department = 'Unassigned',
      overallRating = 'N/A',
      skills = [],
      eligibleSubjects = [],
      documents = []
    } = req.body || {};

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('201 Portfolio Dossier');

    sheet.columns = [
      { header: 'Document Type', key: 'documentType', width: 22 },
      { header: 'Document Title', key: 'documentTitle', width: 34 },
      { header: 'Issuing Institution', key: 'issuingInstitution', width: 28 },
      { header: 'Date Issued', key: 'issued', width: 16 },
      { header: 'Expiration Date', key: 'expires', width: 16 },
      { header: 'Academic Period', key: 'period', width: 18 },
      { header: 'Evaluation Rating', key: 'rating', width: 18 },
      { header: 'Verified Skills / Tags', key: 'tags', width: 34 }
    ];

    // Summary rows at top
    sheet.spliceRows(1, 0,
      ['HireSense — Official Faculty 201 Portfolio Dossier'],
      ['Faculty Name', fullName, 'Department', department],
      ['Evaluation Score', overallRating && Number(overallRating) > 0 ? `${overallRating} / 5.00` : 'N/A', 'Generated', new Date().toLocaleDateString()],
      ['Eligible Subjects', Array.isArray(eligibleSubjects) && eligibleSubjects.length > 0 ? eligibleSubjects.join(', ') : 'None'],
      ['Verified Skills', Array.isArray(skills) && skills.length > 0 ? skills.join(', ') : 'None'],
      []
    );

    sheet.getRow(1).font = { bold: true, size: 13, color: { argb: 'FF08612F' } };
    [2, 3, 4, 5].forEach(r => {
      sheet.getRow(r).getCell(1).font = { bold: true };
      sheet.getRow(r).getCell(3).font = { bold: true };
    });

    const headerRow = sheet.getRow(7);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF08612F' }
    };

    documents.forEach(doc => {
      const issued = doc.dateReceived
        ? String(doc.dateReceived).split('T')[0]
        : doc.createdAt
        ? new Date(doc.createdAt).toLocaleDateString()
        : 'N/A';
      const expires = doc.expirationDate ? String(doc.expirationDate).split('T')[0] : 'N/A';
      const period = [doc.academicYear, doc.term].filter(Boolean).join(' ') || 'N/A';
      const rating = doc.evaluationRating ?? 'N/A';
      const tags = Array.isArray(doc.tags) ? doc.tags.filter(Boolean).join(', ') : '';

      sheet.addRow({
        documentType: doc.documentType || '',
        documentTitle: doc.documentTitle || '',
        issuingInstitution: doc.issuingInstitution || 'N/A',
        issued,
        expires,
        period,
        rating,
        tags
      });
    });

    const safeName = String(fullName).trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="HireSense_Portfolio_${safeName}.xlsx"`);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("Portfolio XLSX Export Error:", error);
    res.status(500).json({ error: "Failed to export portfolio workbook." });
  }
});

// --------------------------------------------------------
// ROUTE: Export Faculty Directory Summary as .XLSX (Secured: All logged-in users)
// --------------------------------------------------------
router.post('/directory/export-xlsx', verifyToken, auditLogger(), async (req, res) => {
  try {
    const { facultyList = [] } = req.body || {};

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Faculty Directory');

    sheet.columns = [
      { header: 'Faculty Name', key: 'fullName', width: 28 },
      { header: 'Department', key: 'department', width: 26 },
      { header: 'Verified Credentials', key: 'documentCount', width: 22 },
      { header: 'Approved Subject Eligibilities', key: 'eligibleSubjects', width: 34 },
      { header: 'Verified Skills', key: 'tags', width: 42 }
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF08612F' }
    };

    facultyList.forEach(f => {
      sheet.addRow({
        fullName: f.fullName || '',
        department: f.department || '',
        documentCount: f.documentCount ?? 0,
        eligibleSubjects: Array.isArray(f.eligibleSubjects) ? f.eligibleSubjects.join(', ') : '',
        tags: Array.isArray(f.tags) ? f.tags.join(', ') : ''
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="HireSense_Faculty_Directory.xlsx"`);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("Directory XLSX Export Error:", error);
    res.status(500).json({ error: "Failed to export directory workbook." });
  }
});

// --------------------------------------------------------
// ROUTE: Get Eligible Faculty by Course Code (Secured: Admins and Heads)
// --------------------------------------------------------
router.get('/subjects/:courseCode/faculty', verifyToken, auditLogger(), requireRole(['admin', 'academic_head', 'program_head']), async (req, res) => {
  try {
    const { courseCode } = req.params;

    // Fetch all approved documents that grant eligibility for this course
    const eligibleDocs = await Faculty.find({
      eligibleSubjects: courseCode,
      status: 'approved'
    }).select('firstName lastName department tags');

    // Group by full name to ensure a faculty member only appears once,
    // even if they have multiple certificates for the same subject.
    const uniqueFacultyMap = new Map();
    
    eligibleDocs.forEach(doc => {
      const fullNameKey = `${doc.firstName} ${doc.lastName}`.toLowerCase().trim();
      if (!uniqueFacultyMap.has(fullNameKey)) {
        uniqueFacultyMap.set(fullNameKey, {
          firstName: doc.firstName,
          lastName: doc.lastName,
          department: doc.department
        });
      }
    });

    const uniqueFacultyArray = Array.from(uniqueFacultyMap.values());

    res.status(200).json(uniqueFacultyArray);
  } catch (error) {
    console.error("Eligibility Fetch Error:", error);
    res.status(500).json({ error: "Failed to retrieve eligible faculty." });
  }
});



// --------------------------------------------------------
// ROUTE: Fetch User Notifications (Secured: All logged-in users)
// --------------------------------------------------------
router.get('/notifications/:username', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: "User not found." });

    const sortedNotifications = user.notifications.sort((a, b) => b.date - a.date);
    res.status(200).json(sortedNotifications);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch notifications." });
  }
});

// --------------------------------------------------------
// ROUTE: Mark Notifications as Read (Secured: All logged-in users)
// --------------------------------------------------------
router.put('/notifications/:username/read', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: "User not found." });

    user.notifications.forEach(notif => notif.isRead = true);
    await user.save();

    res.status(200).json({ message: "Notifications marked as read." });
  } catch (error) {
    res.status(500).json({ error: "Failed to update notifications." });
  }
});

module.exports = router;