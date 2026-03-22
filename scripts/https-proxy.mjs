#!/usr/bin/env node
/**
 * HTTPS proxy for WebXR on Vision Pro.
 * Vision Pro Safari requires secure context for navigator.xr.
 * This proxies HTTPS:4443 → HTTP:4323 (Astro dev server).
 */
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Try mkcert certs first (locally trusted), fall back to self-signed
const certDir = path.join(ROOT, 'certs');
const mkcertKey = path.join(certDir, '10.0.0.82+2-key.pem');
const mkcertCert = path.join(certDir, '10.0.0.82+2.pem');
const selfKey = path.join(certDir, 'key.pem');
const selfCert = path.join(certDir, 'cert.pem');

const key = fs.readFileSync(fs.existsSync(mkcertKey) ? mkcertKey : selfKey);
const cert = fs.readFileSync(fs.existsSync(mkcertCert) ? mkcertCert : selfCert);

const PROXY_PORT = 4443;
const TARGET = 'http://localhost:4323';

const server = https.createServer({ key, cert }, (req, res) => {
  const proxyReq = http.request(
    `${TARGET}${req.url}`,
    { method: req.method, headers: req.headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on('error', (err) => {
    res.writeHead(502);
    res.end(`Proxy error: ${err.message}`);
  });
  req.pipe(proxyReq);
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`HTTPS proxy running on https://0.0.0.0:${PROXY_PORT}`);
  console.log(`Proxying to ${TARGET}`);
  console.log(`\nVision Pro: https://10.0.0.82:${PROXY_PORT}/fireflies-xr`);
  console.log('(Accept the self-signed cert warning in Safari)');
});
