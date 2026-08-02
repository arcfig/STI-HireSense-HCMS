
require('dotenv').config();
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const validationPrompt = \Verify if the following event actually took place:
Topic/Event Name: Test
Issuer/Organizer: Test
Date: 2026-06-30

Here is the retrieved context from the web regarding this event:
No search context available.

Available Reference URLs:
No URLs available.

Based on the provided context, did this event or seminar likely occur as described? Set isValid to true or false.
Provide an array of strings in referenceUrls containing any URLs you used to verify from the provided list.

Return ONLY a valid JSON object. Do not use markdown.
Example format: {isValid: true, reasoning: 'Clear explanation of why the web context confirms or fails to confirm the event.', referenceUrls: ['https://example.com']}\;

const validationModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    responseMimeType: 'application/json'
  }
});
validationModel.generateContent(validationPrompt)
  .then(res => console.log(res.response.text()))
  .catch(err => console.error('ERROR:', err));

