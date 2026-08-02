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
        },
        anomalyReasoning: {
          type: SchemaType.STRING,
          description: "Detailed explanation of why the layoutAnomalyScore was given, listing specific visual anomalies, font mismatches, or layout issues found."
        }
      },
      required: ["issuer", "topic", "date", "layoutAnomalyScore", "anomalyReasoning"]
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

    // Normalize missing or empty fields to prevent failure on partial extraction
    extractedData.issuer = (extractedData.issuer && extractedData.issuer.trim() !== "") ? extractedData.issuer.trim() : "Not specified";
    extractedData.topic = (extractedData.topic && extractedData.topic.trim() !== "") ? extractedData.topic.trim() : "Not specified";
    extractedData.date = (extractedData.date && extractedData.date.trim() !== "") ? extractedData.date.trim() : "Not specified";

    // Only terminate if BOTH the issuer and topic are entirely missing
    if (extractedData.issuer === "Not specified" && extractedData.topic === "Not specified") {
      return res.status(422).json({
        error: "Failed to extract core certificate identity. Both issuer and topic are missing. The document is illegible.",
        extractedData
      });
    }

    const category = req.body.category;
    if (category === "Contract") {
      return res.status(200).json({
        layoutAnomalyScore: extractedData.layoutAnomalyScore,
        isValid: null,
        referenceUrls: [],
        extractedData: {
          issuer: extractedData.issuer,
          topic: extractedData.topic,
          date: extractedData.date
        }
      });
    }

    if (extractedData.issuer === "Not specified" || extractedData.topic === "Not specified") {
      return res.status(200).json({
        layoutAnomalyScore: extractedData.layoutAnomalyScore,
        isValid: null,
        referenceUrls: [],
        extractedData: {
          issuer: extractedData.issuer,
          topic: extractedData.topic,
          date: extractedData.date
        }
      });
    }

    // Stage 2: Grounding Validation (Custom Pipeline)
    const searchQuery = `"${extractedData.issuer}" "${extractedData.topic}" ${extractedData.date} event seminar verification`;

    let searchSnippets = [];
    let searchUrls = [];

    try {
      const searchResponse = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: searchQuery,
          search_depth: "basic",
          include_answer: false,
          max_results: 5
        })
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData && searchData.results) {
          searchSnippets = searchData.results.map(r => r.content);
          searchUrls = searchData.results.map(r => r.url);
        }
      } else {
        return res.status(502).json({ error: "External verification search failed. Please verify API key configuration." });
      }
    } catch (searchError) {
      return res.status(502).json({ error: "External verification search failed. Please verify API key configuration." });
    }

    const validationPrompt = `Verify if the following event actually took place:
    Topic/Event Name: ${extractedData.topic}
    Issuer/Organizer: ${extractedData.issuer}
    Date: ${extractedData.date}
    
    Here is the retrieved context from the web regarding this event:
    ${searchSnippets.length > 0 ? searchSnippets.join('\n\n') : "No search context available."}

    Available Reference URLs:
    ${searchUrls.length > 0 ? searchUrls.join('\n') : "No URLs available."}
    
    Based on the provided context, did this event or seminar likely occur as described? Set "isValid" to true or false.
    Provide an array of strings in "referenceUrls" containing any URLs you used to verify from the provided list.
    
    Return ONLY a valid JSON object. Do not use markdown.
    Example format: {"isValid": true, "reasoning": "Clear explanation of why the web context confirms or fails to confirm the event.", "referenceUrls": ["https://example.com"]}`;

    const validationModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    let validationResult;
    try {
      validationResult = await validationModel.generateContent(validationPrompt);
    } catch (apiError) {
      console.error("Gemini Validation Error:", apiError);
      return res.status(500).json({ error: "Failed to validate event via search grounding. Error: " + apiError.message });
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
      anomalyReasoning: extractedData.anomalyReasoning || "No anomalies detected.",
      isValid: validationData.isValid,
      groundingReasoning: validationData.reasoning || "No search context available.",
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
