import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
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
/**
 * Compute a hash of all .js files in the skill lib directory.
 * Used to detect when the lib has changed so scripts get regenerated.
 */
export function getLibHash() {
    try {
        const libDir = join(dirname(fileURLToPath(import.meta.url)));
        const jsFiles = readdirSync(libDir).filter(f => f.endsWith('.js')).sort();
        const hash = createHash('sha256');
        for (const file of jsFiles) {
            hash.update(readFileSync(join(libDir, file), 'utf-8'));
        }
        return hash.digest('hex').slice(0, 16);
    }
    catch {
        return 'unknown';
    }
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
 * scenario/target file hashes match (if paths provided), and the
 * skill lib hasn't changed since the capture.
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
    // Skill lib changed → script may use stale API patterns
    if (manifest.capture.libHash && manifest.capture.libHash !== getLibHash())
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