import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
export function getGitState() {
    try {
        const commitHash = execSync('git rev-parse HEAD', { stdio: 'pipe', encoding: 'utf-8' }).trim();
        const status = execSync('git status --porcelain', { stdio: 'pipe', encoding: 'utf-8' }).trim();
        return { commitHash, dirty: status.length > 0 };
    }
    catch {
        return { commitHash: 'unknown', dirty: true };
    }
}
export function hashFile(filePath) {
    if (!existsSync(filePath))
        return 'missing';
    const content = readFileSync(filePath, 'utf-8');
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
export function readManifest(outputDir) {
    const manifestPath = join(outputDir, 'manifest.json');
    if (!existsSync(manifestPath))
        return null;
    try {
        return JSON.parse(readFileSync(manifestPath, 'utf-8'));
    }
    catch {
        return null;
    }
}
export function writeManifest(outputDir, manifest) {
    writeFileSync(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}
/**
 * Check whether an existing capture in outputDir is still valid.
 * Valid means: WebM exists, git HEAD matches, working tree is clean,
 * and scenario/target file hashes match (if paths provided).
 */
export function isCaptureValid(outputDir, options = {}) {
    const manifest = readManifest(outputDir);
    if (!manifest)
        return false;
    if (!existsSync(join(outputDir, 'recording.webm')))
        return false;
    const { commitHash, dirty } = getGitState();
    // Dirty working tree → can't verify code hasn't changed
    if (dirty)
        return false;
    if (manifest.capture.commitHash !== commitHash)
        return false;
    if (options.scenarioPath) {
        const currentHash = hashFile(options.scenarioPath);
        if (manifest.capture.scenarioHash !== currentHash)
            return false;
    }
    if (options.targetPath) {
        const currentHash = hashFile(options.targetPath);
        if (manifest.capture.targetHash !== currentHash)
            return false;
    }
    return true;
}
//# sourceMappingURL=manifest.js.map