/**
 * Netlify Function to securely generate Mediterranean recipes using the Gemini API.
 * The API key is sourced from the GEMINI_API_KEY environment variable.
 */
exports.handler = async (event, context) => {
    // 1. Validate environment key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Server configuration error: GEMINI_API_KEY not set." }),
        };
    }

    // 2. Validate client input
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    let ingredients;
    try {
        const data = JSON.parse(event.body);
        ingredients = data.ingredients;
        if (!ingredients || typeof ingredients !== 'string') {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing or invalid 'ingredients' in request body." }) };
        }
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body." }) };
    }

    // 3. Define Gemini API parameters and schema (matching the updated client logic)
    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";
    
    // Define the structured JSON schema that the client is expecting
    const singleRecipeSchema = {
        type: "OBJECT",
        properties: {
            "title": { "type": "STRING" },
            "description": { "type": "STRING" },
            "yield": { "type": "STRING" },
            "prepTime": { "type": "STRING" },
            "cookTime": { "type": "STRING" },
            "ingredients": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": { "type": "STRING" },
                        "quantity": { "type": "STRING" },
                        "unit": { "type": "STRING" }
                    },
                    "required": ["name", "quantity"]
                }
            },
            "instructions": { "type": "ARRAY", "items": { "type": "STRING" } },
            "dish_type": { "type": "STRING" }
        },
        required: ["title", "ingredients", "instructions"]
    };

    const recipeSchema = {
        type: "ARRAY",
        items: singleRecipeSchema,
        description: "An array containing 3 distinct Mediterranean recipes."
    };

    const userPrompt = `Create 3 distinct recipes for Mediterranean dishes using primarily these ingredients: ${ingredients}. Focus on variety (one salad, one cooked dish, one dip/side).`;
    const systemPrompt = "You are a world-class Mediterranean chef. Generate an array of 3 complete recipes in the requested JSON structure. Include quantities, specific steps, and make sure the dishes strongly fit the Mediterranean diet principles.";

    const payload = {
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: recipeSchema
        }
    };

    // 4. Call the Gemini API securely
    try {
        const response = await fetch(`${apiUrl}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("Gemini API Error:", errorBody);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: "Gemini API failed to generate content." }),
            };
        }

        const result = await response.json();
        
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "Gemini returned no structured content." }),
            };
        }
        
        // Clean JSON output (removing markdown fences)
        let cleanedJsonText = jsonText.trim();
        cleanedJsonText = cleanedJsonText.replace(/^\s*```(json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        
        // 5. Return the clean JSON result to the client
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: cleanedJsonText, // Return the raw, clean JSON string
        };

    } catch (e) {
        console.error("Function execution error:", e);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error during recipe generation." }),
        };
    }
};
