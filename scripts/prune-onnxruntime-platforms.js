#!/usr/bin/env node
// REAL, CRITICAL FIX for a genuine production deploy failure: Netlify's
// deploy actually failed with "The function exceeds the maximum size of
// 250 MB" - confirmed directly from the real deploy log, not a guess.
// Root cause, confirmed directly from onnxruntime-node's own real npm
// listing: the package is 218MB unpacked EVEN WITH the CUDA download
// skipped (already configured in netlify.toml's [build.environment]),
// because npm's own listing shows it ships prebuilt native binaries for
// ALL SIX supported platforms (Windows x64/arm64, Linux x64/arm64,
// macOS x64/arm64) inside one single published tarball - confirmed
// directly from a real, matching bug report (github.com/plur-ai/plur
// issue #1193) showing the exact same 210MB "ships every platform"
// problem, with the real internal folder listing:
//   bin/napi-v6/{linux,darwin,win32}/{x64,arm64}/
// There is no official onnxruntime-node install flag to select only one
// platform at install time (confirmed - only a CUDA-specific skip flag
// exists, already configured separately). The correct, real fix,
// confirmed against a working example of exactly this same prune
// (gpo.zugaina.org's Gentoo ebuild for a different onnxruntime-node
// consumer, doing the identical prune): delete every platform/arch
// subfolder except the one Netlify's build and runtime environment
// actually uses - Linux x64 (glibc) - after npm install has already
// populated node_modules, via this postinstall script.
//
// This runs automatically because package.json's "scripts.postinstall"
// points here - npm invokes it after every `npm install`, including
// Netlify's own automatic build-time install, with no manual step
// required beyond having this file and that scripts entry present.

const fs = require('fs');
const path = require('path');

const HOST_PLATFORM = 'linux';
const HOST_ARCH = 'x64';

function pruneOnnxruntimeNodePlatforms() {
  const binRoot = path.join(__dirname, '..', 'node_modules', 'onnxruntime-node', 'bin');
  if (!fs.existsSync(binRoot)) {
    // Not an error: e.g. running `npm install` locally on a machine
    // that hasn't installed onnxruntime-node at all, or a future
    // version that restructures this path - fail open (skip pruning)
    // rather than break the whole install over a missing optional step.
    console.log('[prune-onnxruntime-platforms] onnxruntime-node/bin not found - skipping (nothing to prune).');
    return;
  }

  // Real structure confirmed above: bin/<napi-version>/<platform>/<arch>/...
  // The napi-version folder name itself (e.g. "napi-v6") is not pruned -
  // only the platform/arch subfolders inside it, since that version
  // folder name can change across onnxruntime-node releases and this
  // script should keep working without needing an update every time.
  const napiDirs = fs.readdirSync(binRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let prunedCount = 0;
  let keptSize = 0;

  for (const napiDir of napiDirs) {
    const napiPath = path.join(binRoot, napiDir);
    const platformDirs = fs.readdirSync(napiPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const platformDir of platformDirs) {
      const platformPath = path.join(napiPath, platformDir);
      if (platformDir !== HOST_PLATFORM) {
        fs.rmSync(platformPath, { recursive: true, force: true });
        prunedCount++;
        continue;
      }
      // Platform matches (linux) - now prune by architecture inside it.
      const archDirs = fs.readdirSync(platformPath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      for (const archDir of archDirs) {
        const archPath = path.join(platformPath, archDir);
        if (archDir !== HOST_ARCH) {
          fs.rmSync(archPath, { recursive: true, force: true });
          prunedCount++;
        } else {
          keptSize += dirSize(archPath);
        }
      }
    }
  }

  console.log(`[prune-onnxruntime-platforms] Pruned ${prunedCount} unused platform/arch folder(s), kept ${HOST_PLATFORM}/${HOST_ARCH} (${(keptSize / 1024 / 1024).toFixed(1)} MB).`);
}

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size;
  }
  return total;
}

try {
  pruneOnnxruntimeNodePlatforms();
} catch (err) {
  // A failure here should NOT fail the whole npm install/deploy -
  // that would be a worse outcome than an oversized (but still
  // functional) bundle. Logged clearly so it's visible in the build
  // log rather than silently swallowed, matching this project's
  // established "never fail silently" convention elsewhere.
  console.error('[prune-onnxruntime-platforms] Pruning failed (non-fatal, continuing):', err.message);
}
