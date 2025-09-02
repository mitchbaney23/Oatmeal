export interface SrsCard {
  id: string;
  prompt: string;
  answer?: string;
  ease: number;
  interval: number;
  dueAt: Date;
}

export interface LearningMoment {
  timestamp: string;
  quote: string;
  tag: 'good_question' | 'missed_opportunity' | 'objection' | 'storytelling' | 'next_step';
  whyItMatters: string;
}

// SM-2 spaced repetition algorithm
export class SrsScheduler {
  static calculateNextReview(card: SrsCard, quality: number): { ease: number; interval: number; dueAt: Date } {
    let { ease, interval } = card;
    
    if (quality >= 3) {
      if (interval === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * ease);
      }
      ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    } else {
      interval = 1;
    }
    
    ease = Math.max(1.3, ease);
    
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + interval);
    
    return { ease, interval, dueAt };
  }
}

export function makeCardsFromMoments(moments: LearningMoment[], companyName: string): Partial<SrsCard>[] {
  return moments
    .filter(moment => moment.tag === 'good_question' || moment.tag === 'missed_opportunity')
    .map(moment => ({
      prompt: `What was the key insight from: "${moment.quote}" at ${companyName}?`,
      answer: moment.whyItMatters,
      ease: 2.5,
      interval: 1,
      dueAt: new Date()
    }));
}