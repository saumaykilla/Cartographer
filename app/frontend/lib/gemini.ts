/**
 * HomeCart — Gemini 2.5 Flash Substitution Engine
 * Calls the Gemini API via REST to keep the bundle lightweight in React Native.
 */

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

export interface SubstitutionResult {
  id: string;
  name: string;
  brand: string;
  matchScore: number;
  originMatch: string;
  description: string;
  category: string;
  preparationTip: string;
  priceRange: 'budget' | 'mid' | 'premium';
  storeSection: string;
  dietaryFlags: string[];
}

function buildSystemPrompt(dietaryPreferences: string[]): string {
  const dietaryClause = dietaryPreferences.length > 0
    ? `\n\nIMPORTANT DIETARY CONSTRAINTS: The user follows these dietary requirements: ${dietaryPreferences.join(', ')}. You MUST:
1. Prioritise products that meet ALL of these dietary requirements.
2. Clearly avoid suggesting products that violate any of these restrictions.
3. If a product only partially meets requirements, lower its matchScore accordingly and note this in the description.
4. If no fully-compliant product exists, suggest the closest compliant alternative and explain.`
    : '';

  return `You are HomeCart's AI culinary assistant, specialized in helping immigrants and travelers find familiar food products in the US.

When given a search query (a brand name, ingredient, or dish from another country), return a JSON array of 3–4 product substitutions available in mainstream US grocery stores.${dietaryClause}

For each result, return:
- id: unique string (e.g. "result_1")
- name: full product name as found in US stores
- brand: brand name
- matchScore: integer 1–100 (authenticity/similarity to the original, adjusted for dietary fit)
- originMatch: cultural origin (e.g. "Indian", "Korean", "Mediterranean") or "US Standard"
- description: 1-2 sentences explaining why this matches, where to find it, and if/how it meets dietary needs
- category: product category (Dairy, Spices, Condiments, Grains, Snacks, etc.)
- preparationTip: 1 sentence on how to use this in a recipe context
- priceRange: "budget" | "mid" | "premium"
- storeSection: aisle or section in a typical US grocery store (e.g. "International Aisle", "Dairy Section", "Baking Aisle")
- dietaryFlags: array of strings listing which dietary labels apply (e.g. ["Vegan", "Gluten-Free"]) — empty array if none

Return ONLY valid JSON array. No markdown fences, no explanation. Example:
[{"id":"result_1","name":"...","brand":"...","matchScore":95,"dietaryFlags":["Vegan"],...}]`;
}

export async function searchIngredientSubstitutions(
  query: string,
  culturalOrigin?: string,
  dietaryPreferences: string[] = []
): Promise<SubstitutionResult[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is not configured.');
  }

  const dietaryNote = dietaryPreferences.length > 0
    ? ` [User dietary requirements: ${dietaryPreferences.join(', ')}]`
    : '';

  const userPrompt = culturalOrigin
    ? `Find US grocery substitutions for: "${query}" (from ${culturalOrigin} cuisine)${dietaryNote}`
    : `Find US grocery substitutions for: "${query}"${dietaryNote}`;

  const body = {
    system_instruction: {
      parts: [{ text: buildSystemPrompt(dietaryPreferences) }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';

  try {
    const parsed: SubstitutionResult[] = JSON.parse(raw);
    return parsed;
  } catch {
    console.error('Failed to parse Gemini response:', raw);
    throw new Error('Could not parse AI response. Please try again.');
  }
}
export interface ProductAnalysis {
  productName: string;
  brand: string;
  description: string;
  howToUse: string;
  dietaryNote: string;
  healthSignal: string;
  isCommonInUS: boolean;
  unitConversion?: string;
  culturalContext?: string;
  homeCountryContext?: string;
}

export async function analyzeProductImage(
  base64Image: string,
  dietaryPreferences: string[] = [],
  preferredLanguage: string = 'English',
  homeCountry: string = 'India'
): Promise<ProductAnalysis> {
  if (!GEMINI_API_KEY) {
    throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is not configured.');
  }

  const dietaryClause = dietaryPreferences.length > 0
    ? `The user has the following dietary preferences: ${dietaryPreferences.join(', ')}.`
    : '';

  const systemPrompt = `You are HomeCart's AI culinary assistant. Your task is to identify a product from an image taken in an American grocery store and provide cultural context for someone new to the US, specifically from the perspective of someone from ${homeCountry}.
  
  Identify the product and provide the following in ${preferredLanguage}:
  - productName: The common name of the product.
  - brand: The brand name.
  - unitConversion: A brief conversion of the product's units (oz, lbs, fl oz) to metric units (grams, milliliters, etc.) if applicable.
  - description: 1-2 sentences explaining what it is.
  - howToUse: 1-2 sentences on how Americans typically use or cook with this.
  - dietaryNote: A summary of its dietary compatibility (Vegan, GF, Halal, etc.) and if it matches the user's preferences. ${dietaryClause}
  - healthSignal: A brief note on its nutritional profile (e.g. "High in protein", "Highly processed", "Great source of fiber").
  - isCommonInUS: Boolean, whether this is a staple in American homes.
  - culturalContext: If this has an equivalent or similar product in other cultures, mention it.
  - homeCountryContext: Provide specific context for someone from ${homeCountry}. For example, "This is like X in ${homeCountry}" or "In ${homeCountry}, we use Y instead. This is the closest US equivalent." Mention naming differences (e.g. "Cilantro" vs "Coriander") if relevant.

  Return ONLY valid JSON. No markdown fences.`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: "Analyze this product label." },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: base64Image
            }
          }
        ],
      },
    ],
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  
  // Clean up any markdown fences if they slipped through
  raw = raw.replace(/```json\n?/, '').replace(/\n?```/, '').trim();

  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse Gemini response:', raw);
    throw new Error('Could not parse AI response. Please try again.');
  }
}
