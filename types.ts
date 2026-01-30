
export interface Candidate {
  id: string;
  name: string;
  handle: string;
  profileImageUrl: string;
  profileUrl: string;
  platform: 'Twitter';
  firstSeen: string;
  sharedCount: number;
  trustScore: number; // Number of 'KNOW' votes
  totalInteractions: number; // Total 'KNOW' + 'DONT_KNOW'
}

export enum VoteValue {
  KNOW = 'KNOW',
  DONT_KNOW = 'DONT_KNOW'
}

export interface UserStats {
  votesCast: number;
  maxVotes: number;
  hasPermit: boolean;
  permitId?: string;
}

export interface VoteRecord {
  candidateId: string;
  value: VoteValue;
  timestamp: string;
}
