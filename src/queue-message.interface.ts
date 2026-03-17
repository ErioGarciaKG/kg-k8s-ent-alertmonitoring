
export interface QueueMessage {
  id: string;               // key used to update the hash in Redis
  state: 'ready' | 'started' | 'completed' | 'error';
  'starting-time': string;  // ISO datetime string
  duration: number;         // processing time in seconds
  'ending-time': string;    // ISO datetime string, empty until done
}