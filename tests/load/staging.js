/* global __ENV */
import http from 'k6/http'
import { check } from 'k6'

// PREPARATION ONLY: never executed automatically by npm test or CI.
const base=__ENV.STAGING_BASE_URL || 'http://127.0.0.1:3100'
// Restrictive origin parser avoids remote JS modules and accepts no paths/credentials.
const match=/^(https?):\/\/([a-z0-9.-]+)(?::([0-9]{1,5}))?$/.exec(base)
if(!match) throw new Error('Use a bare HTTP(S) origin without credentials, path or query')
const target={protocol:match[1]+':',hostname:match[2]}
const profile=Number(__ENV.PROFILE || 100)
if(![100,1000,10000].includes(profile)) throw new Error('Unsupported profile')
const local=['localhost','127.0.0.1'].includes(target.hostname)
if(!local && (__ENV.CONFIRM_ISOLATED_STAGING !== target.hostname || target.protocol!=='https:')) throw new Error('Explicit isolated staging host required')
if(profile>100 && __ENV.PREVIOUS_PROFILE_PASSED !== String(profile/10)) throw new Error('Measure and approve previous profile before increasing concurrency')
if(profile>100 && __ENV.APPROVED_MAX_VUS !== String(profile)) throw new Error('Explicit concurrency budget required')
export const options={
  // One request per virtual user caps each run to exactly PROFILE requests.
  scenarios:{ public_page:{executor:'per-vu-iterations',vus:profile,iterations:1,maxDuration:'60s'} },
  maxRedirects:0,
  thresholds:{
    http_req_failed:[{threshold:'rate<0.02',abortOnFail:true,delayAbortEval:'5s'}],
    http_req_duration:[{threshold:'p(95)<2000',abortOnFail:true,delayAbortEval:'5s'}],
  },
}
export default function publicPage() {
  const response=http.get(base+'/',{timeout:'5s',tags:{name:'public_home'}})
  check(response,{'HTTP 200':(r)=>r.status===200})
}
