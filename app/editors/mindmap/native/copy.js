const fs = require('fs')
const path = require('path')

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

if (fs.existsSync(servedDir)) {
  fs.rmSync(servedDir, { recursive: true, force: true })
}
fs.mkdirSync(servedDir, { recursive: true })
copyDir(path.resolve(nativeDir, './dist'), path.join(servedDir, 'dist'))
fs.copyFileSync(dest, path.join(servedDir, 'index.html'))
