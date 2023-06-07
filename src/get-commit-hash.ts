import { join as joinPath } from 'path';
import { readFileSync } from 'fs';

const getHashFromDisk = () => {
    try {
        const headPath = joinPath(__dirname, '.git/HEAD');
        const fileContents = readFileSync(headPath).toString();
        const revision = fileContents.trim().split(/.*[ :]/).at(-1);

        if (!revision?.includes('/')) return revision;
        return readFileSync(`.git/${revision}`).toString().trim();
    } catch {}

    return null;
};

const getHashFromEnvironment = () => process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? null;

let commitHash: string;
export const getCommitHash = () => {
    if (commitHash) return commitHash;
    commitHash = (getHashFromEnvironment() ?? getHashFromDisk() ?? 'unknown').slice(0, 12);
    return commitHash;
};
