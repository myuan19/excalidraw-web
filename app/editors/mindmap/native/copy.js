const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { pathToFileURL } = require('url')

const nativeDir = path.resolve(__dirname)
const src = path.resolve(nativeDir, './dist/index.html')
const dest = path.resolve(nativeDir, './index.html')
const servedDir = path.resolve(nativeDir, '../../../../public/mind-map')

if (fs.existsSync(dest)) {
  fs.unlinkSync(dest)
}

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest)
  fs.unlinkSync(src)
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const fromPath = path.join(from, entry.name)
    const toPath = path.join(to, entry.name)
    if (entry.isDirectory()) {
      copyDir(fromPath, toPath)
    } else {
      fs.copyFileSync(fromPath, toPath)
    }
  }
}

const PRECOMPRESS_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.svg',
  '.txt'
])

function shouldPrecompress(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (!PRECOMPRESS_EXTENSIONS.has(ext)) {
    return false
  }
  try {
    return fs.statSync(filePath).size >= 1024
  } catch (error) {
    return false
  }
}

function gzipFile(filePath) {
  if (!shouldPrecompress(filePath)) {
    return
  }
  const source = fs.readFileSync(filePath)
  const compressed = zlib.gzipSync(source, { level: 9 })
  fs.writeFileSync(`${filePath}.gz`, compressed)
}

function gzipDir(dir) {
  if (!fs.existsSync(dir)) {
    return
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      gzipDir(filePath)
    } else if (!entry.name.endsWith('.gz')) {
      gzipFile(filePath)
    }
  }
}

if (fs.existsSync(servedDir)) {
  fs.rmSync(servedDir, { recursive: true, force: true })
}
fs.mkdirSync(servedDir, { recursive: true })
copyDir(path.resolve(nativeDir, './dist'), path.join(servedDir, 'dist'))

const bridgeSrc = path.resolve(nativeDir, 'web/src/bridge/takeoverShell.js')
const bridgeTargets = [
  path.join(servedDir, 'dist/bridge/takeover-shell.js'),
  path.join(nativeDir, 'dist/bridge/takeover-shell.js'),
]
if (fs.existsSync(bridgeSrc)) {
  for (const target of bridgeTargets) {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(bridgeSrc, target)
    gzipFile(target)
  }
} else {
  console.warn('[mind-map copy] missing bridge source:', bridgeSrc)
}

async function syncServedIndexHtml() {
  let html = fs.readFileSync(dest, 'utf8')
  try {
    const { normalizeMindMapIndexHtml } = await import(
      pathToFileURL(
        path.resolve(nativeDir, '../../../../scripts/mind-map-webpack-chunks.mjs')
      ).href
    )
    html = normalizeMindMapIndexHtml(html)
  } catch (error) {
    console.warn('[mind-map copy] index.html normalize skipped:', error.message)
  }
  fs.writeFileSync(path.join(servedDir, 'index.html'), html)
  fs.writeFileSync(dest, html)
  gzipDir(path.resolve(nativeDir, './dist'))
  gzipDir(path.join(servedDir, 'dist'))
}

void syncServedIndexHtml()
