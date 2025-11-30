import { GoogleGenAI, Type } from '@google/genai';
import { BRICK_CATALOG, COLORS } from '../constants';
import { PlacedBrick } from '../types';
import { v4 as uuidv4 } from 'uuid';

const getClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
};

export const generateBuildFromPrompt = async (prompt: string): Promise<PlacedBrick[] | null> => {
    const ai = getClient();
    if (!ai) {
        console.error("API Key missing");
        return null;
    }

    const availableParts = BRICK_CATALOG.map(b => b.id).join(', ');
    const availableColors = COLORS.map(c => c.name).join(', ');

    const systemInstruction = `
    You are a LEGO Master Builder expert system. 
    Your goal is to generate a list of bricks to build a user's request in a 3D grid.
    
    The coordinate system:
    - Y is Up/Down. Ground is Y=0.
    - X is Left/Right.
    - Z is Front/Back.
    - Units are based on standard LEGO studs. 
    - Standard bricks are 1.2 units high. Plates are 0.4 units high.
    
    Available Parts IDs: ${availableParts}
    Available Color Names: ${availableColors} (Use the closest hex match or name if hex unknown, but prefer provided names)

    Rules:
    1. Only use the provided Part IDs.
    2. Be physically plausible (bricks shouldn't float in mid-air, although I will not run physics simulation, it should look built).
    3. Start building from Y=0.
    4. Keep the build relatively simple (under 30 parts) for this demo unless specified.
    
    Return the response as a valid JSON array of objects.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Build a ${prompt}`,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            partId: { type: Type.STRING, description: "One of the available part IDs" },
                            x: { type: Type.NUMBER, description: "X grid position (center)" },
                            y: { type: Type.NUMBER, description: "Y height position" },
                            z: { type: Type.NUMBER, description: "Z grid position (center)" },
                            rotation: { type: Type.INTEGER, description: "0, 1, 2, or 3 (multipliers of 90 degrees)" },
                            colorId: { type: Type.STRING, description: "One of the available color IDs (e.g. 'red', 'blue')" }
                        },
                        required: ["partId", "x", "y", "z", "rotation", "colorId"]
                    }
                }
            }
        });

        const rawData = JSON.parse(response.text);
        
        // Convert to application state format
        const bricks: PlacedBrick[] = rawData.map((item: any) => {
            // Validate Color
            let color = COLORS.find(c => c.id === item.colorId)?.hex || COLORS[0].hex;
            // Validate Part
            const part = BRICK_CATALOG.find(b => b.id === item.partId) || BRICK_CATALOG[0];

            return {
                id: uuidv4(),
                typeId: part.id,
                position: [item.x, item.y, item.z],
                rotation: item.rotation || 0,
                color: color
            };
        });

        return bricks;

    } catch (error) {
        console.error("Gemini Build Error:", error);
        return null;
    }
};
