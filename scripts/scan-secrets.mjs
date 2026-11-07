import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/,
  /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bsb_secret_[A-Za-z0-9_-]{20,}/,
  /NEXT_PUBLIC_[A-Z_]*(?:SERVICE_ROLE|SECRET_KEY|PRIVATE_KEY)\s*=/,
]
async function files(dir) {
  const entries=await readdir(dir,{withFileTypes:true})
  return (await Promise.all(entries.map((entry)=>entry.isDirectory()?files(join(dir,entry.name)):[join(dir,entry.name)]))).flat()
}
const targets=(await Promise.all(['app','components','lib','supabase','types'].map(files))).flat()
targets.push('next.config.ts','proxy.ts','package.json','.env.example')
const findings=[]
for(const file of targets) {
  const content=await readFile(file,'utf8')
  if(patterns.some((pattern)=>pattern.test(content))) findings.push(file)
  // Decode JWT payloads locally; report only filenames, never token values.
  for(const token of content.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try { if(JSON.parse(Buffer.from(token[0].split('.')[1],'base64url').toString()).role==='service_role') findings.push(file) } catch {}
  }
}
console.log(JSON.stringify({filesScanned:targets.length,filesWithPotentialSecrets:[...new Set(findings)],scope:'source only; excludes local env, dependencies, build output and unavailable git history'}))
if(findings.length) process.exitCode=1
