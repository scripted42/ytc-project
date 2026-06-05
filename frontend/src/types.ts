export interface ViralInsight {
  title: string;
  explanation: string;
  contextCheck?: string;
  startTime: number;
  endTime: number;
  duration: number;
  suggestedTitle: string;
  suggestedTags: string;
}

export interface Campaign {
  id: string;
  name: string;
  brand: string;
  platform: string[];
  rate: number;
  sourceUrl: string;
  guidelines: string;
  createdAt: string;
  transcript?: Array<{ text: string; start: number; duration: number }>;
  viralInsights?: ViralInsight[];
}

export interface Clip {
  id: string;
  campaignId: string;
  campaignName?: string;
  campaignRate?: number;
  name: string;
  fileName?: string;
  startTime: number;
  duration: number;
  useSplitScreen: boolean;
  gameplayType?: string;
  filePath?: string;
  title: string;
  tags: string;
  status: 'pending' | 'downloading' | 'downloading_gameplay' | 'processing' | 'completed' | 'failed';
  progress: number;
  views: number;
  earnings: number;
  error?: string;
  thumbnailFrames?: string[];
  thumbnailPath?: string;
  youtubeVideoId?: string;
  youtubeUploadStatus?: 'idle' | 'uploading' | 'success' | 'failed';
  youtubeUploadError?: string;
  createdAt: string;
}

export interface Settings {
  gameplayUrl: string;
  gameplayPath: string;
  gameplayDownloaded: boolean;
}
