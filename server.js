import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import natural from 'natural';
dotenv.config();

const app = express();

app.use(
  cors({
    origin: [
      "https://inspo-ai-frontend.vercel.app",
      "http://localhost:5173",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

if (!process.env.GEMINI_API_KEY ||
  !process.env.SERPAPI_KEY ||
  !process.env.FREEPIK_API_KEY) {
  console.error("❌ ERROR: Missing API keys in .env file! Required: GEMINI_API_KEY, SERPAPI_KEY, FREEPIK_API_KEY");
  process.exit(1);
}

const nlpUtils = {
  tokenizer: new natural.WordTokenizer(),
  stemmer: natural.PorterStemmer,

  extractEnhancedTerms(query, additionalContext = {}) {
    // Enhanced NLP processing with more advanced term extraction
    const tokens = this.tokenizer.tokenize(query.toLowerCase());
    const stemmedTokens = tokens.map(token => this.stemmer.stem(token));

    const synonymMappings = {
      'design': ['creative', 'visual', 'artistic', 'graphic', 'conceptual'],
      'brand': ['identity', 'branding', 'corporate', 'image'],
      'style': ['aesthetic', 'look', 'theme', 'feel', 'approach'],
      'logo': ['emblem', 'mark', 'insignia', 'symbol'],
      'color': ['palette', 'scheme', 'tone', 'hue', 'shade'],
    };
    const contextExpansions = {
      'tech': ['digital', 'interface', 'ui', 'ux', 'app', 'software', 'innovation'],
      'fashion': ['clothing', 'apparel', 'trend', 'style', 'couture', 'runway'],
      'food': ['culinary', 'restaurant', 'menu', 'cuisine', 'gourmet', 'branding'],
      'education': ['learning', 'academic', 'training', 'course', 'instructional'],
    };
    // Enhanced term generation
    const enhancedTerms = new Set();
    stemmedTokens.forEach(token => {
      // Add original token variations
      enhancedTerms.add(`${token} design`);

      // Add synonyms
      Object.entries(synonymMappings).forEach(([key, synonyms]) => {
        if (token.includes(key)) {
          synonyms.forEach(syn => enhancedTerms.add(`${syn} design`));
        }
      });
      // Add industry-specific expansions (if provided)
      if (additionalContext.industry) {
        const industryTerms = contextExpansions[additionalContext.industry.toLowerCase()] || [];
        industryTerms.forEach(term => enhancedTerms.add(`${token} ${term}`));
      }
    });
    // Add explicit design styles and industry terms
    if (additionalContext.designStyle) {
      enhancedTerms.add(`${additionalContext.designStyle} design`);
    }
    if (additionalContext.industry) {
      enhancedTerms.add(`${additionalContext.industry} design`);
    }
    return Array.from(enhancedTerms).slice(0, 15);
  },
  // Advanced color palette extraction with color theory insights
  extractAdvancedColorPalette(aiSuggestions, inputColor = null) {
    const hexCodeRegex = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/g;
    const colorNameRegex = /\b(red|blue|green|yellow|purple|orange|pink|brown|gray|black|white)\b/gi;

    // Extract hex codes and color names
    const hexCodes = aiSuggestions.match(hexCodeRegex) || [];
    const colorNames = (aiSuggestions.match(colorNameRegex) || []).map(c => c.toLowerCase());
    // Color theory mappings for generative color schemes
    const colorTheoryMappings = {
      'complementary': (baseColor) => this.generateComplementaryColors(baseColor),
      'analogous': (baseColor) => this.generateAnalogousColors(baseColor),
      'triadic': (baseColor) => this.generateTriadicColors(baseColor),
    };
    // Combine and deduplicate colors
    const allColors = [...new Set([
      ...hexCodes,
      ...(inputColor ? [inputColor] : []),
      ...this.generateColorFromNames(colorNames)
    ])];
    // If few colors, generate additional colors using color theory
    if (allColors.length < 3 && allColors.length > 0) {
      const baseColor = allColors[0];
      const generativeScheme = Object.keys(colorTheoryMappings)[
        Math.floor(Math.random() * Object.keys(colorTheoryMappings).length)
      ];

      const additionalColors = colorTheoryMappings[generativeScheme](baseColor);
      allColors.push(...additionalColors);
    }
    return allColors.slice(0, 5);
  },
  // Utility methods for color generation
  generateColorFromNames(colorNames) {
    const colorMap = {
      'red': ['#FF0000', '#DC143C', '#B22222'],
      'blue': ['#0000FF', '#1E90FF', '#4169E1'],
      'green': ['#008000', '#32CD32', '#3CB371'],
      'yellow': ['#FFD700', '#FFFF00', '#FFA500'],
      'purple': ['#800080', '#8A2BE2', '#9400D3'],
      'orange': ['#FFA500', '#FF4500', '#FF6347'],
      'pink': ['#FFC0CB', '#FF69B4', '#FF1493'],
      'brown': ['#8B4513', '#A52A2A', '#D2691E'],
      'gray': ['#808080', '#A9A9A9', '#696969'],
      'black': ['#000000'],
      'white': ['#FFFFFF']
    };
    return colorNames.flatMap(name => colorMap[name] || []);
  },
  // Color theory color generation methods
  generateComplementaryColors(baseColor) {
    // Simple complement calculation
    return [this.adjustColorBrightness(baseColor, 0.2), this.adjustColorBrightness(baseColor, -0.2)];
  },
  generateAnalogousColors(baseColor) {
    // Generate colors close to the base color
    return [
      this.rotateHue(baseColor, 30),
      this.rotateHue(baseColor, -30)
    ];
  },
  generateTriadicColors(baseColor) {
    // Generate colors at 120-degree intervals
    return [
      this.rotateHue(baseColor, 120),
      this.rotateHue(baseColor, -120)
    ];
  },
  // Color manipulation utilities
  rotateHue(hex, degrees) {
    return hex;
  },
  adjustColorBrightness(hex, percent) {
    return hex;
  }
};

const makeLinksClickable = (text) => {
  return text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
};

// Function to validate image URLs
const validateImage = async (url) => {
  try {
    const response = await axios.head(url, { timeout: 5000 });
    return response.status === 200 && response.headers["content-type"].startsWith("image");
  } catch (error) {
    return false; // Return false if the image is not accessible
  }
};

// Fetch images from Google SERP API and filter out invalid ones
const fetchSerpAPIImages = async (query, limit = 10) => {
  try {
    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        q: query,
        tbm: "isch",
        api_key: process.env.SERPAPI_KEY,
        ijn: "0",
        safe: "active",
      },
    });
    const images = response.data.images_results.slice(0, limit).map((img) => ({
      image: img.original,
      title: img.title || "Design Inspiration",
      source: "Google Images",
      url: img.source || img.link || ""
    }));
    const validImages = [];
    for (const img of images) {
      if (await validateImage(img.image)) {
        validImages.push(img);
      }
    }
    return validImages;
  } catch (error) {
    console.error("❌ SerpAPI Error:", error.message);
    return [];
  }
};

const fetchFreepikImages = async (query, limit = 10, format = '') => {
  try {
    const params = {
      term: query,
      locale: "en-US",
      page: 1,
      limit: limit,
      order: "relevance"
    };
    // Add format filter if specified
    if (format && ['vector', 'psd'].includes(format.toLowerCase())) {
      params.format = format.toLowerCase();
    }
    const response = await axios.get("https://api.freepik.com/v1/resources", {
      headers: {
        'x-freepik-api-key': process.env.FREEPIK_API_KEY
      },
      params: params
    });
    if (!response.data || !response.data.data) {
      return [];
    }
    return response.data.data.map(item => ({
      image: item.image?.source?.url || item.image?.regular_url,
      title: item.title || "Design Resource",
      source: "Freepik",
      url: item.url || "",
      author: item.contributor?.username || "Freepik Artist",
      format: item.format || format || "image",
      isPremium: item.is_premium || false
    })).filter(img => img.image);
  } catch (error) {
    console.error("❌ Freepik API Error:", error.response?.data || error.message);
    return [];
  }
};

// Function to generate AI images using Freepik API
const fetchFreepikAIImage = async (prompt, aspectRatio = 'square_1_1', color = 'softhue', camera = 'portrait', lighting = 'iridescent') => {
  try {
    const data = {
      prompt,
      aspect_ratio: aspectRatio,
      styling: {
        effects: {
          color,
          camera,
          lightning: lighting,
        },
      },
      seed: Math.floor(Math.random() * 1000000), // Random seed for diversity
    };
    const response = await axios.post(
      'https://api.freepik.com/v1/ai/text-to-image',
      data,
      {
        headers: {
          'x-freepik-api-key': process.env.FREEPIK_API_KEY,
          'Content-Type': 'application/json',
        }
      }
    );
    // Properly check response structure
    if (response.data && response.data.images && Array.isArray(response.data.images)) {
      return response.data.images.map((img) => ({
        image: img.url,
        title: "AI Generated Design",
        source: "Freepik AI",
        format: "AI Image",
      }));
    }

    console.log("Unexpected response format from Freepik AI:", response.data);
    return [];
  } catch (error) {
    if (error.response) {
      console.error("❌ Freepik AI Error Status:", error.response.status);
      console.error("❌ Freepik AI Error Data:", error.response.data);
    } else {
      console.error("❌ Freepik AI Error:", error.message);
    }
    return [];
  }
};

const extractHeading = (aiSuggestions) => {
  const headingMatch = aiSuggestions.match(/^#\s+([^\n]+)|^##\s+([^\n]+)|^(.+?)\n/);
  if (headingMatch) {
    return (headingMatch[1] || headingMatch[2] || headingMatch[3] || "Design Recommendations").trim();
  }
  return "Design Recommendations";
};

// Fetch AI-based design recommendations
const getDesignSuggestions = async (query, industry, font, colorHex, designStyle) => {
  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const prompt = `
      As a professional design consultant, provide specific and actionable design recommendations based on these inputs:
      - Query: "${query}"
      - Industry: "${industry || 'Not specified'}"
      - Font Type: "${font || 'Not specified'}"
      - Color: "${colorHex || 'Not specified'}"
      - Design Style: "${designStyle || 'Not specified'}"
      
      Start with a main title that summarizes the design concept.
      
      Provide your response in this format:
      
      # [MAIN TITLE: DESIGN CONCEPT SUMMARY]
      
      # COLOR PALETTE
      - Primary: #HEXCODE (short description)
      - Secondary: #HEXCODE (short description)
      - Accent 1: #HEXCODE (short description)
      - Accent 2: #HEXCODE (short description)
      
      # TYPOGRAPHY RECOMMENDATIONS
      1. Font Name (style, weight) - specific usage
      2. Font Name (style, weight) - specific usage
      3. Font Name (style, weight) - specific usage
      4. Font Name (style, weight) - specific usage
      5. Font Name (style, weight) - specific usage
      
      # BRAND INSPIRATION
      1. Brand Name - brief description
      2. Brand Name - brief description
      3. Brand Name - brief description
      4. Brand Name - brief description
      5. Brand Name - brief description
      
      # DESIGN LANGUAGE RECOMMENDATIONS
      1. Specific design element - explanation
      2. Specific design element - explanation
      3. Specific design element - explanation
      4. Specific design element - explanation
      5. Specific design element - explanation
      
      # FONT PAIRING RECOMMENDATIONS
      1. Headline: Font Name + Body: Font Name - context
      2. Headline: Font Name + Body: Font Name - context
      3. Headline: Font Name + Body: Font Name - context
      
      # KEY DESIGN ELEMENTS
      1. Element - purpose and impact
      2. Element - purpose and impact
      3. Element - purpose and impact
      4. Element - purpose and impact
      
      ## LAYOUT SUGGESTIONS
      1. Specific layout for ${industry || 'this industry'} - description
      2. Specific layout for ${industry || 'this industry'} - description
      3. Specific layout for ${industry || 'this industry'} - description
    `;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const response = await axios.post(url, payload, { headers: { "Content-Type": "application/json" } });
    let aiText = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "No AI suggestions available.";
    aiText = aiText.replace(/\*\*/g, '');
    aiText = aiText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    aiText = makeLinksClickable(aiText);
    aiText = aiText.replace(/# ([^\n]+)/g, '<h1>$1</h1>');
    aiText = aiText.replace(/## ([^\n]+)/g, '<h2>$1</h2>');
    return aiText;
  } catch (error) {
    console.error("❌ Gemini API Error:", error.response?.data || error.message);
    return "Could not generate AI suggestions.";
  }
};

const extractRelatedTerms = (query, aiSuggestions, industry, designStyle) => {
  return nlpUtils.extractEnhancedTerms(query, { industry, designStyle });
};

const extractColorPalette = (aiSuggestions, inputColor = null) => {
  return nlpUtils.extractAdvancedColorPalette(aiSuggestions, inputColor);
};

// Main search route
app.get("/search", async (req, res) => {
  try {
    const { q, industry, font, color, designStyle, ai = false } = req.query;
    if (!q) return res.status(400).json({ error: "Query is required" });
    
    // Get AI suggestions first to extract color palette for better queries
    const aiSuggestions = await getDesignSuggestions(q, industry, font, color, designStyle);
    const colorPalette = extractColorPalette(aiSuggestions, color);
    const heading = extractHeading(aiSuggestions);
    
    // Generate structured search queries
    const industryFontQuery = `${q} ${industry || ''} ${font || ''} design inspiration`;
    const colorStyleQuery = `${q} ${designStyle || ''} ${color || ''} design inspiration`;
    const topIndustriesQuery = `Top industries using ${designStyle || ''} design`;
    
    // Create queries with extracting meaningful terms
    const mainFreepikQuery = `${q} ${industry || ''} ${designStyle || ''}`.trim();
    const colorFreepikQuery = colorPalette.length > 0 ? `${q} ${colorPalette[0]}`.trim() : `${q} ${color || ''}`.trim();
    
    const [
      industryFontResults,
      colorStyleResults,
      topIndustriesResults,
      freepikMainResults,
      freepikColorResults,
      freepikVectorResults,
      freepikPsdResults
    ] = await Promise.all([
      fetchSerpAPIImages(industryFontQuery, 10),
      fetchSerpAPIImages(colorStyleQuery, 10),
      fetchSerpAPIImages(topIndustriesQuery, 8),
      fetchFreepikImages(mainFreepikQuery, 10),
      fetchFreepikImages(colorFreepikQuery, 10),
      fetchFreepikImages(`${q} ${designStyle || ''}`.trim(), 8, 'vector'),
      fetchFreepikImages(`${q} ${industry || ''}`.trim(), 8, 'psd'),
    ]);
    
    // Optionally fetch AI-generated images if `ai=true`
    const freepikAIResults = ai === "true" ? await fetchFreepikAIImage(q) : [];
    
    // Extract related terms 
    const relatedTerms = extractRelatedTerms(q, aiSuggestions, industry, designStyle);
    
    // Combine Industry & Font Inspiration and Color & Style Inspiration into one array
    const combinedInspiration = [
      ...industryFontResults,
      ...colorStyleResults
    ].map(img => ({ ...img, category: "Combined Inspiration" }));
    
    // Combine all image results
    const allImages = [
      ...combinedInspiration,
      ...freepikMainResults.map(img => ({ ...img, category: "Downloadable Design Resources" })),
      ...freepikColorResults.map(img => ({ ...img, category: "Downloadable Color Inspiration" })),
      ...freepikVectorResults.map(img => ({ ...img, category: "Downloadable Vector Resources", format: "vector" })),
      ...freepikPsdResults.map(img => ({ ...img, category: "Downloadable PSD Templates", format: "psd" })),
      ...freepikAIResults.map(img => ({ ...img, category: "AI Generated Designs", format: "AI Image" })),
    ];
    
    res.json({
      images: allImages,
      aiSuggestions,
      relatedTerms,
      colorPalette,
      heading,
    });
  } catch (error) {
    console.error("❌ API Error:", error.message);
    res.status(500).json({ error: "Failed to fetch design resources", details: error.message });
  }
});

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Design API is running" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

export default app;
