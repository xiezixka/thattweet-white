import Dexie, { type Table } from 'dexie';
import { Tweet, UserCache } from '../../shared/types/tweet';

export class ThatTweetDB extends Dexie {
    tweets!: Table<Tweet>;
    users!: Table<UserCache>;

    constructor() {
        super('ThatTweetDB');
        this.version(1).stores({
            // id 是主键, 其余是索引字段。*tags 表示多值索引
            tweets: 'id, authorId, savedAt, aiStatus, imageProcessStatus, isBookmarked, *tags',
            users: 'id, handle, name'
        });
    }
}

export const db = new ThatTweetDB();
