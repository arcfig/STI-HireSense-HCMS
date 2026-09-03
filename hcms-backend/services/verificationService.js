const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const Faculty = require('../models/Faculty');
const User = require('../models/User');
const { PDFDocument } = require('pdf-lib');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const executeWithRetry = async (fn, retries = 3, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`Gemini API error, retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
};
// We keep a simple EventEmitter for SSE
const { EventEmitter } = require('events');
const verificationEmitter = new EventEmitter();

const processVerificationInBackground = async (facultyId, adminUsername) => {
  try {
    const faculty = await Faculty.findById(facultyId);
    if (!faculty) {
      console.error(`Verification Failed: Faculty document ${facultyId} not found.`);
      return;
    }

    if (!faculty.documentUrl) {
      await updateStatus(facultyId, 'failed', { error: 'No document URL found' }, adminUsername);
      return;
    }

    // 1. Fetch file from Cloudinary (or existing URL)
    let fileResponse;
    try {
      fileResponse = await fetch(faculty.documentUrl);
      if (!fileResponse.ok) throw new Error("Failed to fetch document file from URL.");
    } catch (e) {
      console.error("Fetch Error:", e);
      await updateStatus(facultyId, 'failed', { error: 'Failed to download document for verification.' }, adminUsername);
      return;
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = fileResponse.headers.get('content-type') || 'application/pdf';

    const b64 = buffer.toString("base64");
    const filePart = { inlineData: { data: b64, mimeType: contentType } };

    // --- PDF METADATA EXTRACTION ---
    let digitalMetadata = { hasDigitalMetadata: false };
    
    if (contentType.includes('application/pdf')) {
      try {
        const pdfDoc = await PDFDocument.load(buffer, { updateMetadata: false });
        
        const formatDate = (dateObj) => {
          if (!dateObj) return null;
          return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        };

        digitalMetadata = {
          hasDigitalMetadata: true,
          creationDate: formatDate(pdfDoc.getCreationDate()),
          modificationDate: formatDate(pdfDoc.getModificationDate()),
          creator: pdfDoc.getCreator() || 'Unknown',
          producer: pdfDoc.getProducer() || 'Unknown'
        };
      } catch (pdfErr) {
        console.warn("Failed to parse PDF metadata:", pdfErr);
        digitalMetadata = { hasDigitalMetadata: false };
      }
    }

    // Stage 1: Extraction & Anomaly Check
    const extractionPrompt = `You are an expert HR document analyzer. Read the attached certificate file.
    
    TASK 1: EXTRACTION
    Extract the variables "issuer", "topic", and "date" (format: YYYY-MM-DD or whatever is present).
    
    TASK 2: ANOMALY CHECK
    Perform a preliminary visual manipulation and layout anomaly check. Assign a "layoutAnomalyScore" between 0.0 and 1.0, where 1.0 means highly likely to be forged/manipulated.`;

    const responseSchema = {
      type: SchemaType.OBJECT,
      properties: {
        issuer: { type: SchemaType.STRING, description: "The issuer or organizer of the certificate/event" },
        topic: { type: SchemaType.STRING, description: "The topic or name of the event/seminar" },
        date: { type: SchemaType.STRING, description: "The date of the event in YYYY-MM-DD format" },
        layoutAnomalyScore: { type: SchemaType.NUMBER, description: "Score between 0.0 and 1.0 indicating visual manipulation." },
        anomalyReasoning: { type: SchemaType.STRING, description: "Explanation of layoutAnomalyScore." }
      },
      required: ["issuer", "topic", "date", "layoutAnomalyScore", "anomalyReasoning"]
    };

    const extractionModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json", responseSchema }
    });

    let extractionResult;
    try {
      extractionResult = await executeWithRetry(() => extractionModel.generateContent([extractionPrompt, filePart]));
    } catch (apiError) {
      console.error("Gemini Extraction Error:", apiError);
      await updateStatus(facultyId, 'failed', { error: 'Failed to process document via AI.' }, adminUsername);
      return;
    }

    const rawText = extractionResult.response.text();
    let extractedData;
    try {
      extractedData = JSON.parse(rawText);
    } catch (parseError) {
      console.error("Failed to parse Stage 1 JSON:", rawText);
      await updateStatus(facultyId, 'failed', { error: 'AI returned an unparsable format.' }, adminUsername);
      return;
    }

    extractedData.issuer = (extractedData.issuer && extractedData.issuer.trim() !== "") ? extractedData.issuer.trim() : "Not specified";
    extractedData.topic = (extractedData.topic && extractedData.topic.trim() !== "") ? extractedData.topic.trim() : "Not specified";
    extractedData.date = (extractedData.date && extractedData.date.trim() !== "") ? extractedData.date.trim() : "Not specified";

    const isMissingCoreInfo = extractedData.issuer === "Not specified" && extractedData.topic === "Not specified";
    const documentCategory = faculty.documentType || "Certificate";

    if (isMissingCoreInfo || documentCategory === "Contract") {
      await updateStatus(facultyId, 'flagged', {
        layoutAnomalyScore: extractedData.layoutAnomalyScore,
        anomalyReasoning: extractedData.anomalyReasoning,
        isValid: null,
        referenceUrls: [],
        extractedData: {
          issuer: extractedData.issuer,
          topic: extractedData.topic,
          date: extractedData.date
        },
        metadata: digitalMetadata,
        error: isMissingCoreInfo ? "Failed to extract core certificate identity." : null
      }, adminUsername);
      return;
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
      }
    } catch (searchError) {
      console.warn("Tavily search failed, continuing without search context:", searchError);
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
    
    Return ONLY a valid JSON object. Example: {"isValid": true, "reasoning": "Context confirms event.", "referenceUrls": ["https://example.com"]}`;

    const validationModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    let validationResult;
    try {
      validationResult = await executeWithRetry(() => validationModel.generateContent(validationPrompt));
    } catch (apiError) {
      console.error("Gemini Validation Error:", apiError);
      await updateStatus(facultyId, 'failed', { error: 'Failed to validate event via search grounding.' }, adminUsername);
      return;
    }

    const valRawText = validationResult.response.text();
    let validationData;
    try {
      validationData = JSON.parse(valRawText);
    } catch (parseError) {
      console.error("Failed to parse Stage 2 JSON:", valRawText);
      await updateStatus(facultyId, 'failed', { error: 'Validation AI returned an unparsable format.' }, adminUsername);
      return;
    }

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
      },
      metadata: digitalMetadata
    };

    // Determine final status based on AI output
    const isSuspicious = !validationData.isValid || extractedData.layoutAnomalyScore > 0.7;
    const newStatus = isSuspicious ? 'flagged' : 'verified';

    await updateStatus(facultyId, newStatus, finalResponse, adminUsername);

  } catch (error) {
    console.error("Background Verification Pipeline Error:", error);
    await updateStatus(facultyId, 'failed', { error: "An unexpected error occurred during verification." }, adminUsername);
  }
};

async function updateStatus(facultyId, status, data, adminUsername) {
  try {
    const faculty = await Faculty.findByIdAndUpdate(
      facultyId,
      {
        verificationStatus: status,
        verificationData: data
      },
      { new: true }
    );
    
    // Add notification to the user who requested it
    if (adminUsername) {
      const user = await User.findOne({ username: adminUsername });
      if (user) {
        let type = 'info';
        if (status === 'verified') type = 'success';
        if (status === 'flagged' || status === 'failed') type = 'danger';

        user.notifications.push({
          title: 'AI Verification Completed',
          message: `Verification for ${faculty ? faculty.firstName + ' ' + faculty.lastName : 'faculty'} is complete. Result: ${status.toUpperCase()}`,
          type: type
        });
        await user.save();
      }
    }

    // Notify frontend via SSE
    verificationEmitter.emit('verificationComplete', {
      facultyId,
      status,
      facultyName: faculty ? `${faculty.firstName} ${faculty.lastName}` : 'Unknown',
      data
    });
  } catch (err) {
    console.error("Failed to update verification status:", err);
  }
}

module.exports = {
  processVerificationInBackground,
  verificationEmitter
};
