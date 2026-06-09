const express = require('express');
const router = express.Router();
const multer = require('multer');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

// Strict file validation middleware
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF, JPG, and PNG are allowed."), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post('/', upload.single('certificate'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No certificate file provided." });
    }

    const b64 = Buffer.from(req.file.buffer).toString("base64");
    const filePart = { inlineData: { data: b64, mimeType: req.file.mimetype } };

    // Stage 1: Extraction & Anomaly Check
    const extractionPrompt = `You are an expert HR document analyzer. Read the attached certificate file.
    
    TASK 1: EXTRACTION
    Extract the variables "issuer", "topic", and "date" (format: YYYY-MM-DD or whatever is present).
    
    TASK 2: ANOMALY CHECK
    Perform a preliminary visual manipulation and layout anomaly check. Assign a "layoutAnomalyScore" between 0.0 and 1.0, where 1.0 means highly likely to be forged/manipulated.`;

    const responseSchema = {
      type: SchemaType.OBJECT,
      properties: {
        issuer: {
          type: SchemaType.STRING,
          description: "The issuer or organizer of the certificate/event"
        },
        topic: {
          type: SchemaType.STRING,
          description: "The topic or name of the event/seminar"
        },
        date: {
          type: SchemaType.STRING,
          description: "The date of the event in YYYY-MM-DD format, or whatever format is present"
        },
        layoutAnomalyScore: {
          type: SchemaType.NUMBER,
          description: "A score between 0.0 and 1.0 indicating preliminary visual manipulation and layout anomalies. 1.0 means highly likely to be manipulated."
        }
      },
      required: ["issuer", "topic", "date", "layoutAnomalyScore"]
    };

    const extractionModel = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    });

    let extractionResult;
    try {
      extractionResult = await extractionModel.generateContent([extractionPrompt, filePart]);
    } catch (apiError) {
      console.error("Gemini Extraction Error:", apiError);
      return res.status(500).json({ error: "Failed to process document via AI." });
    }

    const rawText = extractionResult.response.text();
    let extractedData;
    
    try {
      extractedData = JSON.parse(rawText);
    } catch (parseError) {
      console.error("Failed to parse Stage 1 JSON:", rawText);
      return res.status(500).json({ error: "AI returned an unparsable format." });
    }

    // Check if required fields exist
    // They must be present and not empty strings
    if (!extractedData.issuer || !extractedData.topic || !extractedData.date ||
        extractedData.issuer.trim() === "" || extractedData.topic.trim() === "" || extractedData.date.trim() === "") {
      return res.status(422).json({ 
        error: "Failed to extract required fields (issuer, topic, date). The document may not be a valid certificate or is illegible.",
        extractedData
      });
    }

    // Stage 2: Grounding Validation
    const validationPrompt = `Verify if the following event actually took place:
    Topic/Event Name: ${extractedData.topic}
    Issuer/Organizer: ${extractedData.issuer}
    Date: ${extractedData.date}
    
    Use Google Search to cross-reference these details.
    Did this event or seminar likely occur as described? Set "isValid" to true or false.
    Provide an array of strings in "referenceUrls" containing any URLs you used to verify.
    
    Return ONLY a valid JSON object. Do not use markdown.
    Example format: {"isValid": true, "referenceUrls": ["https://example.com"]}`;

    const validationModel = genAI.getGenerativeModel({ 
      model: "gemini-2.5-pro",
      tools: [{ googleSearchRetrieval: {} }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    let validationResult;
    try {
      validationResult = await validationModel.generateContent(validationPrompt);
    } catch (apiError) {
      console.error("Gemini Validation Error:", apiError);
      return res.status(500).json({ error: "Failed to validate event via search grounding." });
    }

    const valRawText = validationResult.response.text();
    let validationData;
    
    try {
      validationData = JSON.parse(valRawText);
    } catch (parseError) {
      console.error("Failed to parse Stage 2 JSON:", valRawText);
      return res.status(500).json({ error: "Validation AI returned an unparsable format." });
    }

    // Combine results
    const finalResponse = {
      layoutAnomalyScore: extractedData.layoutAnomalyScore,
      isValid: validationData.isValid,
      referenceUrls: validationData.referenceUrls || [],
      extractedData: {
        issuer: extractedData.issuer,
        topic: extractedData.topic,
        date: extractedData.date
      }
    };

    res.status(200).json(finalResponse);

  } catch (error) {
    if (error.message && error.message.includes("Invalid file type")) {
      return res.status(400).json({ error: error.message });
    }
    console.error("Certificate Verification Pipeline Error:", error);
    res.status(500).json({ error: "An unexpected error occurred during verification." });
  }
});

module.exports = router;
