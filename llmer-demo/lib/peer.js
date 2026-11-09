/**
 * Peer dependency loading.
 *
 * Node resolves a module's imports from its real path, so a skill lib that is
 * symlinked into a project (`npm run link`) would look for Playwright and
 * node-pty next to this repo instead of in the project running the demo.
 * Resolve from the working directory first, then from the lib itself.
 */
import { createRequire } from 'module';
import { join } from 'path';
export function requirePeer(id) {
    for (const base of [join(process.cwd(), 'noop.js'), import.meta.url]) {
        const req = createRequire(base);
        let path;
        try {
            path = req.resolve(id);
        }
        catch {
            continue;
        }
        return { mod: req(path), path };
    }
    throw new Error(`Cannot find '${id}' from ${process.cwd()} or the skill lib. Install it in the project: npm install ${id}`);
}
export const { chromium } = requirePeer('@playwright/test').mod;
//# sourceMappingURL=peer.js.map