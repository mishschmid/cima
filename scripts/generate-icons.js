import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const publicDir = path.join(rootDir, 'public')

const fontBase64 = execSync(
  'curl -s https://fonts.gstatic.com/s/hankengrotesk/v12/ieVn2YZDLWuGJpnzaiwFXS9tYtpd59CxCis4.woff2 | base64'
)
  .toString()
  .trim()

function getSvg(width, height, rx = 0) {
  const scale = width / 512
  const fontSize = 180 * scale
  const letterSpacing = -7 * scale
  const rxAttr = rx > 0 ? ` rx="${rx}"` : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      @font-face {
        font-family: 'Hanken Grotesk';
        font-weight: 600;
        src: url(data:font/woff2;base64,${fontBase64}) format('woff2');
      }
    </style>
  </defs>
  <rect width="${width}" height="${height}"${rxAttr} fill="#FF5B35"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        font-size="${fontSize}" font-weight="600" letter-spacing="${letterSpacing}" fill="#111111">
    <tspan x="50%" dy="-0.50em">ci</tspan>
    <tspan x="50%" dy="0.96em">ma<tspan fill="#ECECEA">.</tspan></tspan>
  </text>
</svg>`
}

function renderPng(width, height, outputPath) {
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Hanken Grotesk';
    font-weight: 600;
    src: url(data:font/woff2;base64,${fontBase64}) format('woff2');
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    background: transparent;
  }
</style>
</head>
<body>
  ${getSvg(width, height)}
</body>
</html>`

  const tempHtml = `/tmp/render-${width}x${height}.html`
  fs.writeFileSync(tempHtml, htmlContent)

  execSync(
    `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --screenshot="${outputPath}" --window-size=${width},${height} --default-background-color=00000000 "${tempHtml}"`
  )
  fs.unlinkSync(tempHtml)
  console.log(`Rendered ${outputPath} (${width}x${height})`)
}

// 1. Write SVGs
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@600&amp;display=swap');
    </style>
  </defs>
  <rect width="64" height="64" rx="14" fill="#FF5B35"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        font-size="23" font-weight="600" letter-spacing="-1" fill="#111111">
    <tspan x="50%" dy="-0.48em">ci</tspan>
    <tspan x="50%" dy="0.95em">ma<tspan fill="#ECECEA">.</tspan></tspan>
  </text>
</svg>
`

const iconMaskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@600&amp;display=swap');
    </style>
  </defs>
  <rect width="512" height="512" fill="#FF5B35"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        font-size="180" font-weight="600" letter-spacing="-7" fill="#111111">
    <tspan x="50%" dy="-0.50em">ci</tspan>
    <tspan x="50%" dy="0.96em">ma<tspan fill="#ECECEA">.</tspan></tspan>
  </text>
</svg>
`

fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSvg)
console.log('Updated public/favicon.svg')

fs.writeFileSync(path.join(publicDir, 'icon-maskable.svg'), iconMaskableSvg)
console.log('Updated public/icon-maskable.svg')

// 2. Render PNGs
renderPng(512, 512, path.join(publicDir, 'icon-512.png'))
renderPng(192, 192, path.join(publicDir, 'icon-192.png'))
renderPng(512, 512, path.join(publicDir, 'icon-maskable-512.png'))
renderPng(192, 192, path.join(publicDir, 'icon-maskable-192.png'))
renderPng(180, 180, path.join(publicDir, 'apple-touch-icon.png'))

console.log('All assets successfully built!')
