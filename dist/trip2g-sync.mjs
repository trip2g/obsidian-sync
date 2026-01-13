#!/usr/bin/env node
import*as g from"fs";import*as m from"path";import*as M from"crypto";function R(a){return!!(a.startsWith("_layouts/")&&(a.endsWith(".html")||a.endsWith(".html.json")))}import*as I from"path";function U(a,t,r){if(t.startsWith("./")){let n=I.dirname(r),s=I.join(n,t.slice(2));return a.fileExistsSync(s)?s:null}if(t.startsWith("/")){let n=t.slice(1);return a.fileExistsSync(n)?n:null}if(t.includes("/"))return a.fileExistsSync(t)?t:null;if(a.fileExistsSync(t))return t;let e=I.posix.join("assets",t);if(a.fileExistsSync(e))return e;let o=I.dirname(r);if(o&&o!=="."){let n=I.posix.join(o,t);if(a.fileExistsSync(n))return n}return null}var E=class{constructor(t,r={}){this.url=t;this.options=r}async request(t){let r=typeof t.document=="string"?t.document:t.document.loc?.source.body;if(!r)throw new Error("Invalid GraphQL document: no query string found");let e=await fetch(this.url,{method:"POST",headers:{"Content-Type":"application/json",...this.options.headers,...t.requestHeaders},body:JSON.stringify({query:r,variables:t.variables}),signal:t.signal});if(!e.ok)throw new Error(`HTTP ${e.status}: ${e.statusText}`);let o=await e.json();if(o.errors?.length)throw new Error(`GraphQL Error: ${o.errors[0].message}`);if(!o.data)throw new Error("GraphQL response missing data");return o.data}};function P(a,...t){let r=a[0];for(let e=0;e<t.length;e++)r+=String(t[e])+a[e+1];return{loc:{source:{body:r}}}}var Q=P`
    query FetchServerHashes {
  notePaths {
    path: value
    hash: latestContentHash
  }
}
    `,q=P`
    query FetchNoteContents($filter: NotePathsFilter) {
  notePaths(filter: $filter) {
    path: value
    content
  }
}
    `,V=P`
    query FetchNoteAssets($filter: NotePathsFilter) {
  notePaths(filter: $filter) {
    path: value
    assetReplaces {
      id
      url
      hash
      absolutePath
    }
  }
}
    `,K=P`
    mutation PushNotes($input: PushNotesInput!) {
  pushNotes(input: $input) {
    ... on ErrorPayload {
      message
    }
    ... on PushNotesPayload {
      notes {
        id
        path
        assets {
          path
          sha256Hash
          absolutePath
          url
        }
      }
    }
  }
}
    `,G=P`
    mutation HideNotes($input: HideNotesInput!) {
  hideNotes(input: $input) {
    ... on HideNotesPayload {
      success
    }
    ... on ErrorPayload {
      message
    }
  }
}
    `,j=P`
    mutation UploadNoteAsset($input: UploadNoteAssetInput!) {
  uploadNoteAsset(input: $input) {
    ... on ErrorPayload {
      __typename
      message
    }
    ... on UploadNoteAssetPayload {
      __typename
      uploadSkipped
    }
  }
}
    `,W=P`
    mutation CommitNotes {
  commitNotes {
    ... on CommitNotesPayload {
      success
    }
    ... on ErrorPayload {
      message
    }
  }
}
    `,_=(a,t,r,e)=>a();function O(a,t=_){return{FetchServerHashes(r,e,o){return t(n=>a.request({document:Q,variables:r,requestHeaders:{...e,...n},signal:o}),"FetchServerHashes","query",r)},FetchNoteContents(r,e,o){return t(n=>a.request({document:q,variables:r,requestHeaders:{...e,...n},signal:o}),"FetchNoteContents","query",r)},FetchNoteAssets(r,e,o){return t(n=>a.request({document:V,variables:r,requestHeaders:{...e,...n},signal:o}),"FetchNoteAssets","query",r)},PushNotes(r,e,o){return t(n=>a.request({document:K,variables:r,requestHeaders:{...e,...n},signal:o}),"PushNotes","mutation",r)},HideNotes(r,e,o){return t(n=>a.request({document:G,variables:r,requestHeaders:{...e,...n},signal:o}),"HideNotes","mutation",r)},UploadNoteAsset(r,e,o){return t(n=>a.request({document:j,variables:r,requestHeaders:{...e,...n},signal:o}),"UploadNoteAsset","mutation",r)},CommitNotes(r,e,o){return t(n=>a.request({document:W,variables:r,requestHeaders:{...e,...n},signal:o}),"CommitNotes","mutation",r)}}}function F(a){let t=new E(a.apiUrl,{headers:{"X-API-Key":a.apiKey}});return O(t)}var k=".sync-state.json",w=class{constructor(t){this.pushBatchSize=100;this.folder=m.resolve(t.folder),this.prefix=t.prefix?t.prefix.replace(/\/$/,""):"",this.twoWaySync=t.twoWaySync,this.verbose=t.verbose??!1,this.conflictResolution=t.conflictResolution??"local",this.publishField=t.publishField??"",this.meta=t.meta??{},this.syncState=this.loadSyncState(),this.apiUrl=t.apiUrl,this.apiKey=t.apiKey,this.sdk=F({apiUrl:t.apiUrl,apiKey:t.apiKey})}toRemotePath(t){return this.prefix?`${this.prefix}/${t}`:t}toLocalPath(t){return this.prefix&&t.startsWith(this.prefix+"/")?t.substring(this.prefix.length+1):t}matchesPrefix(t){return this.prefix?t.startsWith(this.prefix+"/"):!0}loadSyncState(){let t=m.join(this.folder,k);try{if(g.existsSync(t)){let r=g.readFileSync(t,"utf-8");return JSON.parse(r)}}catch(r){this.log(`Warning: Could not load sync state: ${r}`)}return{files:{}}}log(t){this.verbose&&console.log(t)}async getLocalFiles(){let t=[],r=e=>{let o=g.readdirSync(e,{withFileTypes:!0});for(let n of o){if(n.name.startsWith(".")||n.name==="node_modules")continue;let s=m.join(e,n.name);if(n.isDirectory())r(s);else if(n.isFile()){let l=m.extname(n.name).toLowerCase();if(l===".md"||l===".html"||n.name.endsWith(".html.json")){let p=g.statSync(s),i=m.relative(this.folder,s);t.push({path:this.toRemotePath(i),mtime:p.mtimeMs})}}}};return r(this.folder),t}async getServerHashes(){try{return(await this.sdk.FetchServerHashes()).notePaths.filter(r=>this.matchesPrefix(r.path)).map(r=>({path:r.path,hash:r.hash}))}catch(t){return console.error(`\u274C Failed to fetch server hashes: ${t}`),[]}}getSyncState(){return this.syncState}async computeHash(t){return M.createHash("sha256").update(t,"utf-8").digest().toString("base64").replace(/\+/g,"-").replace(/\//g,"_")}async readFileContent(t){let r=this.toLocalPath(t),e=m.join(this.folder,r);return g.readFileSync(e,"utf-8")}async writeFile(t,r){let e=m.join(this.folder,t);g.writeFileSync(e,r,"utf-8")}async writeBinaryFile(t,r){let e=m.join(this.folder,t);g.writeFileSync(e,Buffer.from(r))}async readBinaryFile(t){let r=m.join(this.folder,t),e=g.readFileSync(r);return e.buffer.slice(e.byteOffset,e.byteOffset+e.byteLength)}async deleteFile(t){let r=m.join(this.folder,t);g.existsSync(r)&&g.unlinkSync(r)}async createFolder(t){let r=m.join(this.folder,t);g.mkdirSync(r,{recursive:!0})}async fileExists(t){return this.fileExistsSync(t)}fileExistsSync(t){let r=m.join(this.folder,t);return g.existsSync(r)}async pushNotes(t,r){if(t.length===0)return[];let e=t.map(o=>({path:o.path,content:this.injectMeta(o.content)}));if(this.publishField){for(let o of e)if(!this.hasPublishFieldInContent(o.content,o.path))throw new Error(`[Security] Attempted to push note "${o.path}" without publish field "${this.publishField}". This is a bug in the sync logic - please report it.`)}try{let o=await this.sdk.PushNotes({input:{updates:e.map(n=>({path:n.path,content:n.content})),skipCommit:r}});if("message"in o.pushNotes)throw new Error(`Push failed: ${o.pushNotes.message}`);return console.log(`\u2705 Pushed ${t.length} notes`),o.pushNotes.notes.map(n=>({id:String(n.id),path:n.path,assets:n.assets.map(s=>({path:s.path,sha256Hash:s.sha256Hash??null,absolutePath:s.absolutePath??null,url:s.url??null}))}))}catch(o){return console.error(`\u274C Failed to push notes: ${o}`),[]}}async hideNotes(t){if(t.length!==0)try{let r=await this.sdk.HideNotes({input:{paths:t}});if("message"in r.hideNotes)throw new Error(`Hide failed: ${r.hideNotes.message}`);console.log(`\u2705 Hidden ${t.length} notes`)}catch(r){console.error(`\u274C Failed to hide notes: ${r}`)}}async fetchNoteContents(t){if(t.length===0)return[];try{return(await this.sdk.FetchNoteContents({filter:{paths:t}})).notePaths.map(e=>({path:e.path,content:e.content}))}catch(r){return console.error(`\u274C Failed to fetch note contents: ${r}`),[]}}async fetchNoteAssets(t){if(t.length===0)return[];try{let r=await this.sdk.PushNotes({input:{updates:[]}});if("message"in r.pushNotes)return console.error(`\u274C Failed to fetch note assets: ${r.pushNotes.message}`),[];let e=new Set(t);return r.pushNotes.notes.filter(o=>e.has(o.path)).map(o=>({path:o.path,noteId:String(o.id),assets:o.assets.map(n=>({id:n.path,url:n.url,hash:n.sha256Hash??"",absolutePath:n.absolutePath}))}))}catch(r){return console.error(`\u274C Failed to fetch note assets: ${r}`),[]}}async uploadAsset(t){for(let e=1;e<=10;e++)try{if(await this.uploadAssetOnce(t))return!0}catch(o){if(e<10){this.log(`\u26A0\uFE0F Upload attempt ${e} failed, retrying: ${t.relativePath}`);continue}return console.error(`\u274C Failed to upload asset ${t.relativePath} after 10 attempts: ${o}`),!1}return!1}async uploadAssetOnce(t){let e=JSON.stringify({query:`mutation UploadNoteAsset($input: UploadNoteAssetInput!) {
	uploadNoteAsset(input: $input) {
		... on ErrorPayload {
			__typename
			message
		}
		... on UploadNoteAssetPayload {
			__typename
			uploadSkipped
		}
	}
}`,variables:{input:{file:null,noteId:parseInt(t.noteId),sha256Hash:t.sha256Hash,path:t.relativePath,absolutePath:t.absolutePath}}}),o=JSON.stringify({0:["variables.input.file"]}),n=new FormData;n.append("operations",e),n.append("map",o),n.append("0",t.blob,t.fileName);let s=await fetch(this.apiUrl,{method:"POST",headers:{"X-API-Key":this.apiKey},body:n});if(!s.ok){let i=await s.text();throw new Error(`HTTP ${s.status}: ${s.statusText}
${i}`)}let l=await s.json();if(l.errors)throw new Error(l.errors[0]?.message||"Unknown GraphQL error");let p=l.data?.uploadNoteAsset;if(p?.__typename==="ErrorPayload")throw new Error(`Upload failed: ${p.message}`);return p?.uploadSkipped?this.log(`\u23E9 Asset skipped (already exists): ${t.relativePath}`):console.log(`\u2705 Asset uploaded: ${t.relativePath}`),!0}async downloadAsset(t){try{let r=await fetch(t);return r.ok?await r.arrayBuffer():(console.error(`\u274C Failed to download asset: HTTP ${r.status}`),null)}catch(r){return console.error(`\u274C Failed to download asset from ${t}: ${r}`),null}}async commitNotes(){try{let t=await this.sdk.CommitNotes();if("message"in t.commitNotes)throw new Error(`Commit failed: ${t.commitNotes.message}`);console.log("\u2705 Notes committed")}catch(t){console.error(`\u274C Failed to commit notes: ${t}`)}}async saveSyncState(t){let r=m.join(this.folder,k);t.lastSyncedAt=Date.now(),g.writeFileSync(r,JSON.stringify(t,null,2),"utf-8"),this.syncState=t}async computeBinaryHash(t){return M.createHash("sha256").update(Buffer.from(t)).digest("hex")}async resolveAssetPath(t,r){return U(this,t,r)}onProgress(t){this.verbose&&console.log(`  [${t.step}] ${t.current}/${t.total}: ${t.path??""}`)}async onConflict(t){if(this.conflictResolution==="fail"){console.error(`\u274C ${t.length} conflicts detected:`);for(let e of t)console.error(`   - ${e.path}`);throw new Error("Conflicts detected and --conflict-resolution=fail is set")}let r=this.cliToConflictResolution(this.conflictResolution);return console.log(`\u26A0\uFE0F ${t.length} conflicts detected, resolving with: ${this.conflictResolution}`),t.map(()=>r)}async onAssetConflict(t){if(this.conflictResolution==="fail"){console.error(`\u274C ${t.length} asset conflicts detected:`);for(let e of t)console.error(`   - ${e.path}`);throw new Error("Asset conflicts detected and --conflict-resolution=fail is set")}let r=this.cliToAssetConflictResolution(this.conflictResolution);return console.log(`\u26A0\uFE0F ${t.length} asset conflicts detected, resolving with: ${this.conflictResolution}`),t.map(()=>r)}cliToConflictResolution(t){switch(t){case"local":return"keep_local";case"remote":return"keep_remote";case"skip":return"skip";default:return"keep_local"}}cliToAssetConflictResolution(t){switch(t){case"local":return"keep_local";case"remote":return"keep_remote";case"skip":return"skip";default:return"keep_local"}}async onServerDeleted(t){return console.log(`\u26A0\uFE0F ${t.length} files deleted on server, keeping local copies`),!1}async confirmPush(t){return console.log(`\u{1F4E4} Pushing ${t.length} files...`),!0}injectMeta(t){if(Object.keys(this.meta).length===0)return t;if(t.startsWith("---")){let e=t.indexOf(`
---`,3);if(e!==-1){let o=t.slice(4,e),n=t.slice(e+4);for(let[s,l]of Object.entries(this.meta)){let p=new RegExp(`^${s}\\s*:.*$`,"m");p.test(o)?o=o.replace(p,`${s}: ${l}`):o=o.trimEnd()+`
${s}: ${l}`}return`---
${o}
---${n}`}}return`---
${Object.entries(this.meta).map(([e,o])=>`${e}: ${o}`).join(`
`)}
---
${t}`}hasPublishFieldInContent(t,r){if(!this.publishField||R(r))return!0;if(!t.startsWith("---"))return!1;let e=t.indexOf(`
---`,3);if(e===-1)return!1;let o=t.slice(4,e),n=this.publishField.split(",").map(s=>s.trim()).filter(s=>s);for(let s of n){let l=new RegExp(`^${s}\\s*:\\s*(.+)$`,"m"),p=o.match(l);if(p){let i=p[1].trim().toLowerCase();if(i==="true"||i==="yes"||i==="1"||i==='"true"'||i==="'true'")return!0}}return!1}};function J(a,t,r){return a===null&&t===null||a===t?"unchanged":a!==null&&t===null?r?"server_deleted":"local_only":a===null&&t!==null?r?"local_deleted":"remote_only":r?a===r?"pull":t===r?"push":"conflict":"conflict"}async function v(a){let t=a.getSyncState(),[r,e]=await Promise.all([a.getLocalFiles(),a.getServerHashes()]),o=new Map;for(let S of e)o.set(S.path,S.hash);let n=new Map,s=t.mtimes||{},l=t.localHashes||{};for(let S of r){let C=s[S.path],x=l[S.path];if(C===S.mtime&&x)n.set(S.path,x);else{let T=await a.readFileContent(S.path),N=await a.computeHash(T);n.set(S.path,N)}}let p=new Set([...n.keys(),...o.keys()]),i=[],u=[],c=[],d=[],h=[],y=[],A=[],b=[],B=0;for(let S of p){let C=n.get(S)||null,x=o.get(S)||null,T=t.files[S]||null,N=J(C,x,T),f={path:S,action:N,localHash:C,remoteHash:x,lastSyncedHash:T};switch(i.push(f),N){case"unchanged":B++;break;case"pull":u.push(f);break;case"push":c.push(f);break;case"conflict":d.push(f);break;case"local_only":h.push(f);break;case"remote_only":y.push(f);break;case"local_deleted":A.push(f);break;case"server_deleted":b.push(f);break}}return{classifications:i,pulls:u,pushes:c,conflicts:d,localOnly:h,remoteOnly:y,localDeleted:A,serverDeleted:b,unchanged:B}}function D(a,t){let{twoWaySync:r,hasPublishFields:e}=t,o=y=>e?e(y):!0,n=[],s=[],l=[],p=[],i=[],u=[],c=[],d=[],h=0;for(let y of a.classifications){let A=o(y.path);switch(y.action){case"unchanged":n.push(y),h++;break;case"pull":r&&A&&(n.push(y),s.push(y));break;case"push":A&&(n.push(y),l.push(y));break;case"conflict":if(r)A&&(n.push(y),p.push(y));else if(A){let b={...y,action:"push"};n.push(b),l.push(b)}break;case"local_only":A&&(n.push(y),i.push(y));break;case"remote_only":r&&(n.push(y),u.push(y));break;case"local_deleted":A&&(n.push(y),c.push(y));break;case"server_deleted":r&&(n.push(y),d.push(y));break}}return{classifications:n,pulls:s,pushes:l,conflicts:p,localOnly:i,remoteOnly:u,localDeleted:c,serverDeleted:d,unchanged:h}}async function H(a,t,r={twoWaySync:!1}){let e={pulled:0,pushed:0,conflictsResolved:0,assetsUploaded:0,assetsDownloaded:0,errors:[]},o=a.getSyncState(),n=[];if(t.pulls.length>0||t.remoteOnly.length>0){let i=[...t.pulls,...t.remoteOnly],u=await z(a,i,o);e.pulled=u.count,e.errors.push(...u.errors),n.push(...u.pulledPaths)}if(n.length>0){let i=await $(a,n);e.assetsDownloaded+=i.downloaded,e.errors.push(...i.errors)}if(r.twoWaySync){let i=t.classifications.filter(u=>u.action==="unchanged"&&u.remoteHash!==null).map(u=>u.path);if(i.length>0){let u=await $(a,i);e.assetsDownloaded+=u.downloaded,e.errors.push(...u.errors)}}if(t.serverDeleted.length>0&&await tt(a,t.serverDeleted,o),t.conflicts.length>0){let i=await X(a,t.conflicts,o);e.conflictsResolved=i.resolved,e.errors.push(...i.errors)}let s=[...t.pushes,...t.localOnly],l=[];if(s.length>0&&await a.confirmPush(s.map(u=>u.path))){let u=await Y(a,s,o);e.pushed=u.count,e.errors.push(...u.errors),l=u.pushedNotes}if(t.localDeleted.length>0&&await et(a,t.localDeleted,o),l.length>0){let i=await at(a,l,r.twoWaySync);e.assetsUploaded=i.uploaded,e.assetsDownloaded=i.downloaded,e.errors.push(...i.errors)}let p=t.classifications.filter(i=>i.action==="unchanged"&&i.remoteHash!==null).map(i=>i.path);if(p.length>0){let i=await ot(a,p);e.assetsUploaded+=i.uploaded,e.errors.push(...i.errors)}return(e.pushed>0||e.assetsUploaded>0)&&await a.commitNotes(),await a.saveSyncState(o),e}async function z(a,t,r){if(t.length===0)return{count:0,errors:[],pulledPaths:[]};let e=t.map(c=>c.path),o=[],n=[],s=0,l=await a.fetchNoteContents(e),p=new Map(l.map(c=>[c.path,c.content])),i=t.length,u=0;for(let c of t){u++,a.onProgress({step:"pull",current:u,total:i,path:c.path});let d=p.get(c.path);if(d===void 0){o.push(`Failed to fetch: ${c.path}`);continue}try{let h=c.path.substring(0,c.path.lastIndexOf("/"));h&&await a.createFolder(h),await a.writeFile(c.path,d);let y=await a.computeHash(d);r.files[c.path]=y,s++,n.push(c.path)}catch(h){o.push(`Failed to write ${c.path}: ${h}`)}}return{count:s,errors:o,pulledPaths:n}}async function Y(a,t,r){if(t.length===0)return{count:0,errors:[],pushedNotes:[]};let e=[],o=[],n=t.length,s=0;for(let h of t){s++,a.onProgress({step:"push",current:s,total:n,path:h.path});try{let y=await a.readFileContent(h.path);o.push({path:h.path,content:y})}catch(y){e.push(`Failed to read ${h.path}: ${y}`)}}if(o.length===0)return{count:0,errors:e,pushedNotes:[]};let l=new Set(o.map(h=>h.path)),p=a.pushBatchSize||100,i=[];for(let h=0;h<o.length;h+=p){let y=o.slice(h,h+p),A=await a.pushNotes(y,!0);i.push(...A)}let u=new Set(i.map(h=>h.path)),c=0;for(let h of o)if(u.has(h.path)){let y=await a.computeHash(h.content);r.files[h.path]=y,c++}let d=i.filter(h=>l.has(h.path));return{count:c,errors:e,pushedNotes:d}}async function X(a,t,r){if(t.length===0)return{resolved:0,errors:[]};let e=[],o=t.map(u=>u.path),n=await a.fetchNoteContents(o),s=new Map(n.map(u=>[u.path,u.content])),l=[];for(let u of t){let c=s.get(u.path);if(c!==void 0)try{let d=await a.readFileContent(u.path);l.push({path:u.path,localContent:d,remoteContent:c,localHash:u.localHash,remoteHash:u.remoteHash})}catch(d){console.warn(`Failed to read local file for conflict ${u.path}:`,d),e.push(`Failed to read local file for conflict: ${u.path}`)}}if(l.length===0)return{resolved:0,errors:e};let p=await a.onConflict(l),i=0;for(let u=0;u<l.length;u++){let c=l[u],d=p[u]||"skip";try{await Z(a,c,d,r),d!=="skip"&&i++}catch(h){e.push(`Failed to resolve conflict for ${c.path}: ${h}`)}}return{resolved:i,errors:e}}async function Z(a,t,r,e){switch(r){case"keep_local":await a.pushNotes([{path:t.path,content:t.localContent}],!0),e.files[t.path]=t.localHash;break;case"keep_remote":await a.writeFile(t.path,t.remoteContent),e.files[t.path]=t.remoteHash;break;case"keep_both":{let o=t.path.substring(t.path.lastIndexOf(".")),s=`${t.path.substring(0,t.path.lastIndexOf("."))} (server)${o}`;await a.writeFile(s,t.remoteContent),e.files[t.path]=t.localHash;let l=await a.computeHash(t.remoteContent);e.files[s]=l;break}case"skip":break}}async function tt(a,t,r){if(t.length===0)return;let e=t.map(n=>n.path);if(await a.onServerDeleted(e))for(let n of t)try{await a.deleteFile(n.path),delete r.files[n.path]}catch(s){console.warn(`Failed to delete file ${n.path}:`,s)}else for(let n of t)n.localHash&&(r.files[n.path]=n.localHash)}async function et(a,t,r){if(t.length===0)return;let e=t.map(o=>o.path);await a.hideNotes(e);for(let o of e)delete r.files[o]}async function at(a,t,r){console.log(`[Trip2g Sync] syncAssets called with ${t.length} notes, twoWaySync=${r}`);let e={uploaded:0,downloaded:0,conflictsResolved:0,errors:[]};if(t.length===0)return e;let o=[],n=[],s=[];for(let l of t)if(console.log(`[Trip2g Sync] Processing assets for note: ${l.path}, assets count: ${l.assets?.length??0}`),!(!l.assets||l.assets.length===0))for(let p of l.assets){let i=await a.resolveAssetPath(p.path,l.path);if(console.log(`[Trip2g Sync] Asset "${p.path}" -> localPath: ${i??"NOT FOUND"}, sha256Hash: ${p.sha256Hash??"null"}`),!i)continue;if(!p.sha256Hash||!p.absolutePath||!p.url){console.log(`[Trip2g Sync] Queuing upload: ${p.path} (no hash on server)`),o.push({noteId:l.id,notePath:l.path,asset:p,localPath:i});continue}if(await a.fileExists(i))try{let c=await a.readBinaryFile(i),d=await a.computeBinaryHash(c);if(d===p.sha256Hash)continue;s.push({path:p.path,absolutePath:i,noteId:l.id,localHash:d,remoteHash:p.sha256Hash,remoteUrl:p.url})}catch(c){e.errors.push(`Failed to read local asset ${i}: ${c}`)}else r&&n.push({asset:p,localPath:i})}if(console.log(`[Trip2g Sync] Assets to upload: ${o.length}, to download: ${n.length}, conflicts: ${s.length}`),o.length>0){let l=new Map;for(let c of o){let d=`${c.noteId}:${c.localPath}`;l.has(d)||l.set(d,c)}let p=Array.from(l.values()),i=p.length,u=0;console.log(`[Trip2g Sync] Uploading ${i} unique (note, asset) pairs`);for(let c of p){u++,console.log(`[Trip2g Sync] Uploading asset ${u}/${i}: ${c.localPath}`),a.onProgress({step:"upload_asset",current:u,total:i,path:c.asset.path});try{let d=await a.readBinaryFile(c.localPath),h=await a.computeBinaryHash(d),y=new Blob([d]),A=c.localPath.substring(c.localPath.lastIndexOf("/")+1);await a.uploadAsset({noteId:c.noteId,blob:y,fileName:A,relativePath:c.asset.path,absolutePath:c.localPath,sha256Hash:h})&&e.uploaded++}catch(d){e.errors.push(`Failed to upload asset ${c.asset.path}: ${d}`)}}}if(n.length>0){let l=n.length,p=0;for(let i of n)if(p++,a.onProgress({step:"download_asset",current:p,total:l,path:i.asset.path}),!!i.asset.url)try{let u=await a.downloadAsset(i.asset.url);if(!u){e.errors.push(`Failed to download asset ${i.asset.path}`);continue}let c=i.localPath.substring(0,i.localPath.lastIndexOf("/"));c&&await a.createFolder(c),await a.writeBinaryFile(i.localPath,u),e.downloaded++}catch(u){e.errors.push(`Failed to download asset ${i.asset.path}: ${u}`)}}if(s.length>0){let l=await rt(a,s,r);e.uploaded+=l.uploaded,e.downloaded+=l.downloaded,e.conflictsResolved=l.conflictsResolved,e.errors.push(...l.errors)}return e}async function rt(a,t,r){let e={uploaded:0,downloaded:0,conflictsResolved:0,errors:[]};if(t.length===0)return e;let o;r?o=await a.onAssetConflict(t):o=t.map(()=>"keep_local");for(let n=0;n<t.length;n++){let s=t[n],l=o[n]||"skip";try{if(l==="keep_local"){let p=await a.readBinaryFile(s.absolutePath),i=new Blob([p]),u=s.absolutePath.substring(s.absolutePath.lastIndexOf("/")+1);await a.uploadAsset({noteId:s.noteId,blob:i,fileName:u,relativePath:s.path,absolutePath:s.absolutePath,sha256Hash:s.localHash})&&(e.uploaded++,e.conflictsResolved++)}else if(l==="keep_remote"){let p=await a.downloadAsset(s.remoteUrl);p?(await a.writeBinaryFile(s.absolutePath,p),e.downloaded++,e.conflictsResolved++):e.errors.push(`Failed to download asset ${s.path}`)}}catch(p){e.errors.push(`Failed to resolve asset conflict for ${s.path}: ${p}`)}}return e}async function $(a,t){let r={downloaded:0,errors:[]};if(t.length===0)return r;let e=await a.fetchNoteAssets(t);if(e.length===0)return r;let o=new Map;for(let l of e)for(let p of l.assets){let i=p.absolutePath.replace(/^\//,"");o.has(i)||await a.fileExists(i)||o.set(i,{url:p.url,hash:p.hash})}if(o.size===0)return r;let n=o.size,s=0;for(let[l,{url:p}]of o){s++,a.onProgress({step:"download_asset",current:s,total:n,path:l});try{let i=await a.downloadAsset(p);if(!i){r.errors.push(`Failed to download asset ${l}`);continue}let u=l.substring(0,l.lastIndexOf("/"));u&&await a.createFolder(u),await a.writeBinaryFile(l,i),r.downloaded++}catch(i){r.errors.push(`Failed to download asset ${l}: ${i}`)}}return r}async function ot(a,t){let r={uploaded:0,errors:[]};if(t.length===0)return r;let e=await a.fetchNoteAssets(t);if(e.length===0)return r;let o=[];for(let l of e)for(let p of l.assets){let i=p.absolutePath?.replace(/^\//,"");if(!i&&p.id){let c=l.path.includes("/")?l.path.substring(0,l.path.lastIndexOf("/")):"",d=p.id.replace(/^\.\//,"");i=c?`${c}/${d}`:d}if(!(!i||!await a.fileExists(i)))try{let c=await a.readBinaryFile(i),d=await a.computeBinaryHash(c);if(d===p.hash)continue;o.push({noteId:l.noteId,notePath:l.path,assetPath:p.id,localPath:i,localHash:d})}catch(c){r.errors.push(`Failed to read local asset ${i}: ${c}`)}}if(o.length===0)return r;let n=o.length,s=0;for(let l of o){s++,a.onProgress({step:"upload_asset",current:s,total:n,path:l.assetPath});try{let p=await a.readBinaryFile(l.localPath),i=new Blob([p]),u=l.localPath.substring(l.localPath.lastIndexOf("/")+1);await a.uploadAsset({noteId:l.noteId,blob:i,fileName:u,relativePath:l.assetPath,absolutePath:l.localPath,sha256Hash:l.localHash})&&r.uploaded++}catch(p){r.errors.push(`Failed to upload asset ${l.assetPath}: ${p}`)}}return r}function nt(){let a=process.argv.slice(2),t={folder:"",prefix:"",apiUrl:process.env.ENDPOINT||"http://localhost:8081/graphql",apiKey:process.env.API_KEY||"",twoWaySync:!1,verbose:!1,dryRun:!1,conflictResolution:"local",meta:{}},r=[];for(let e=0;e<a.length;e++){let o=a[e],n;if(o.includes("=")&&o.startsWith("-")){let s=o.indexOf("=");n=o.substring(s+1),o=o.substring(0,s)}switch(o){case"--api-url":case"-u":t.apiUrl=n??a[++e];break;case"--api-key":case"-k":t.apiKey=n??a[++e];break;case"--two-way":case"-2":t.twoWaySync=!0;break;case"--verbose":case"-v":t.verbose=!0;break;case"--dry-run":case"-n":t.dryRun=!0;break;case"--conflict-resolution":case"-c":{let s=n??a[++e];s==="local"||s==="remote"||s==="skip"||s==="fail"?t.conflictResolution=s:(console.error(`\u274C Invalid conflict resolution: ${s}. Use: local, remote, skip, fail`),process.exit(1));break}case"--meta":case"-m":{let s=n??a[++e];if(s&&s.includes("=")){let l=s.indexOf("="),p=s.substring(0,l),i=s.substring(l+1);t.meta[p]=i}else console.error(`\u274C Invalid --meta format: ${s}. Use: --meta key=value`),process.exit(1);break}case"--help":case"-h":L(),process.exit(0);break;default:o.startsWith("-")||r.push(o)}}return r.length>=1&&(t.folder=r[0]),r.length>=2&&(t.prefix=r[1]),t}function L(){console.log(`
obsidian-sync CLI

Usage:
  npx ts-node src/sync/cli/cmd.ts [options] <folder> [prefix]

Arguments:
  folder                   Local folder to sync (required)
  prefix                   Remote path prefix (optional, for multi-repo setups)

Options:
  -u, --api-url <url>      GraphQL endpoint (default: $ENDPOINT or http://localhost:8081/graphql)
  -k, --api-key <key>      API key (default: $API_KEY)
  -2, --two-way            Enable two-way sync (pull changes from server)
  -c, --conflict-resolution <mode>
                           How to resolve conflicts (default: local)
                           - local:  Keep local version, push to server
                           - remote: Keep remote version, overwrite local
                           - skip:   Skip conflicting files
                           - fail:   Exit with error on first conflict
  -m, --meta <key=value>   Add/override frontmatter field for all files (can be repeated)
  -v, --verbose            Verbose output
  -n, --dry-run            Show what would be done without making changes
  -h, --help               Show this help

Environment Variables:
  ENDPOINT    GraphQL endpoint URL
  API_KEY     API key for authentication

Examples:
  # Push-only sync
  trip2g-sync ./vault --api-key xxx

  # Two-way sync
  trip2g-sync ./vault --api-key xxx --two-way

  # Multi-repo setup: each repo pushes to different folder with different meta
  trip2g-sync ./docs docs --meta subgraph=docs
  trip2g-sync ./blog blog --meta subgraph=blog
  trip2g-sync ./wiki wiki --meta subgraph=team-wiki
`)}async function st(){let a=nt();a.folder||(console.error("\u274C Error: --folder is required"),L(),process.exit(1)),a.apiKey||(console.error("\u274C Error: --api-key or API_KEY environment variable is required"),process.exit(1)),a.prefix&&a.twoWaySync&&(console.error("\u274C Error: prefix is not supported with --two-way sync"),process.exit(1)),console.log("=".repeat(60)),console.log("obsidian-sync CLI"),console.log("=".repeat(60)),console.log(`Folder:     ${a.folder}`),a.prefix&&console.log(`Prefix:     ${a.prefix}`),console.log(`API URL:    ${a.apiUrl}`),console.log(`Two-way:    ${a.twoWaySync}`),console.log(`Conflicts:  ${a.conflictResolution}`),console.log(`Dry run:    ${a.dryRun}`),Object.keys(a.meta).length>0&&console.log(`Meta:       ${JSON.stringify(a.meta)}`),console.log("=".repeat(60));let t=new w({folder:a.folder,prefix:a.prefix,apiUrl:a.apiUrl,apiKey:a.apiKey,twoWaySync:a.twoWaySync,verbose:a.verbose,conflictResolution:a.conflictResolution,meta:a.meta});console.log(`
\u{1F4CA} Classifying files...`);let r=await v(t),e=D(r,{twoWaySync:a.twoWaySync});if(console.log(`
\u{1F4CB} Sync Plan:`),console.log("-".repeat(40)),console.log(`  Unchanged:      ${e.unchanged}`),console.log(`  To push:        ${e.pushes.length}`),console.log(`  Local only:     ${e.localOnly.length}`),console.log(`  To pull:        ${e.pulls.length}`),console.log(`  Remote only:    ${e.remoteOnly.length}`),console.log(`  Conflicts:      ${e.conflicts.length}`),console.log(`  Local deleted:  ${e.localDeleted.length}`),console.log(`  Server deleted: ${e.serverDeleted.length}`),console.log("-".repeat(40)),a.verbose){if(e.pushes.length>0){console.log(`
\u{1F4E4} Files to push:`);for(let s of e.pushes)console.log(`  ${s.path}`)}if(e.localOnly.length>0){console.log(`
\u{1F195} New local files:`);for(let s of e.localOnly)console.log(`  ${s.path}`)}if(e.pulls.length>0){console.log(`
\u{1F4E5} Files to pull:`);for(let s of e.pulls)console.log(`  ${s.path}`)}if(e.remoteOnly.length>0){console.log(`
\u{1F310} New remote files:`);for(let s of e.remoteOnly)console.log(`  ${s.path}`)}if(e.localDeleted.length>0){console.log(`
\u{1F5D1}\uFE0F To hide on server:`);for(let s of e.localDeleted)console.log(`  ${s.path}`)}}if(a.dryRun){console.log(`
\u23F8\uFE0F Dry run - no changes made`);return}let o=e.pushes.length+e.localOnly.length+e.pulls.length+e.remoteOnly.length+e.conflicts.length+e.localDeleted.length+e.serverDeleted.length;console.log(`
\u{1F680} Executing sync...`);let n=await H(t,e,{twoWaySync:a.twoWaySync});if(o===0&&n.assetsUploaded===0&&n.assetsDownloaded===0){console.log(`
\u2705 Everything is up to date!`);return}if(console.log(`
`+"=".repeat(60)),console.log("\u{1F4CA} SYNC RESULTS:"),console.log("=".repeat(60)),console.log(`  Pushed:             ${n.pushed}`),console.log(`  Pulled:             ${n.pulled}`),console.log(`  Conflicts resolved: ${n.conflictsResolved}`),console.log(`  Assets uploaded:    ${n.assetsUploaded}`),console.log(`  Assets downloaded:  ${n.assetsDownloaded}`),n.errors.length>0){console.log(`  Errors:             ${n.errors.length}`);for(let s of n.errors)console.log(`    \u274C ${s}`)}console.log("=".repeat(60))}st().catch(a=>{console.error("\u274C Fatal error:",a),process.exit(1)});
