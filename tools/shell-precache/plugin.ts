import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build, type Plugin, type ResolvedConfig } from 'vite'
import { buildShellManifest, renderPrelude, WORKER_URL, type OutputFile } from './manifest.ts'

/** Every file below `directory`, as site-absolute urls with their bytes. */
async function readOutputFiles(directory: string): Promise<OutputFile[]> {
  const found: OutputFile[] = []
  async function walk(current: string): Promise<void> {
    for (const item of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, item.name)
      if (item.isDirectory()) await walk(full)
      else found.push({ url: `/${path.relative(directory, full).split(path.sep).join('/')}`, content: await readFile(full) })
    }
  }
  await walk(directory)
  return found
}

/**
 * Production build step for the offline shell (Phase 12). After Vite has written the application it
 *
 *  1. builds `src/sw/sw.ts` as one self-contained classic script, `sw.js` (no imports, no chunks),
 *  2. lists every file in the output directory,
 *  3. derives the build id from the worker's code and every file's content (see `computeBuildId`), and
 *  4. writes `sw.js` again with the shell manifest injected in front of the code.
 *
 * It is inert under `vite dev` and `vitest` (`apply: 'build'`), so development never has a service worker.
 */
export function shellPrecachePlugin(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'sltl:shell-precache',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) {
      config = resolved
    },
    async writeBundle() {
      const outDir = path.resolve(config.root, config.build.outDir)
      const workerPath = path.join(outDir, WORKER_URL)

      // An isolated build: no config file, so none of this project's plugins (this one included) run again.
      await build({
        root: config.root,
        mode: config.mode,
        configFile: false,
        publicDir: false,
        logLevel: 'warn',
        build: {
          outDir,
          emptyOutDir: false,
          copyPublicDir: false,
          minify: true,
          lib: {
            entry: path.resolve(config.root, 'src/sw/sw.ts'),
            formats: ['iife'],
            name: 'SltlShellWorker',
            fileName: () => 'sw.js',
          },
        },
      })

      const workerCode = await readFile(workerPath)
      const manifest = buildShellManifest(workerCode, await readOutputFiles(outDir))
      await writeFile(workerPath, renderPrelude(manifest) + workerCode.toString('utf8'))

      const bytes = manifest.entries.length
      config.logger.info(`shell precache: ${bytes} files, build ${manifest.buildId}`)
    },
  }
}
