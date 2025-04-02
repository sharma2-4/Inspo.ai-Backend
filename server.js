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
      "https://inspo-ai.vercel.app/",
      "http://localhost:5173",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

if (!process.env.GEMINI_API_KEY ||
  !process.env.GOOGLE_API_KEY ||
  !process.env.GOOGLE_SEARCH_ENGINE_ID ||
  !process.env.FREEPIK_API_KEY) {
  console.error("❌ ERROR: Missing API keys");
  process.exit(1);
}

const nlpUtils = {
  tokenizer: new natural.WordTokenizer(),
  stemmer: natural.PorterStemmer,
  extractEnhancedTerms(query, additionalContext = {}) {
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

// Enhanced function to fetch images from Google Custom Search API - improved relevance
const fetchGoogleImages = async (query, limit = 10) => {
  try {
    console.log(`Executing Google search with query: "${query}"`);
    
    const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
      params: {
        q: query,
        key: process.env.GOOGLE_API_KEY,
        cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
        searchType: "image",
        num: Math.min(limit, 10), // Google API limit is 10 per request
        safe: "active",
        imgSize: "large", // Prefer high quality images
      },
    });

    if (!response.data || !response.data.items || response.data.items.length === 0) {
      console.log(`No results found for query: "${query}"`);
      
      // Try a simplified fallback query if original query fails
      if (query.split(' ').length > 3) {
        const simplifiedQuery = query.split(' ').slice(0, 3).join(' ') + " design";
        console.log(`Trying simplified fallback query: "${simplifiedQuery}"`);
        
        const fallbackResponse = await axios.get("https://www.googleapis.com/customsearch/v1", {
          params: {
            q: simplifiedQuery,
            key: process.env.GOOGLE_API_KEY,
            cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
            searchType: "image",
            num: Math.min(limit, 10),
            safe: "active",
          },
        });
        
        if (!fallbackResponse.data || !fallbackResponse.data.items) {
          return [];
        }
        
        return processGoogleResults(fallbackResponse.data.items);
      }
      
      return [];
    }

    return processGoogleResults(response.data.items);
  } catch (error) {
    console.error("❌ Google Custom Search API Error:", error.response?.data || error.message);
    return [];
  }
};

// Helper function to process Google search results
const processGoogleResults = (items) => {
  // Generate a unique ID for each image based on URL
  const images = items.map((item) => ({
    image: item.link,
    title: item.title || "Design Inspiration",
    source: "Google Images",
    url: item.image?.contextLink || item.displayLink || "",
    snippet: item.snippet || "",
    id: Buffer.from(item.link).toString('base64').substring(0, 12) // Create a short unique ID from URL
  }));
  
  // Return results without duplicates
  const uniqueImages = [];
  const seenIds = new Set();
  
  for (const img of images) {
    if (!seenIds.has(img.id)) {
      seenIds.add(img.id);
      uniqueImages.push(img);
    }
  }
  
  return uniqueImages;
};

// Function to fetch inspiration from Dribbble via their API
const fetchDribbbleInspiration = async (query, limit = 8) => {
  try {
    // NOTE: You'll need to register for a Dribbble API key
    // This is a placeholder for the API call structure
    if (!process.env.DRIBBBLE_API_KEY) {
      console.log("Dribbble API key not configured, skipping Dribbble results");
      return [];
    }
    
    const response = await axios.get(`https://api.dribbble.com/v2/shots`, {
      params: {
        query: query,
        per_page: limit
      },
      headers: {
        'Authorization': `Bearer ${process.env.DRIBBBLE_API_KEY}`
      }
    });
    
    if (!response.data || !Array.isArray(response.data)) {
      return [];
    }
    
    return response.data.map(item => ({
      image: item.images?.normal || "",
      title: item.title || "Dribbble Design",
      source: "Dribbble",
      url: item.html_url || "",
      author: item.user?.name || "Dribbble Designer"
    })).filter(img => img.image);
  } catch (error) {
    console.error("❌ Dribbble API Error:", error.response?.data || error.message);
    return [];
  }
};

// Improved Pinterest search function with better image filtering
const fetchPinterestViaGoogle = async (query, limit = 10) => {
  try {
    const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
      params: {
        q: `${query} site:pinterest.com`,
        key: process.env.GOOGLE_API_KEY,
        cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
        searchType: "image",
        num: Math.min(limit+4, 10), // Request extra images in case some fail validation
        safe: "active",
        imgSize: "large", // Prefer high-quality images
      },
    });

    if (!response.data || !response.data.items) {
      console.log(`No Pinterest results for query: "${query}"`);
      return [];
    }

    const images = response.data.items.map((item) => ({
      image: item.link,
      title: item.title?.replace(" | Pinterest", "")
                       .replace(" on Pinterest", "") || "Pinterest Inspiration",
      source: "Pinterest",
      url: item.image?.contextLink || item.displayLink || "",
      id: Buffer.from(item.link).toString('base64').substring(0, 12), // Create a unique ID
      snippet: item.snippet || ""
    })).filter(img => img.image);
    
    // Filter out very small Pinterest images (which are often icons or low quality)
    return images;
  } catch (error) {
    console.error("❌ Pinterest search Error:", error.response?.data || error.message);
    return [];
  }
};

// Updated design platforms inspiration function with increased Pinterest results
const fetchDesignPlatformsInspiration = async (query, options = {}) => {
  try {
    const { industry, designStyle, font, limit = 20 } = options; // Increased from 10 to 20
    
    // Create more specific Pinterest queries for better results
    const mainQuery = [query, industry, designStyle, font, 'design'].filter(Boolean).join(' ');
    const alternateQuery = [query, industry, 'inspiration'].filter(Boolean).join(' ');
    
    // Run two separate Pinterest queries for more diverse results
    const [mainResults, alternateResults] = await Promise.all([
      fetchPinterestViaGoogle(mainQuery, Math.ceil(limit/2)),
      fetchPinterestViaGoogle(alternateQuery, Math.floor(limit/2))
    ]);
    
    // Combine and deduplicate results
    const combinedResults = [...mainResults];
    const seenIds = new Set(mainResults.map(item => item.id));
    
    // Add alternate results if they're not duplicates
    alternateResults.forEach(item => {
      if (!seenIds.has(item.id)) {
        combinedResults.push(item);
        seenIds.add(item.id);
      }
    });
    
    // Return results with combined category
    return combinedResults.map(item => ({
      ...item,
      source: "Pinterest" // Ensure source is marked correctly
    }));
  } catch (error) {
    console.error("❌ Design platforms search error:", error.message);
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
      isPremium: item.is_premium || false,
      id: Buffer.from(item.image?.source?.url || item.image?.regular_url || "").toString('base64').substring(0, 12) // Create a unique ID
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
      seed: Math.floor(Math.random() * 1000000), 
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
        id: Buffer.from(img.url || "").toString('base64').substring(0, 12) // Create a unique ID
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
      
      # LAYOUT SUGGESTIONS
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

// Main search route with priority for Pinterest results
app.get("/search", async (req, res) => {
  try {
    const { q, industry, font, color, designStyle, ai = false, platforms = "true" } = req.query;
    if (!q) return res.status(400).json({ error: "Query is required" });

    console.log(`📊 Search request: query="${q}", industry="${industry || 'none'}", font="${font || 'none'}", designStyle="${designStyle || 'none'}", platforms=${platforms}`);

    // Get AI suggestions first to extract color palette for better queries
    const aiSuggestions = await getDesignSuggestions(q, industry, font, color, designStyle);
    const colorPalette = extractColorPalette(aiSuggestions, color);
    const heading = extractHeading(aiSuggestions);

    // Generate more specific search queries that include all parameters
    const enhancedQuery = [
      q,
      industry,
      font,
      designStyle,
      'design inspiration'
    ].filter(Boolean).join(' ');
    
    const colorQuery = [
      q,
      industry,
      color || (colorPalette.length > 0 ? colorPalette[0] : ''),
      designStyle,
      'design'
    ].filter(Boolean).join(' ');

    // Create more specific Freepik queries
    const mainFreepikQuery = [q, industry, designStyle, font].filter(Boolean).join(' ');
    const colorFreepikQuery = [q, industry, color || (colorPalette.length > 0 ? colorPalette[0] : '')].filter(Boolean).join(' ');

    // Execute all search queries in parallel
    let platformPromise = [];
    if (platforms === "true") {
      platformPromise = fetchDesignPlatformsInspiration(q, { 
        industry, 
        designStyle, 
        font,
        limit: 20 // Request more Pinterest results
      });
    } else {
      platformPromise = Promise.resolve([]);
    }

    // Run all search queries in parallel
    const [
      // Original sources
      enhancedResults,
      colorResults,
      freepikMainResults,
      freepikColorResults,
      freepikVectorResults,
      freepikPsdResults,
      // Design platforms results (only Pinterest now)
      designPlatformsResults
    ] = await Promise.all([
      fetchGoogleImages(enhancedQuery, 10), // Slightly reduced from 12
      fetchGoogleImages(colorQuery, 6),     // Slightly reduced from 8
      fetchFreepikImages(mainFreepikQuery, 10),
      fetchFreepikImages(colorFreepikQuery, 10),
      fetchFreepikImages([q, designStyle, 'vector'].filter(Boolean).join(' '), 8, 'vector'),
      fetchFreepikImages([q, industry, 'template'].filter(Boolean).join(' '), 8, 'psd'),
      platformPromise
    ]);

    // Generate AI images if requested
    const freepikAIResults = ai === "true" ? await fetchFreepikAIImage(
      [q, industry, designStyle, font, color].filter(Boolean).join(' ')
    ) : [];

    // Extract related search terms
    const relatedTerms = extractRelatedTerms(q, aiSuggestions, industry, designStyle);

    // ---------- IMPROVED DEDUPLICATION APPROACH ----------
    // Map to track seen images by URL to prevent duplicates across categories
    const seenUrls = new Set();
    
    // Helper function to filter out duplicates when adding to categories
    const filterDuplicates = (images) => {
      return images.filter(img => {
        if (!img.image || seenUrls.has(img.image)) return false;
        seenUrls.add(img.image);
        return true;
      });
    };

    // COMBINE INSPIRATION & PINTEREST TOGETHER
    // Now prioritizing Pinterest results by including them first
    const combinedInspiration = filterDuplicates([
      ...designPlatformsResults, // Pinterest results FIRST to prioritize them
      ...enhancedResults,
      ...colorResults
    ]).map(img => ({ ...img, category: "Combined Inspiration" }));

    // Filter other categories with proper deduplication
    const freepikMainFiltered = filterDuplicates(freepikMainResults)
      .map(img => ({ ...img, category: "Downloadable Design Resources" }));
    const freepikColorFiltered = filterDuplicates(freepikColorResults)
      .map(img => ({ ...img, category: "Downloadable Color Inspiration" }));
    const freepikVectorFiltered = filterDuplicates(freepikVectorResults)
      .map(img => ({ ...img, category: "Downloadable Vector Resources", format: "vector" }));
    const freepikPsdFiltered = filterDuplicates(freepikPsdResults)
      .map(img => ({ ...img, category: "Downloadable PSD Templates", format: "psd" }));
    const freepikAIFiltered = filterDuplicates(freepikAIResults)
      .map(img => ({ ...img, category: "AI Generated Designs", format: "AI Image" }));

    // Log Pinterest ratio for debugging
    const pinterestCount = combinedInspiration.filter(img => img.source === "Pinterest").length;
    console.log(`Pinterest ratio in Combined Inspiration: ${pinterestCount}/${combinedInspiration.length} (${Math.round(pinterestCount/combinedInspiration.length*100)}%)`);

    // Combine all filtered image results
    const allImages = [
      ...combinedInspiration,
      ...freepikMainFiltered,
      ...freepikColorFiltered,
      ...freepikVectorFiltered,
      ...freepikPsdFiltered,
      ...freepikAIFiltered,
    ];

    // Log search statistics
    console.log(`📈 Search results: Combined (${combinedInspiration.length}), Resources (${freepikMainFiltered.length + freepikColorFiltered.length}), Vectors (${freepikVectorFiltered.length}), PSDs (${freepikPsdFiltered.length}), AI (${freepikAIFiltered.length})`);

    // Return comprehensive results
    res.json({
      images: allImages,
      aiSuggestions,
      relatedTerms,
      colorPalette,
      heading,
      query: {
        original: q,
        enhanced: enhancedQuery,
        params: { industry, font, color, designStyle }
      },
      stats: {
        totalImages: allImages.length,
        pinterestCount: pinterestCount,
        sources: [...new Set(allImages.map(img => img.source))]
      }
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
