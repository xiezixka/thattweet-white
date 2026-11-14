import { db } from '../storage/db';
import { ProcessStatus } from '../../shared/types/tweet';

export async function recoverInterruptedTasks(now = Date.now()) {
    const cutoff = now - 10 * 60_000;
    let interrupted = 0;
    await db.transaction('rw', db.tweets, async () => {
        for (const [statusKey, startedKey] of [['aiStatus', 'aiProcessingStartedAt'], ['imageProcessStatus', 'imageProcessingStartedAt']] as const) {
            const rows = await db.tweets.where(statusKey).equals(ProcessStatus.Processing).toArray();
            for (const tweet of rows) {
                if ((tweet[startedKey] || 0) > cutoff) continue;
                // The provider may already have charged for an interrupted response.
                // Require a deliberate manual retry instead of automatically billing twice.
                await db.tweets.update(tweet.id, statusKey === 'aiStatus' ? { aiStatus: ProcessStatus.Failed } : { imageProcessStatus: ProcessStatus.Failed });
                interrupted++;
            }
        }
    });
    return interrupted;
}
