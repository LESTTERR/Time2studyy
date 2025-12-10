import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  // Enhanced CORS handling - Allow multiple origins and proper preflight
  const allowedOrigins = [
    'https://time2studyy.vercel.app',
    'https://time2studyy-git-main.vercel.app',
    'http://localhost:3000',
    'http://localhost:8080',
    'https://localhost:3000'
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Allow all origins for development, restrict in production
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowedMethods: ['POST'],
      receivedMethod: req.method
    });
  }

  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ 
      error: 'Prompt is required',
      receivedBody: req.body 
    });
  }

  // Input validation
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ 
      error: 'Prompt must be a non-empty string' 
    });
  }

  if (prompt.length > 4000) {
    return res.status(400).json({ 
      error: 'Prompt is too long (max 4000 characters)' 
    });
  }

  try {
    // Check if API key exists
    if (!process.env.GOOGLE_AI_API_KEY) {
      console.error('GOOGLE_AI_API_KEY environment variable is not set');
      return res.status(500).json({ 
        error: 'AI service configuration error' 
      });
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    
    // Enhanced prompt for study assistant behavior
    const enhancedPrompt = `You are a helpful study assistant for Time2Study app. ${prompt}`;
    
    const result = await model.generateContent(enhancedPrompt);
    const response = await result.response;
    const text = response.text();

    // Ensure we have a valid response
    if (!text || text.trim().length === 0) {
      throw new Error('Empty response from AI');
    }

    return res.status(200).json({ 
      reply: text.trim(),
      model: 'gemini-2.5-flash-lite',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating Gemini response:', error);
    
    // Different error handling based on error type
    if (error.message?.includes('API_KEY')) {
      return res.status(500).json({ 
        error: 'AI service authentication error' 
      });
    } else if (error.message?.includes('quota')) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please try again later.' 
      });
    } else if (error.message?.includes('SAFETY')) {
      return res.status(400).json({ 
        error: 'Content blocked by safety filters' 
      });
    } else {
      return res.status(500).json({ 
        error: 'Failed to generate response',
        details: error.message
      });
    }
  }
}