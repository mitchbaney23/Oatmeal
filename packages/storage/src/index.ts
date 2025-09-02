import { PrismaClient } from '@prisma/client';
import path from 'path';
import { homedir } from 'os';

const dbPath = path.join(homedir(), 'Oatmeal', 'oatmeal.db');

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${dbPath}`
    }
  }
});

export interface Settings {
  id: string;
  enableTelemetry: boolean;
  retentionDays: number;
  useGpu: boolean;
  model: string;
  enableHubspot: boolean;
  enableGmail: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: string;
  name: string;
  role: string;
  seniority: 'early-career' | 'mid' | 'senior';
  sectorFocus?: string;
  goals: string[];
  frameworks: string[];
  coachingStyle: 'direct' | 'supportive' | 'analytical';
  prioritySkills: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  title: string;
  date: Date;
  duration: number;
  transcript?: string;
  summary?: any;
  artifacts?: any;
  createdAt: Date;
  updatedAt: Date;
}

export class SettingsService {
  async getSettings(): Promise<Settings | null> {
    return await prisma.settings.findFirst();
  }

  async updateSettings(data: Partial<Omit<Settings, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Settings> {
    const existing = await this.getSettings();
    
    if (existing) {
      return await prisma.settings.update({
        where: { id: existing.id },
        data
      });
    } else {
      return await prisma.settings.create({
        data: data as any
      });
    }
  }
}

export class SessionService {
  async createSession(data: { title: string; duration: number }): Promise<Session> {
    return await prisma.session.create({
      data
    });
  }

  async updateSession(id: string, data: Partial<Session>): Promise<Session> {
    return await prisma.session.update({
      where: { id },
      data
    });
  }

  async getRecentSessions(limit = 10): Promise<Session[]> {
    return await prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  async deleteOldSessions(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const result = await prisma.session.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate
        }
      }
    });
    
    return result.count;
  }
}

export { prisma as db };