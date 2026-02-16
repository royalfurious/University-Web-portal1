const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParse = require('pdf-parse');

const MAX_FILE_SIZE_FOR_TEXT = 5 * 1024 * 1024; // 5 MB
let geminiQuotaUnavailable = false;

function getEvaluationMode() {
  const mode = (process.env.AI_EVALUATION_MODE || 'auto').toLowerCase();
  if (mode === 'heuristic' || mode === 'gemini' || mode === 'auto') {
    return mode;
  }
  return 'auto';
}

/**
 * Extract text from uploaded files — supports PDF, TXT, MD, JSON
 */
async function extractText(filePath, mimeType, size) {
  if (size > MAX_FILE_SIZE_FOR_TEXT) return '';

  const ext = path.extname(filePath).toLowerCase();

  // PDF extraction
  if (ext === '.pdf' || mimeType === 'application/pdf') {
    try {
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return data.text || '';
    } catch (err) {
      console.error('PDF parse error:', err.message);
      return '';
    }
  }

  // Plain text files
  const textExts = ['.txt', '.md', '.json', '.csv'];
  const textMimes = ['text/plain', 'application/json', 'text/markdown', 'text/csv'];
  if (textExts.includes(ext) || textMimes.includes(mimeType)) {
    return fs.readFileSync(filePath, 'utf-8');
  }

  return '';
}

function buildHeuristicFeedback(text, originalname) {
  const wordCount = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  const sentenceCount = text ? text.split(/[.!?]+/).filter(Boolean).length : 0;
  const averageSentenceLength = sentenceCount ? Math.round(wordCount / sentenceCount) : 0;

  let grammarScore = 75;
  let relevanceScore = 78;
  let originalityScore = 82;

  if (wordCount > 600) relevanceScore += 8;
  if (wordCount < 120) relevanceScore -= 10;
  if (averageSentenceLength > 30) grammarScore -= 10;
  if (averageSentenceLength >= 12 && averageSentenceLength <= 24) grammarScore += 6;

  const combined = Math.round((grammarScore + relevanceScore + originalityScore) / 3);

  return {
    summary: `Automated evaluation completed for ${originalname}.`,
    score: combined,
    grammar: Math.max(0, Math.min(100, grammarScore)),
    relevance: Math.max(0, Math.min(100, relevanceScore)),
    originality: Math.max(0, Math.min(100, originalityScore)),
    suggestions: [
      wordCount < 200 ? 'Expand your explanation with more evidence and examples.' : 'Your response length is adequate for a strong submission.',
      averageSentenceLength > 28 ? 'Break long sentences into shorter, clearer statements.' : 'Sentence structure is mostly clear and easy to follow.',
      'Add citations or references where applicable to improve academic strength.'
    ],
    mode: 'heuristic'
  };
}

async function evaluateWithAI(text, originalname, retries = 2) {
  if (geminiQuotaUnavailable) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || !text || text.trim().length < 30) {
    return null;
  }

  const modelsToTry = ['gemini-2.0-flash', 'gemini-2.0-flash-lite'];

  for (const modelName of modelsToTry) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`[AI Evaluator] Trying ${modelName} (attempt ${attempt + 1})`);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        const prompt = `You are a university professor evaluating a student assignment file named "${originalname}".
Analyze the following extracted text and provide a JSON evaluation with these keys:
- summary (string): 2-3 sentence overview of the submission quality
- score (integer 0-100): overall score
- grammar (integer 0-100): grammar and writing quality score
- relevance (integer 0-100): relevance and depth of content score
- originality (integer 0-100): originality and critical thinking score
- suggestions (array of 3 strings): specific actionable improvement suggestions

Return ONLY valid JSON, no markdown or extra text.

Student submission text:
${text.slice(0, 3500)}`;

        const result = await model.generateContent(prompt);
        const content = result.response.text().trim();
        // Strip markdown code fences if present
        const cleaned = content.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
        const parsed = JSON.parse(cleaned);
        parsed.mode = 'gemini';
        return parsed;
      } catch (err) {
        const msg = err.message || '';
        console.error(`[AI Evaluator] ${modelName} error:`, msg);

        // If 404 (model not found), skip to next model immediately
        if (msg.includes('404') || msg.includes('not found')) break;

        // If quota is hard-limited to zero, do not keep retrying this model
        if (msg.includes('limit: 0') || msg.includes('PerDayPerProjectPerModel-FreeTier')) {
          console.log(`[AI Evaluator] ${modelName} has zero available quota on this project; skipping retries.`);
          geminiQuotaUnavailable = true;
          console.log('[AI Evaluator] Gemini marked unavailable for this server run; using heuristic fallback for new submissions.');
          break;
        }

        // If rate limited (429), wait and retry
        if (msg.includes('429') && attempt < retries) {
          const wait = (attempt + 1) * 20; // 20s, 40s
          console.log(`[AI Evaluator] Rate limited, waiting ${wait}s before retry...`);
          await new Promise(r => setTimeout(r, wait * 1000));
          continue;
        }

        break; // Other errors → try next model
      }
    }
  }

  return null;
}

async function evaluateAssignment(file) {
  const evaluationMode = getEvaluationMode();
  const text = await extractText(file.path, file.mimetype, file.size);
  console.log(`[AI Evaluator] Extracted ${text.length} chars from ${file.originalname} (${file.mimetype})`);

  if (evaluationMode === 'heuristic') {
    console.log('[AI Evaluator] AI_EVALUATION_MODE=heuristic, skipping Gemini and using heuristic evaluation');
    return buildHeuristicFeedback(text, file.originalname);
  }

  const aiResult = await evaluateWithAI(text, file.originalname);

  if (aiResult) {
    console.log('[AI Evaluator] Gemini evaluation successful');
    return aiResult;
  }

  if (evaluationMode === 'gemini') {
    console.log('[AI Evaluator] AI_EVALUATION_MODE=gemini but Gemini evaluation failed; using heuristic fallback to keep submission flow available');
  }

  console.log('[AI Evaluator] Falling back to heuristic evaluation');
  return buildHeuristicFeedback(text, file.originalname);
}

module.exports = {
  evaluateAssignment
};
