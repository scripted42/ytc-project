import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_DATA = {
  campaigns: [],
  clips: [],
  settings: {
    gameplayUrl: 'https://www.youtube.com/watch?v=nNGQ78eP0oA', // Default Subway Surfers
    gameplayPath: ''
  }
};

class FileDatabase {
  constructor() {
    this.data = { ...DEFAULT_DATA };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = { ...DEFAULT_DATA, ...JSON.parse(fileContent) };
      } else {
        this.save();
      }
    } catch (error) {
      console.error('Failed to load database, using defaults:', error);
      this.data = { ...DEFAULT_DATA };
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save database:', error);
    }
  }

  // Campaigns API
  getCampaigns() {
    return this.data.campaigns;
  }

  getCampaignById(id) {
    return this.data.campaigns.find(c => c.id === id);
  }

  addCampaign(campaign) {
    const newCampaign = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...campaign
    };
    this.data.campaigns.push(newCampaign);
    this.save();
    return newCampaign;
  }

  updateCampaign(id, updates) {
    const index = this.data.campaigns.findIndex(c => c.id === id);
    if (index !== -1) {
      this.data.campaigns[index] = { ...this.data.campaigns[index], ...updates };
      this.save();
      return this.data.campaigns[index];
    }
    return null;
  }

  deleteCampaign(id) {
    this.data.campaigns = this.data.campaigns.filter(c => c.id !== id);
    this.data.clips = this.data.clips.filter(c => c.campaignId !== id); // Cascade delete clips
    this.save();
    return true;
  }

  // Clips API
  getClips() {
    return this.data.clips;
  }

  getClipById(id) {
    return this.data.clips.find(c => c.id === id);
  }

  addClip(clip) {
    const newClip = {
      id: crypto.randomUUID(),
      status: 'pending',
      progress: 0,
      views: 0,
      earnings: 0,
      createdAt: new Date().toISOString(),
      ...clip
    };
    this.data.clips.push(newClip);
    this.save();
    return newClip;
  }

  updateClip(id, updates) {
    const index = this.data.clips.findIndex(c => c.id === id);
    if (index !== -1) {
      this.data.clips[index] = { ...this.data.clips[index], ...updates };
      this.save();
      return this.data.clips[index];
    }
    return null;
  }

  deleteClip(id) {
    const clip = this.getClipById(id);
    if (clip && clip.filePath && fs.existsSync(clip.filePath)) {
      try {
        fs.unlinkSync(clip.filePath);
      } catch (err) {
        console.error('Failed to delete clip file:', err);
      }
    }
    this.data.clips = this.data.clips.filter(c => c.id !== id);
    this.save();
    return true;
  }

  // Settings API
  getSettings() {
    return this.data.settings;
  }

  updateSettings(updates) {
    this.data.settings = { ...this.data.settings, ...updates };
    this.save();
    return this.data.settings;
  }
}

export const db = new FileDatabase();
export default db;
