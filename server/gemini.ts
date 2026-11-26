import { GoogleGenAI, Type } from '@google/genai';
import { db } from './db.ts';

export type SeoAssessmentStatus = 'Good' | 'Opportunity detected' | 'Needs improvement';

export interface SeoAssessmentArea {
  status: SeoAssessmentStatus;
  explanation: string;
}

export interface SeoStructuredAssessment {
  overallStatus: SeoAssessmentStatus;
  overallSummary: string;
  assessmentAreas: {
    titleOptimization: SeoAssessmentArea;
    keywordRelevance: SeoAssessmentArea;
    descriptionQuality: SeoAssessmentArea;
    searchIntentAlignment: SeoAssessmentArea;
    contentPositioning: SeoAssessmentArea;
  };
  titleKeywordsFound: string[];
  titleImprovements: string[];
  descriptionKeywordsPresent: string[];
  descriptionMissingKeywords: string[];
  descriptionImprovements: string[];
  primaryKeywordRationale: string;
  relatedSearchPhrases: Array<{ phrase: string; rationale: string }>;
}

export interface GeminiSeoInput {
  videoTitle: string;
  description: string;
  videoTopic: string;
  targetAudience: string;
  searchPhrases: string[];
  competitors: Array<{
    title: string;
    channelName: string;
    viewCount: number | null;
    resultPosition: number;
    searchPhrase: string;
  }>;
  publicStats: {
    viewCount: number | null;
    likeCount: number | null;
    commentCount: number | null;
    subscriberCount: number | null;
    subscribersHidden: boolean;
    duration: string;
  };
  thumbnailUrl?: string;
}

export interface GeminiSeoOutput {
  topicAssessment: string;
  mainKeyword: string;
  searchIntent: string;
  titleClarityNotes: string;
  descriptionStructureNotes: string;
  thumbnailSuitabilityNotes: string;
  relatedKeywords: Array<{ keyword: string; rationale: string }>;
  longTailKeywords: Array<{ keyword: string; rationale: string }>;
  titleAlternatives: Array<{ title: string; explanation: string }>;
  recommendedDescription: string;
  suggestedHashtags: string[];
  contentRecommendations: string[];
  limitationsAndConfidenceNotes: string;
  structuredAssessment: SeoStructuredAssessment;
  modelUsed: string;
}

const ALLOWED_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
]);

export function getActiveGeminiModel(): string {
  const row = db
    .prepare(`SELECT value FROM system_settings WHERE key = 'gemini_model'`)
    .get() as { value: string } | undefined;
  const candidate = row?.value?.trim() || 'gemini-4-hydrogen';
  return ALLOWED_MODELS.has(candidate) ? candidate : 'gemini-4-hydrogen';
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err = new Error(
      'GEMINI_API_KEY is not configured on the server. Add your Gemini API key in Settings > Secrets to run AI SEO Intelligence.'
    ) as Error & { code?: string };
    err.code = 'GEMINI_API_KEY_MISSING';
    throw err;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeStatus(val: unknown): SeoAssessmentStatus {
  const s = String(val || '').trim();
  if (s === 'Good' || s === 'Opportunity detected' || s === 'Needs improvement') return s;
  if (/good/i.test(s)) return 'Good';
  if (/need/i.test(s)) return 'Needs improvement';
  return 'Opportunity detected';
}

function parseArea(raw: any, fallbackExplanation: string): SeoAssessmentArea {
  return {
    status: normalizeStatus(raw?.status),
    explanation: typeof raw?.explanation === 'string' && raw.explanation.trim()
      ? raw.explanation.trim()
      : fallbackExplanation,
  };
}

function toStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
}

function validateGeminiSeoPayload(raw: unknown): Omit<GeminiSeoOutput, 'modelUsed'> {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Gemini returned an empty or non-object SEO payload.');
  }
  const obj = raw as Record<string, any>;
  const reqString = (k: string) => {
    const v = obj[k];
    if (typeof v !== 'string' || !v.trim()) {
      throw new Error(`Invalid AI response schema: missing string field "${k}".`);
    }
    return v.trim();
  };
  const reqStringArray = (k: string) => {
    const v = obj[k];
    if (!Array.isArray(v)) {
      throw new Error(`Invalid AI response schema: "${k}" must be an array.`);
    }
    return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
  };

  const relatedKeywords = Array.isArray(obj.relatedKeywords)
    ? obj.relatedKeywords
        .filter((r: any): r is { keyword: string; rationale: string } => Boolean(r && typeof r.keyword === 'string'))
        .map((r: any) => ({ keyword: r.keyword.trim(), rationale: String(r.rationale || '').trim() }))
    : [];

  const longTailKeywords = Array.isArray(obj.longTailKeywords)
    ? obj.longTailKeywords
        .filter((r: any): r is { keyword: string; rationale: string } => Boolean(r && typeof r.keyword === 'string'))
        .map((r: any) => ({ keyword: r.keyword.trim(), rationale: String(r.rationale || '').trim() }))
    : [];

  const titleAlternatives = Array.isArray(obj.titleAlternatives)
    ? obj.titleAlternatives
        .filter((r: any): r is { title: string; explanation: string } => Boolean(r && typeof r.title === 'string'))
        .map((r: any) => ({ title: r.title.trim(), explanation: String(r.explanation || '').trim() }))
    : [];

  if (titleAlternatives.length === 0) {
    throw new Error('Invalid AI response schema: titleAlternatives must contain at least one recommendation.');
  }

  const topicAssessment = reqString('topicAssessment');
  const titleClarityNotes = reqString('titleClarityNotes');
  const descriptionStructureNotes = reqString('descriptionStructureNotes');
  const searchIntent = reqString('searchIntent');

  const rawAreas = obj.assessmentAreas || {};
  const structuredAssessment: SeoStructuredAssessment = {
    overallStatus: normalizeStatus(obj.overallStatus),
    overallSummary:
      typeof obj.overallSummary === 'string' && obj.overallSummary.trim()
        ? obj.overallSummary.trim()
        : topicAssessment,
    assessmentAreas: {
      titleOptimization: parseArea(rawAreas.titleOptimization, titleClarityNotes),
      keywordRelevance: parseArea(rawAreas.keywordRelevance, topicAssessment),
      descriptionQuality: parseArea(rawAreas.descriptionQuality, descriptionStructureNotes),
      searchIntentAlignment: parseArea(rawAreas.searchIntentAlignment, searchIntent),
      contentPositioning: parseArea(rawAreas.contentPositioning, topicAssessment),
    },
    titleKeywordsFound: toStringList(obj.titleKeywordsFound),
    titleImprovements: toStringList(obj.titleImprovements),
    descriptionKeywordsPresent: toStringList(obj.descriptionKeywordsPresent),
    descriptionMissingKeywords: toStringList(obj.descriptionMissingKeywords),
    descriptionImprovements: toStringList(obj.descriptionImprovements),
    primaryKeywordRationale:
      typeof obj.primaryKeywordRationale === 'string' && obj.primaryKeywordRationale.trim()
        ? obj.primaryKeywordRationale.trim()
        : `Primary topic keyword aligned with "${reqString('mainKeyword')}".`,
    relatedSearchPhrases: Array.isArray(obj.relatedSearchPhrases)
      ? obj.relatedSearchPhrases
          .filter((r: any) => Boolean(r && typeof r.phrase === 'string' && r.phrase.trim()))
          .map((r: any) => ({ phrase: r.phrase.trim(), rationale: String(r.rationale || '').trim() }))
      : [],
  };

  return {
    topicAssessment,
    mainKeyword: reqString('mainKeyword'),
    searchIntent,
    titleClarityNotes,
    descriptionStructureNotes,
    thumbnailSuitabilityNotes: reqString('thumbnailSuitabilityNotes'),
    relatedKeywords,
    longTailKeywords,
    titleAlternatives,
    recommendedDescription: reqString('recommendedDescription'),
    suggestedHashtags: reqStringArray('suggestedHashtags'),
    contentRecommendations: reqStringArray('contentRecommendations'),
    limitationsAndConfidenceNotes: reqString('limitationsAndConfidenceNotes'),
    structuredAssessment,
  };
}

export async function generateYouTubeSeoAnalysis(input: GeminiSeoInput): Promise<GeminiSeoOutput> {
  const ai = getGeminiClient();
  const model = getActiveGeminiModel();

  const maxCompetitorsRow = db
    .prepare(`SELECT value FROM system_settings WHERE key = 'gemini_max_competitors'`)
    .get() as { value: string } | undefined;
  const maxComp = Math.min(Math.max(Number(maxCompetitorsRow?.value || 8), 1), 12);
  const competitorsSlice = input.competitors.slice(0, maxComp);

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  // Optionally attach thumbnail for real multimodal evaluation if reachable
  if (input.thumbnailUrl && input.thumbnailUrl.startsWith('https://')) {
    try {
      const thumbRes = await fetch(input.thumbnailUrl);
      if (thumbRes.ok) {
        const contentType = thumbRes.headers.get('content-type') || 'image/jpeg';
        if (contentType.startsWith('image/')) {
          const buf = Buffer.from(await thumbRes.arrayBuffer());
          if (buf.length <= 2_500_000) {
            parts.push({
              inlineData: {
                mimeType: contentType.split(';')[0],
                data: buf.toString('base64'),
              },
            });
          }
        }
      }
    } catch {
      // Non-fatal: continue with metadata-only thumbnail guidance
    }
  }

  const promptText = `You are a senior YouTube SEO strategist for Vantage Reach (Vantage Talent Search Global).
Analyze the creator's video honestly and constructively using ONLY the provided metadata, statistics, and retrieved YouTube competitor search results.

STRICT RULES:
1. NEVER invent search volume numbers, keyword difficulty scores, CPC values, or ranking predictions.
2. NEVER claim that changing a title or description guarantees top-five or higher YouTube rankings.
3. NEVER claim to know YouTube's internal ranking algorithm or say a video is poorly ranked unless retrieved search data supports it.
4. Clearly distinguish measured inputs (from YouTube API / creator input) from AI-generated recommendations.
5. For status indicators, strictly use one of: "Good", "Opportunity detected", or "Needs improvement".
6. Keep title alternatives clear, human, non-clickbait, and concise for mobile feeds.

INPUT DATA:
- Original Video Title: ${input.videoTitle}
- Original Description: ${input.description || '(No description provided)'}
- Creator-Stated Video Topic: ${input.videoTopic || '(Not specified)'}
- Target Audience: ${input.targetAudience || 'Global YouTube viewers'}
- Selected Search Phrases: ${input.searchPhrases.length ? input.searchPhrases.join(', ') : '(None selected)'}
- Public Statistics: ${JSON.stringify(input.publicStats)}
- Retrieved YouTube Competitor Search Results (${competitorsSlice.length} items): ${
    competitorsSlice.length > 0 ? JSON.stringify(competitorsSlice) : 'None retrieved yet.'
  }`;

  parts.push({ text: promptText });

  const areaSchema = {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, description: 'One of: Good, Opportunity detected, Needs improvement' },
      explanation: { type: Type.STRING, description: 'Plain-language explanation of what this assessment means for the video.' },
    },
    required: ['status', 'explanation'],
  };

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      systemInstruction:
        'Return strictly valid JSON matching the requested schema. Do not fabricate metrics, search volumes, keyword difficulty scores, or ranking guarantees.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallStatus: { type: Type.STRING, description: 'One of: Good, Opportunity detected, Needs improvement' },
          overallSummary: { type: Type.STRING, description: 'Concise overall SEO readiness summary without fabricated scores or ranking promises.' },
          assessmentAreas: {
            type: Type.OBJECT,
            properties: {
              titleOptimization: areaSchema,
              keywordRelevance: areaSchema,
              descriptionQuality: areaSchema,
              searchIntentAlignment: areaSchema,
              contentPositioning: areaSchema,
            },
            required: [
              'titleOptimization',
              'keywordRelevance',
              'descriptionQuality',
              'searchIntentAlignment',
              'contentPositioning',
            ],
          },
          topicAssessment: { type: Type.STRING, description: 'Clear assessment of the video topic and niche positioning.' },
          mainKeyword: { type: Type.STRING, description: 'Primary recommended focus keyword phrase.' },
          primaryKeywordRationale: { type: Type.STRING, description: 'Why this primary keyword fits the video content and audience.' },
          searchIntent: { type: Type.STRING, description: 'Likely viewer search intent (informational, tutorial, review, etc.).' },
          titleClarityNotes: { type: Type.STRING, description: 'Critique of current title clarity, hook, and mobile readability.' },
          titleKeywordsFound: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Relevant keywords already found in the current title.' },
          titleImprovements: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Specific actionable suggestions to improve the title.' },
          descriptionStructureNotes: { type: Type.STRING, description: 'Critique of current description structure and keyword placement.' },
          descriptionKeywordsPresent: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Relevant keywords already present in the current description.' },
          descriptionMissingKeywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Relevant keyword opportunities missing from the current description.' },
          descriptionImprovements: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Specific suggestions to improve description quality.' },
          thumbnailSuitabilityNotes: { type: Type.STRING, description: 'Observations on thumbnail clarity/suitability (or note if unavailable).' },
          relatedKeywords: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                keyword: { type: Type.STRING },
                rationale: { type: Type.STRING },
              },
              required: ['keyword', 'rationale'],
            },
          },
          longTailKeywords: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                keyword: { type: Type.STRING },
                rationale: { type: Type.STRING },
              },
              required: ['keyword', 'rationale'],
            },
          },
          relatedSearchPhrases: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                phrase: { type: Type.STRING },
                rationale: { type: Type.STRING },
              },
              required: ['phrase', 'rationale'],
            },
          },
          titleAlternatives: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ['title', 'explanation'],
            },
          },
          recommendedDescription: { type: Type.STRING, description: 'Ready-to-copy structured YouTube video description.' },
          suggestedHashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          contentRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          limitationsAndConfidenceNotes: {
            type: Type.STRING,
            description: 'Honest note explaining AI limitations, personalization of YouTube search, and lack of volume or ranking guarantees.',
          },
        },
        required: [
          'overallStatus',
          'overallSummary',
          'assessmentAreas',
          'topicAssessment',
          'mainKeyword',
          'primaryKeywordRationale',
          'searchIntent',
          'titleClarityNotes',
          'titleKeywordsFound',
          'titleImprovements',
          'descriptionStructureNotes',
          'descriptionKeywordsPresent',
          'descriptionMissingKeywords',
          'descriptionImprovements',
          'thumbnailSuitabilityNotes',
          'relatedKeywords',
          'longTailKeywords',
          'relatedSearchPhrases',
          'titleAlternatives',
          'recommendedDescription',
          'suggestedHashtags',
          'contentRecommendations',
          'limitationsAndConfidenceNotes',
        ],
      },
    },
  });

  const text = (response.text ?? '').trim();
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini returned malformed JSON that failed schema validation.');
  }

  const validated = validateGeminiSeoPayload(parsed);
  return {
    ...validated,
    modelUsed: model,
  };
}
