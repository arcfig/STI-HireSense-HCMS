require('dotenv').config();

async function checkModels() {
  console.log("Asking Google for your available AI brains...");
  
  if (!process.env.GEMINI_API_KEY) {
    console.log("❌ ERROR: Your API key is missing. Make sure it is saved in your .env file!");
    return;
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();

    if (data.error) {
       console.log("❌ Google rejected the key. Reason:", data.error.message);
       return;
    }

    console.log("\n✅ SUCCESS! Here are the exact model names you are allowed to use:");
    data.models.forEach(model => {
       // We only want to see models that can actually generate text
       if (model.supportedGenerationMethods.includes("generateContent")) {
          console.log(`- ${model.name.replace('models/', '')}`);
       }
    });
    console.log("\nCopy one of those names and paste it into facultyRoutes.js!");

  } catch (err) {
    console.error("Failed to connect to Google:", err.message);
  }
}

checkModels();