export interface UserSession {
  id: number;
  email: string;
  fullName: string;
  isAdmin: boolean;
  adminRole: string | null;
  permissions: string[];
}

export interface VideoRecord {
  id: number;
  user_id: number;
  youtube_video_id: string;
  url: string;
  title: string;
  description: string;
  channel_id: string;
  channel_name: string;
  thumbnail_url: string;
  duration: string;
  published_at: string;
  latest_views: number | null;
  latest_likes: number | null;
  latest_comments: number | null;
  latest_subscribers: number | null;
  subscribers_hidden: number;
  stats_source: string;
  last_synced_at: string;
  created_at: string;
  baseline_views?: number | null;
  baseline_likes?: number | null;
  baseline_comments?: number | null;
  baseline_subscribers?: number | null;
  baseline_captured_at?: string;
  snapshot_count?: number;
  seo_count?: number;
}

export interface VideoSnapshot {
  id: number;
  video_id: number;
  user_id: number;
  campaign_id: number | null;
  is_baseline: number;
  original_title: string;
  original_description: string;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  subscriber_count: number | null;
  subscribers_hidden: number;
  source: string;
  captured_at: string;
}

export interface KeywordSuggestion {
  id: number;
  seo_analysis_id: number;
  video_id: number;
  keyword_text: string;
  category: 'main' | 'related' | 'long_tail';
  rationale: string;
  is_ai_generated: number;
}

export type SeoAssessmentStatus = 'Good' | 'Opportunity detected' | 'Needs improvement';

export interface SeoAssessmentArea {
  status: SeoAssessmentStatus;
  explanation: string;
}

export interface SeoStructuredAssessment {
  overallStatus?: SeoAssessmentStatus;
  overallSummary?: string;
  assessmentAreas?: {
    titleOptimization?: SeoAssessmentArea;
    keywordRelevance?: SeoAssessmentArea;
    descriptionQuality?: SeoAssessmentArea;
    searchIntentAlignment?: SeoAssessmentArea;
    contentPositioning?: SeoAssessmentArea;
  };
  titleKeywordsFound?: string[];
  titleImprovements?: string[];
  descriptionKeywordsPresent?: string[];
  descriptionMissingKeywords?: string[];
  descriptionImprovements?: string[];
  primaryKeywordRationale?: string;
  relatedSearchPhrases?: Array<{ phrase: string; rationale: string }>;
}

export interface SeoAnalysisRecord {
  id: number;
  video_id: number;
  target_audience: string;
  searchPhrases: string[];
  topic_assessment: string;
  main_keyword: string;
  search_intent: string;
  title_clarity_notes: string;
  description_structure_notes: string;
  thumbnail_suitability_notes: string;
  titleAlternatives: Array<{ title: string; explanation: string }>;
  recommended_description: string;
  hashtags: string[];
  contentRecommendations: string[];
  limitations_notes: string;
  model_used: string;
  data_provenance: string;
  saved_by_user: number;
  created_at: string;
  keywords: KeywordSuggestion[];
  structuredAssessment?: SeoStructuredAssessment | null;
}

export interface CompetitorResultRecord {
  id?: number;
  competitor_video_id?: string;
  competitorVideoId?: string;
  search_phrase?: string;
  searchPhrase?: string;
  title: string;
  channel_name?: string;
  channelName?: string;
  thumbnail_url?: string;
  thumbnailUrl?: string;
  view_count?: number | null;
  viewCount?: number | null;
  published_at?: string;
  publishedAt?: string;
  result_position?: number;
  resultPosition?: number;
  retrieved_at?: string;
}

export interface PackageRecord {
  id: number;
  code: string;
  kind: 'promotion' | 'seo_service';
  name: string;
  description: string;
  duration_days: number;
  price_usd: number;
  price_ngn: number;
  deliverables: string[];
  is_active: number;
  sort_order: number;
}

export interface CampaignRecord {
  id: number;
  user_id: number;
  video_id: number;
  package_id: number | null;
  campaign_ref: string;
  title: string;
  duration_days: number;
  amount_paid: number;
  currency: string;
  payment_status: string;
  status: string;
  purchase_date: string;
  start_date: string | null;
  end_date: string | null;
  target_regions: string;
  deliverables: string[];
  video_title?: string;
  thumbnail_url?: string;
  youtube_video_id?: string;
  package_name?: string;
  latest_tx_ref?: string;
  latest_views?: number | null;
}

export interface PaymentRecord {
  id: number;
  tx_ref: string;
  provider: string;
  provider_ref: string;
  amount: number;
  currency: string;
  status: string;
  verified_server_side: number;
  webhook_received: number;
  failure_reason: string;
  refund_reason: string;
  campaign_ref?: string;
  campaign_title?: string;
  order_ref?: string;
  service_name?: string;
  created_at: string;
}

export interface NotificationRecord {
  id: number;
  title: string;
  message: string;
  category: string;
  link_path: string;
  is_read: number;
  created_at: string;
}
