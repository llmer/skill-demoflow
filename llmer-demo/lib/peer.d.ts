/**
 * Peer dependency loading.
 *
 * Node resolves a module's imports from its real path, so a skill lib that is
 * symlinked into a project (`npm run link`) would look for Playwright and
 * node-pty next to this repo instead of in the project running the demo.
 * Resolve from the working directory first, then from the lib itself.
 */
export declare function requirePeer<T>(id: string): {
    mod: T;
    path: string;
};
export declare const chromium: import("playwright-core").BrowserType<{}>;
//# sourceMappingURL=peer.d.ts.map