#!/usr/bin/env node
import*as g from"fs";import*as m from"path";import*as M from"crypto";function R(r){return!!(r.startsWith("_layouts/")&&(r.endsWith(".html")||r.endsWith(".html.json")))}import*as I from"path";function U(r,t,a){if(t.startsWith("./")){let o=I.dirname(a),i=I.join(o,t.slice(2));return r.fileExistsSync(i)?i:null}if(t.startsWith("/")){let o=t.slice(1);return r.fileExistsSync(o)?o:null}if(t.includes("/"))return r.fileExistsSync(t)?t:null;if(r.fileExistsSync(t))return t;let e=I.posix.join("assets",t);if(r.fileExistsSync(e))return e;let n=I.dirname(a);if(n&&n!=="."){let o=I.posix.join(n,t);if(r.fileExistsSync(o))return o}return null}var E=class{constructor(t,a={}){this.url=t;this.options=a}async request(t){let a=typeof t.document=="string"?t.document:t.document.loc?.source.body;if(!a)throw new Error("Invalid GraphQL document: no query string found");let e=await fetch(this.url,{method:"POST",headers:{"Content-Type":"application/json",...this.options.headers,...t.requestHeaders},body:JSON.stringify({query:a,variables:t.variables}),signal:t.signal});if(!e.ok)throw new Error(`HTTP ${e.status}: ${e.statusText}`);let n=await e.json();if(n.errors?.length)throw new Error(`GraphQL Error: ${n.errors[0].message}`);if(!n.data)throw new Error("GraphQL response missing data");return n.data}};function P(r,...t){let a=r[0];for(let e=0;e<t.length;e++)a+=String(t[e])+r[e+1];return{loc:{source:{body:a}}}}var Q=P`
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
    `,_=P`
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
    `,W=(r,t,a,e)=>r();function O(r,t=W){return{FetchServerHashes(a,e,n){return t(o=>r.request({document:Q,variables:a,requestHeaders:{...e,...o},signal:n}),"FetchServerHashes","query",a)},FetchNoteContents(a,e,n){return t(o=>r.request({document:q,variables:a,requestHeaders:{...e,...o},signal:n}),"FetchNoteContents","query",a)},FetchNoteAssets(a,e,n){return t(o=>r.request({document:V,variables:a,requestHeaders:{...e,...o},signal:n}),"FetchNoteAssets","query",a)},PushNotes(a,e,n){return t(o=>r.request({document:K,variables:a,requestHeaders:{...e,...o},signal:n}),"PushNotes","mutation",a)},HideNotes(a,e,n){return t(o=>r.request({document:G,variables:a,requestHeaders:{...e,...o},signal:n}),"HideNotes","mutation",a)},UploadNoteAsset(a,e,n){return t(o=>r.request({document:j,variables:a,requestHeaders:{...e,...o},signal:n}),"UploadNoteAsset","mutation",a)},CommitNotes(a,e,n){return t(o=>r.request({document:_,variables:a,requestHeaders:{...e,...o},signal:n}),"CommitNotes","mutation",a)}}}function F(r){let t=new E(r.apiUrl,{headers:{"X-API-Key":r.apiKey}});return O(t)}var k=".sync-state.json",w=class{constructor(t){this.pushBatchSize=100;this.folder=m.resolve(t.folder),this.twoWaySync=t.twoWaySync,this.verbose=t.verbose??!1,this.conflictResolution=t.conflictResolution??"local",this.publishField=t.publishField??"",this.meta=t.meta??{},this.syncState=this.loadSyncState(),this.apiUrl=t.apiUrl,this.apiKey=t.apiKey,this.sdk=F({apiUrl:t.apiUrl,apiKey:t.apiKey})}loadSyncState(){let t=m.join(this.folder,k);try{if(g.existsSync(t)){let a=g.readFileSync(t,"utf-8");return JSON.parse(a)}}catch(a){this.log(`Warning: Could not load sync state: ${a}`)}return{files:{}}}log(t){this.verbose&&console.log(t)}async getLocalFiles(){let t=[],a=e=>{let n=g.readdirSync(e,{withFileTypes:!0});for(let o of n){if(o.name.startsWith(".")||o.name==="node_modules")continue;let i=m.join(e,o.name);if(o.isDirectory())a(i);else if(o.isFile()){let l=m.extname(o.name).toLowerCase();if(l===".md"||l===".html"||o.name.endsWith(".html.json")){let p=g.statSync(i),s=m.relative(this.folder,i);t.push({path:s,mtime:p.mtimeMs})}}}};return a(this.folder),t}async getServerHashes(){try{return(await this.sdk.FetchServerHashes()).notePaths.map(a=>({path:a.path,hash:a.hash}))}catch(t){return console.error(`\u274C Failed to fetch server hashes: ${t}`),[]}}getSyncState(){return this.syncState}async computeHash(t){return M.createHash("sha256").update(t,"utf-8").digest().toString("base64").replace(/\+/g,"-").replace(/\//g,"_")}async readFileContent(t){let a=m.join(this.folder,t);return g.readFileSync(a,"utf-8")}async writeFile(t,a){let e=m.join(this.folder,t);g.writeFileSync(e,a,"utf-8")}async writeBinaryFile(t,a){let e=m.join(this.folder,t);g.writeFileSync(e,Buffer.from(a))}async readBinaryFile(t){let a=m.join(this.folder,t),e=g.readFileSync(a);return e.buffer.slice(e.byteOffset,e.byteOffset+e.byteLength)}async deleteFile(t){let a=m.join(this.folder,t);g.existsSync(a)&&g.unlinkSync(a)}async createFolder(t){let a=m.join(this.folder,t);g.mkdirSync(a,{recursive:!0})}async fileExists(t){return this.fileExistsSync(t)}fileExistsSync(t){let a=m.join(this.folder,t);return g.existsSync(a)}async pushNotes(t,a){if(t.length===0)return[];let e=t.map(n=>({path:n.path,content:this.injectMeta(n.content)}));if(this.publishField){for(let n of e)if(!this.hasPublishFieldInContent(n.content,n.path))throw new Error(`[Security] Attempted to push note "${n.path}" without publish field "${this.publishField}". This is a bug in the sync logic - please report it.`)}try{let n=await this.sdk.PushNotes({input:{updates:e.map(o=>({path:o.path,content:o.content})),skipCommit:a}});if("message"in n.pushNotes)throw new Error(`Push failed: ${n.pushNotes.message}`);return console.log(`\u2705 Pushed ${t.length} notes`),n.pushNotes.notes.map(o=>({id:String(o.id),path:o.path,assets:o.assets.map(i=>({path:i.path,sha256Hash:i.sha256Hash??null,absolutePath:i.absolutePath??null,url:i.url??null}))}))}catch(n){return console.error(`\u274C Failed to push notes: ${n}`),[]}}async hideNotes(t){if(t.length!==0)try{let a=await this.sdk.HideNotes({input:{paths:t}});if("message"in a.hideNotes)throw new Error(`Hide failed: ${a.hideNotes.message}`);console.log(`\u2705 Hidden ${t.length} notes`)}catch(a){console.error(`\u274C Failed to hide notes: ${a}`)}}async fetchNoteContents(t){if(t.length===0)return[];try{return(await this.sdk.FetchNoteContents({filter:{paths:t}})).notePaths.map(e=>({path:e.path,content:e.content}))}catch(a){return console.error(`\u274C Failed to fetch note contents: ${a}`),[]}}async fetchNoteAssets(t){if(t.length===0)return[];try{let a=await this.sdk.PushNotes({input:{updates:[]}});if("message"in a.pushNotes)return console.error(`\u274C Failed to fetch note assets: ${a.pushNotes.message}`),[];let e=new Set(t);return a.pushNotes.notes.filter(n=>e.has(n.path)).map(n=>({path:n.path,noteId:String(n.id),assets:n.assets.map(o=>({id:o.path,url:o.url,hash:o.sha256Hash??"",absolutePath:o.absolutePath}))}))}catch(a){return console.error(`\u274C Failed to fetch note assets: ${a}`),[]}}async uploadAsset(t){for(let e=1;e<=10;e++)try{if(await this.uploadAssetOnce(t))return!0}catch(n){if(e<10){this.log(`\u26A0\uFE0F Upload attempt ${e} failed, retrying: ${t.relativePath}`);continue}return console.error(`\u274C Failed to upload asset ${t.relativePath} after 10 attempts: ${n}`),!1}return!1}async uploadAssetOnce(t){let e=JSON.stringify({query:`mutation UploadNoteAsset($input: UploadNoteAssetInput!) {
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
}`,variables:{input:{file:null,noteId:parseInt(t.noteId),sha256Hash:t.sha256Hash,path:t.relativePath,absolutePath:t.absolutePath}}}),n=JSON.stringify({0:["variables.input.file"]}),o=new FormData;o.append("operations",e),o.append("map",n),o.append("0",t.blob,t.fileName);let i=await fetch(this.apiUrl,{method:"POST",headers:{"X-API-Key":this.apiKey},body:o});if(!i.ok){let s=await i.text();throw new Error(`HTTP ${i.status}: ${i.statusText}
${s}`)}let l=await i.json();if(l.errors)throw new Error(l.errors[0]?.message||"Unknown GraphQL error");let p=l.data?.uploadNoteAsset;if(p?.__typename==="ErrorPayload")throw new Error(`Upload failed: ${p.message}`);return p?.uploadSkipped?this.log(`\u23E9 Asset skipped (already exists): ${t.relativePath}`):console.log(`\u2705 Asset uploaded: ${t.relativePath}`),!0}async downloadAsset(t){try{let a=await fetch(t);return a.ok?await a.arrayBuffer():(console.error(`\u274C Failed to download asset: HTTP ${a.status}`),null)}catch(a){return console.error(`\u274C Failed to download asset from ${t}: ${a}`),null}}async commitNotes(){try{let t=await this.sdk.CommitNotes();if("message"in t.commitNotes)throw new Error(`Commit failed: ${t.commitNotes.message}`);console.log("\u2705 Notes committed")}catch(t){console.error(`\u274C Failed to commit notes: ${t}`)}}async saveSyncState(t){let a=m.join(this.folder,k);t.lastSyncedAt=Date.now(),g.writeFileSync(a,JSON.stringify(t,null,2),"utf-8"),this.syncState=t}async computeBinaryHash(t){return M.createHash("sha256").update(Buffer.from(t)).digest("hex")}async resolveAssetPath(t,a){return U(this,t,a)}onProgress(t){this.verbose&&console.log(`  [${t.step}] ${t.current}/${t.total}: ${t.path??""}`)}async onConflict(t){if(this.conflictResolution==="fail"){console.error(`\u274C ${t.length} conflicts detected:`);for(let e of t)console.error(`   - ${e.path}`);throw new Error("Conflicts detected and --conflict-resolution=fail is set")}let a=this.cliToConflictResolution(this.conflictResolution);return console.log(`\u26A0\uFE0F ${t.length} conflicts detected, resolving with: ${this.conflictResolution}`),t.map(()=>a)}async onAssetConflict(t){if(this.conflictResolution==="fail"){console.error(`\u274C ${t.length} asset conflicts detected:`);for(let e of t)console.error(`   - ${e.path}`);throw new Error("Asset conflicts detected and --conflict-resolution=fail is set")}let a=this.cliToAssetConflictResolution(this.conflictResolution);return console.log(`\u26A0\uFE0F ${t.length} asset conflicts detected, resolving with: ${this.conflictResolution}`),t.map(()=>a)}cliToConflictResolution(t){switch(t){case"local":return"keep_local";case"remote":return"keep_remote";case"skip":return"skip";default:return"keep_local"}}cliToAssetConflictResolution(t){switch(t){case"local":return"keep_local";case"remote":return"keep_remote";case"skip":return"skip";default:return"keep_local"}}async onServerDeleted(t){return console.log(`\u26A0\uFE0F ${t.length} files deleted on server, keeping local copies`),!1}async confirmPush(t){return console.log(`\u{1F4E4} Pushing ${t.length} files...`),!0}injectMeta(t){if(Object.keys(this.meta).length===0)return t;if(t.startsWith("---")){let e=t.indexOf(`
---`,3);if(e!==-1){let n=t.slice(4,e),o=t.slice(e+4);for(let[i,l]of Object.entries(this.meta)){let p=new RegExp(`^${i}\\s*:.*$`,"m");p.test(n)?n=n.replace(p,`${i}: ${l}`):n=n.trimEnd()+`
${i}: ${l}`}return`---
${n}
---${o}`}}return`---
${Object.entries(this.meta).map(([e,n])=>`${e}: ${n}`).join(`
`)}
---
${t}`}hasPublishFieldInContent(t,a){if(!this.publishField||R(a))return!0;if(!t.startsWith("---"))return!1;let e=t.indexOf(`
---`,3);if(e===-1)return!1;let n=t.slice(4,e),o=this.publishField.split(",").map(i=>i.trim()).filter(i=>i);for(let i of o){let l=new RegExp(`^${i}\\s*:\\s*(.+)$`,"m"),p=n.match(l);if(p){let s=p[1].trim().toLowerCase();if(s==="true"||s==="yes"||s==="1"||s==='"true"'||s==="'true'")return!0}}return!1}};function J(r,t,a){return r===null&&t===null||r===t?"unchanged":r!==null&&t===null?a?"server_deleted":"local_only":r===null&&t!==null?a?"local_deleted":"remote_only":a?r===a?"pull":t===a?"push":"conflict":"conflict"}async function v(r){let t=r.getSyncState(),[a,e]=await Promise.all([r.getLocalFiles(),r.getServerHashes()]),n=new Map;for(let S of e)n.set(S.path,S.hash);let o=new Map,i=t.mtimes||{},l=t.localHashes||{};for(let S of a){let x=i[S.path],C=l[S.path];if(x===S.mtime&&C)o.set(S.path,C);else{let T=await r.readFileContent(S.path),N=await r.computeHash(T);o.set(S.path,N)}}let p=new Set([...o.keys(),...n.keys()]),s=[],u=[],c=[],d=[],h=[],y=[],A=[],b=[],B=0;for(let S of p){let x=o.get(S)||null,C=n.get(S)||null,T=t.files[S]||null,N=J(x,C,T),f={path:S,action:N,localHash:x,remoteHash:C,lastSyncedHash:T};switch(s.push(f),N){case"unchanged":B++;break;case"pull":u.push(f);break;case"push":c.push(f);break;case"conflict":d.push(f);break;case"local_only":h.push(f);break;case"remote_only":y.push(f);break;case"local_deleted":A.push(f);break;case"server_deleted":b.push(f);break}}return{classifications:s,pulls:u,pushes:c,conflicts:d,localOnly:h,remoteOnly:y,localDeleted:A,serverDeleted:b,unchanged:B}}function D(r,t){let{twoWaySync:a,hasPublishFields:e}=t,n=y=>e?e(y):!0,o=[],i=[],l=[],p=[],s=[],u=[],c=[],d=[],h=0;for(let y of r.classifications){let A=n(y.path);switch(y.action){case"unchanged":o.push(y),h++;break;case"pull":a&&A&&(o.push(y),i.push(y));break;case"push":A&&(o.push(y),l.push(y));break;case"conflict":if(a)A&&(o.push(y),p.push(y));else if(A){let b={...y,action:"push"};o.push(b),l.push(b)}break;case"local_only":A&&(o.push(y),s.push(y));break;case"remote_only":a&&(o.push(y),u.push(y));break;case"local_deleted":A&&(o.push(y),c.push(y));break;case"server_deleted":a&&(o.push(y),d.push(y));break}}return{classifications:o,pulls:i,pushes:l,conflicts:p,localOnly:s,remoteOnly:u,localDeleted:c,serverDeleted:d,unchanged:h}}async function H(r,t,a={twoWaySync:!1}){let e={pulled:0,pushed:0,conflictsResolved:0,assetsUploaded:0,assetsDownloaded:0,errors:[]},n=r.getSyncState(),o=[];if(t.pulls.length>0||t.remoteOnly.length>0){let s=[...t.pulls,...t.remoteOnly],u=await z(r,s,n);e.pulled=u.count,e.errors.push(...u.errors),o.push(...u.pulledPaths)}if(o.length>0){let s=await $(r,o);e.assetsDownloaded+=s.downloaded,e.errors.push(...s.errors)}if(a.twoWaySync){let s=t.classifications.filter(u=>u.action==="unchanged"&&u.remoteHash!==null).map(u=>u.path);if(s.length>0){let u=await $(r,s);e.assetsDownloaded+=u.downloaded,e.errors.push(...u.errors)}}if(t.serverDeleted.length>0&&await tt(r,t.serverDeleted,n),t.conflicts.length>0){let s=await X(r,t.conflicts,n);e.conflictsResolved=s.resolved,e.errors.push(...s.errors)}let i=[...t.pushes,...t.localOnly],l=[];if(i.length>0&&await r.confirmPush(i.map(u=>u.path))){let u=await Y(r,i,n);e.pushed=u.count,e.errors.push(...u.errors),l=u.pushedNotes}if(t.localDeleted.length>0&&await et(r,t.localDeleted,n),l.length>0){let s=await at(r,l,a.twoWaySync);e.assetsUploaded=s.uploaded,e.assetsDownloaded=s.downloaded,e.errors.push(...s.errors)}let p=t.classifications.filter(s=>s.action==="unchanged"&&s.remoteHash!==null).map(s=>s.path);if(p.length>0){let s=await ot(r,p);e.assetsUploaded+=s.uploaded,e.errors.push(...s.errors)}return(e.pushed>0||e.assetsUploaded>0)&&await r.commitNotes(),await r.saveSyncState(n),e}async function z(r,t,a){if(t.length===0)return{count:0,errors:[],pulledPaths:[]};let e=t.map(c=>c.path),n=[],o=[],i=0,l=await r.fetchNoteContents(e),p=new Map(l.map(c=>[c.path,c.content])),s=t.length,u=0;for(let c of t){u++,r.onProgress({step:"pull",current:u,total:s,path:c.path});let d=p.get(c.path);if(d===void 0){n.push(`Failed to fetch: ${c.path}`);continue}try{let h=c.path.substring(0,c.path.lastIndexOf("/"));h&&await r.createFolder(h),await r.writeFile(c.path,d);let y=await r.computeHash(d);a.files[c.path]=y,i++,o.push(c.path)}catch(h){n.push(`Failed to write ${c.path}: ${h}`)}}return{count:i,errors:n,pulledPaths:o}}async function Y(r,t,a){if(t.length===0)return{count:0,errors:[],pushedNotes:[]};let e=[],n=[],o=t.length,i=0;for(let h of t){i++,r.onProgress({step:"push",current:i,total:o,path:h.path});try{let y=await r.readFileContent(h.path);n.push({path:h.path,content:y})}catch(y){e.push(`Failed to read ${h.path}: ${y}`)}}if(n.length===0)return{count:0,errors:e,pushedNotes:[]};let l=new Set(n.map(h=>h.path)),p=r.pushBatchSize||100,s=[];for(let h=0;h<n.length;h+=p){let y=n.slice(h,h+p),A=await r.pushNotes(y,!0);s.push(...A)}let u=new Set(s.map(h=>h.path)),c=0;for(let h of n)if(u.has(h.path)){let y=await r.computeHash(h.content);a.files[h.path]=y,c++}let d=s.filter(h=>l.has(h.path));return{count:c,errors:e,pushedNotes:d}}async function X(r,t,a){if(t.length===0)return{resolved:0,errors:[]};let e=[],n=t.map(u=>u.path),o=await r.fetchNoteContents(n),i=new Map(o.map(u=>[u.path,u.content])),l=[];for(let u of t){let c=i.get(u.path);if(c!==void 0)try{let d=await r.readFileContent(u.path);l.push({path:u.path,localContent:d,remoteContent:c,localHash:u.localHash,remoteHash:u.remoteHash})}catch(d){console.warn(`Failed to read local file for conflict ${u.path}:`,d),e.push(`Failed to read local file for conflict: ${u.path}`)}}if(l.length===0)return{resolved:0,errors:e};let p=await r.onConflict(l),s=0;for(let u=0;u<l.length;u++){let c=l[u],d=p[u]||"skip";try{await Z(r,c,d,a),d!=="skip"&&s++}catch(h){e.push(`Failed to resolve conflict for ${c.path}: ${h}`)}}return{resolved:s,errors:e}}async function Z(r,t,a,e){switch(a){case"keep_local":await r.pushNotes([{path:t.path,content:t.localContent}],!0),e.files[t.path]=t.localHash;break;case"keep_remote":await r.writeFile(t.path,t.remoteContent),e.files[t.path]=t.remoteHash;break;case"keep_both":{let n=t.path.substring(t.path.lastIndexOf(".")),i=`${t.path.substring(0,t.path.lastIndexOf("."))} (server)${n}`;await r.writeFile(i,t.remoteContent),e.files[t.path]=t.localHash;let l=await r.computeHash(t.remoteContent);e.files[i]=l;break}case"skip":break}}async function tt(r,t,a){if(t.length===0)return;let e=t.map(o=>o.path);if(await r.onServerDeleted(e))for(let o of t)try{await r.deleteFile(o.path),delete a.files[o.path]}catch(i){console.warn(`Failed to delete file ${o.path}:`,i)}else for(let o of t)o.localHash&&(a.files[o.path]=o.localHash)}async function et(r,t,a){if(t.length===0)return;let e=t.map(n=>n.path);await r.hideNotes(e);for(let n of e)delete a.files[n]}async function at(r,t,a){console.log(`[Trip2g Sync] syncAssets called with ${t.length} notes, twoWaySync=${a}`);let e={uploaded:0,downloaded:0,conflictsResolved:0,errors:[]};if(t.length===0)return e;let n=[],o=[],i=[];for(let l of t)if(console.log(`[Trip2g Sync] Processing assets for note: ${l.path}, assets count: ${l.assets?.length??0}`),!(!l.assets||l.assets.length===0))for(let p of l.assets){let s=await r.resolveAssetPath(p.path,l.path);if(console.log(`[Trip2g Sync] Asset "${p.path}" -> localPath: ${s??"NOT FOUND"}, sha256Hash: ${p.sha256Hash??"null"}`),!s)continue;if(!p.sha256Hash||!p.absolutePath||!p.url){console.log(`[Trip2g Sync] Queuing upload: ${p.path} (no hash on server)`),n.push({noteId:l.id,notePath:l.path,asset:p,localPath:s});continue}if(await r.fileExists(s))try{let c=await r.readBinaryFile(s),d=await r.computeBinaryHash(c);if(d===p.sha256Hash)continue;i.push({path:p.path,absolutePath:s,noteId:l.id,localHash:d,remoteHash:p.sha256Hash,remoteUrl:p.url})}catch(c){e.errors.push(`Failed to read local asset ${s}: ${c}`)}else a&&o.push({asset:p,localPath:s})}if(console.log(`[Trip2g Sync] Assets to upload: ${n.length}, to download: ${o.length}, conflicts: ${i.length}`),n.length>0){let l=new Map;for(let c of n){let d=`${c.noteId}:${c.localPath}`;l.has(d)||l.set(d,c)}let p=Array.from(l.values()),s=p.length,u=0;console.log(`[Trip2g Sync] Uploading ${s} unique (note, asset) pairs`);for(let c of p){u++,console.log(`[Trip2g Sync] Uploading asset ${u}/${s}: ${c.localPath}`),r.onProgress({step:"upload_asset",current:u,total:s,path:c.asset.path});try{let d=await r.readBinaryFile(c.localPath),h=await r.computeBinaryHash(d),y=new Blob([d]),A=c.localPath.substring(c.localPath.lastIndexOf("/")+1);await r.uploadAsset({noteId:c.noteId,blob:y,fileName:A,relativePath:c.asset.path,absolutePath:c.localPath,sha256Hash:h})&&e.uploaded++}catch(d){e.errors.push(`Failed to upload asset ${c.asset.path}: ${d}`)}}}if(o.length>0){let l=o.length,p=0;for(let s of o)if(p++,r.onProgress({step:"download_asset",current:p,total:l,path:s.asset.path}),!!s.asset.url)try{let u=await r.downloadAsset(s.asset.url);if(!u){e.errors.push(`Failed to download asset ${s.asset.path}`);continue}let c=s.localPath.substring(0,s.localPath.lastIndexOf("/"));c&&await r.createFolder(c),await r.writeBinaryFile(s.localPath,u),e.downloaded++}catch(u){e.errors.push(`Failed to download asset ${s.asset.path}: ${u}`)}}if(i.length>0){let l=await rt(r,i,a);e.uploaded+=l.uploaded,e.downloaded+=l.downloaded,e.conflictsResolved=l.conflictsResolved,e.errors.push(...l.errors)}return e}async function rt(r,t,a){let e={uploaded:0,downloaded:0,conflictsResolved:0,errors:[]};if(t.length===0)return e;let n;a?n=await r.onAssetConflict(t):n=t.map(()=>"keep_local");for(let o=0;o<t.length;o++){let i=t[o],l=n[o]||"skip";try{if(l==="keep_local"){let p=await r.readBinaryFile(i.absolutePath),s=new Blob([p]),u=i.absolutePath.substring(i.absolutePath.lastIndexOf("/")+1);await r.uploadAsset({noteId:i.noteId,blob:s,fileName:u,relativePath:i.path,absolutePath:i.absolutePath,sha256Hash:i.localHash})&&(e.uploaded++,e.conflictsResolved++)}else if(l==="keep_remote"){let p=await r.downloadAsset(i.remoteUrl);p?(await r.writeBinaryFile(i.absolutePath,p),e.downloaded++,e.conflictsResolved++):e.errors.push(`Failed to download asset ${i.path}`)}}catch(p){e.errors.push(`Failed to resolve asset conflict for ${i.path}: ${p}`)}}return e}async function $(r,t){let a={downloaded:0,errors:[]};if(t.length===0)return a;let e=await r.fetchNoteAssets(t);if(e.length===0)return a;let n=new Map;for(let l of e)for(let p of l.assets){let s=p.absolutePath.replace(/^\//,"");n.has(s)||await r.fileExists(s)||n.set(s,{url:p.url,hash:p.hash})}if(n.size===0)return a;let o=n.size,i=0;for(let[l,{url:p}]of n){i++,r.onProgress({step:"download_asset",current:i,total:o,path:l});try{let s=await r.downloadAsset(p);if(!s){a.errors.push(`Failed to download asset ${l}`);continue}let u=l.substring(0,l.lastIndexOf("/"));u&&await r.createFolder(u),await r.writeBinaryFile(l,s),a.downloaded++}catch(s){a.errors.push(`Failed to download asset ${l}: ${s}`)}}return a}async function ot(r,t){let a={uploaded:0,errors:[]};if(t.length===0)return a;let e=await r.fetchNoteAssets(t);if(e.length===0)return a;let n=[];for(let l of e)for(let p of l.assets){let s=p.absolutePath?.replace(/^\//,"");if(!s&&p.id){let c=l.path.includes("/")?l.path.substring(0,l.path.lastIndexOf("/")):"",d=p.id.replace(/^\.\//,"");s=c?`${c}/${d}`:d}if(!(!s||!await r.fileExists(s)))try{let c=await r.readBinaryFile(s),d=await r.computeBinaryHash(c);if(d===p.hash)continue;n.push({noteId:l.noteId,notePath:l.path,assetPath:p.id,localPath:s,localHash:d})}catch(c){a.errors.push(`Failed to read local asset ${s}: ${c}`)}}if(n.length===0)return a;let o=n.length,i=0;for(let l of n){i++,r.onProgress({step:"upload_asset",current:i,total:o,path:l.assetPath});try{let p=await r.readBinaryFile(l.localPath),s=new Blob([p]),u=l.localPath.substring(l.localPath.lastIndexOf("/")+1);await r.uploadAsset({noteId:l.noteId,blob:s,fileName:u,relativePath:l.assetPath,absolutePath:l.localPath,sha256Hash:l.localHash})&&a.uploaded++}catch(p){a.errors.push(`Failed to upload asset ${l.assetPath}: ${p}`)}}return a}function nt(){let r=process.argv.slice(2),t={folder:"",apiUrl:process.env.ENDPOINT||"http://localhost:8081/graphql",apiKey:process.env.API_KEY||"",twoWaySync:!1,verbose:!1,dryRun:!1,conflictResolution:"local",meta:{}};for(let a=0;a<r.length;a++){let e=r[a],n;if(e.includes("=")){let o=e.indexOf("=");n=e.substring(o+1),e=e.substring(0,o)}switch(e){case"--folder":case"-f":t.folder=n??r[++a];break;case"--api-url":case"-u":t.apiUrl=n??r[++a];break;case"--api-key":case"-k":t.apiKey=n??r[++a];break;case"--two-way":case"-2":t.twoWaySync=!0;break;case"--verbose":case"-v":t.verbose=!0;break;case"--dry-run":case"-n":t.dryRun=!0;break;case"--conflict-resolution":case"-c":{let o=n??r[++a];o==="local"||o==="remote"||o==="skip"||o==="fail"?t.conflictResolution=o:(console.error(`\u274C Invalid conflict resolution: ${o}. Use: local, remote, skip, fail`),process.exit(1));break}case"--meta":case"-m":{let o=n??r[++a];if(o&&o.includes("=")){let i=o.indexOf("="),l=o.substring(0,i),p=o.substring(i+1);t.meta[l]=p}else console.error(`\u274C Invalid --meta format: ${o}. Use: --meta key=value`),process.exit(1);break}case"--help":case"-h":L(),process.exit(0);break;default:!t.folder&&!e.startsWith("-")&&(t.folder=e)}}return t}function L(){console.log(`
obsidian-sync CLI

Usage:
  npx ts-node src/sync/cli/cmd.ts [options] [folder]

Options:
  -f, --folder <path>      Folder to sync (required)
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
                           Useful for multi-repo setups with different subgraphs
  -v, --verbose            Verbose output
  -n, --dry-run            Show what would be done without making changes
  -h, --help               Show this help

Environment Variables:
  ENDPOINT    GraphQL endpoint URL
  API_KEY     API key for authentication

Examples:
  # Push-only sync (like push_notes.py)
  npx ts-node src/sync/cli/cmd.ts --folder ./vault --api-key xxx

  # Two-way sync
  npx ts-node src/sync/cli/cmd.ts --folder ./vault --api-key xxx --two-way

  # Two-way sync, fail on conflicts (for CI)
  npx ts-node src/sync/cli/cmd.ts --folder ./vault --api-key xxx --two-way -c fail

  # Dry run to see what would happen
  npx ts-node src/sync/cli/cmd.ts --folder ./vault --api-key xxx --dry-run

  # Multi-repo setup: each repo pushes with different subgraph
  npx ts-node src/sync/cli/cmd.ts --folder ./docs --meta subgraph=docs
  npx ts-node src/sync/cli/cmd.ts --folder ./blog --meta subgraph=blog --meta source=repo2
`)}async function st(){let r=nt();r.folder||(console.error("\u274C Error: --folder is required"),L(),process.exit(1)),r.apiKey||(console.error("\u274C Error: --api-key or API_KEY environment variable is required"),process.exit(1)),console.log("=".repeat(60)),console.log("obsidian-sync CLI"),console.log("=".repeat(60)),console.log(`Folder:     ${r.folder}`),console.log(`API URL:    ${r.apiUrl}`),console.log(`Two-way:    ${r.twoWaySync}`),console.log(`Conflicts:  ${r.conflictResolution}`),console.log(`Dry run:    ${r.dryRun}`),Object.keys(r.meta).length>0&&console.log(`Meta:       ${JSON.stringify(r.meta)}`),console.log("=".repeat(60));let t=new w({folder:r.folder,apiUrl:r.apiUrl,apiKey:r.apiKey,twoWaySync:r.twoWaySync,verbose:r.verbose,conflictResolution:r.conflictResolution,meta:r.meta});console.log(`
\u{1F4CA} Classifying files...`);let a=await v(t),e=D(a,{twoWaySync:r.twoWaySync});if(console.log(`
\u{1F4CB} Sync Plan:`),console.log("-".repeat(40)),console.log(`  Unchanged:      ${e.unchanged}`),console.log(`  To push:        ${e.pushes.length}`),console.log(`  Local only:     ${e.localOnly.length}`),console.log(`  To pull:        ${e.pulls.length}`),console.log(`  Remote only:    ${e.remoteOnly.length}`),console.log(`  Conflicts:      ${e.conflicts.length}`),console.log(`  Local deleted:  ${e.localDeleted.length}`),console.log(`  Server deleted: ${e.serverDeleted.length}`),console.log("-".repeat(40)),r.verbose){if(e.pushes.length>0){console.log(`
\u{1F4E4} Files to push:`);for(let i of e.pushes)console.log(`  ${i.path}`)}if(e.localOnly.length>0){console.log(`
\u{1F195} New local files:`);for(let i of e.localOnly)console.log(`  ${i.path}`)}if(e.pulls.length>0){console.log(`
\u{1F4E5} Files to pull:`);for(let i of e.pulls)console.log(`  ${i.path}`)}if(e.remoteOnly.length>0){console.log(`
\u{1F310} New remote files:`);for(let i of e.remoteOnly)console.log(`  ${i.path}`)}if(e.localDeleted.length>0){console.log(`
\u{1F5D1}\uFE0F To hide on server:`);for(let i of e.localDeleted)console.log(`  ${i.path}`)}}if(r.dryRun){console.log(`
\u23F8\uFE0F Dry run - no changes made`);return}let n=e.pushes.length+e.localOnly.length+e.pulls.length+e.remoteOnly.length+e.conflicts.length+e.localDeleted.length+e.serverDeleted.length;console.log(`
\u{1F680} Executing sync...`);let o=await H(t,e,{twoWaySync:r.twoWaySync});if(n===0&&o.assetsUploaded===0&&o.assetsDownloaded===0){console.log(`
\u2705 Everything is up to date!`);return}if(console.log(`
`+"=".repeat(60)),console.log("\u{1F4CA} SYNC RESULTS:"),console.log("=".repeat(60)),console.log(`  Pushed:             ${o.pushed}`),console.log(`  Pulled:             ${o.pulled}`),console.log(`  Conflicts resolved: ${o.conflictsResolved}`),console.log(`  Assets uploaded:    ${o.assetsUploaded}`),console.log(`  Assets downloaded:  ${o.assetsDownloaded}`),o.errors.length>0){console.log(`  Errors:             ${o.errors.length}`);for(let i of o.errors)console.log(`    \u274C ${i}`)}console.log("=".repeat(60))}st().catch(r=>{console.error("\u274C Fatal error:",r),process.exit(1)});
