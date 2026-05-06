#!/usr/bin/env node
import*as $ from"fs";import*as g from"fs";import*as S from"path";import*as N from"crypto";function B(a){return!!(a.startsWith("_layouts/")&&(a.endsWith(".html")||a.endsWith(".html.json")))}import*as C from"path";function U(a,t,r){if(t.startsWith("./")){let n=C.dirname(r),i=C.join(n,t.slice(2));return a.fileExistsSync(i)?i:null}if(t.startsWith("/")){let n=t.slice(1);return a.fileExistsSync(n)?n:null}if(t.includes("/"))return a.fileExistsSync(t)?t:null;if(a.fileExistsSync(t))return t;let e=C.posix.join("assets",t);if(a.fileExistsSync(e))return e;let o=C.dirname(r);if(o&&o!=="."){let n=C.posix.join(o,t);if(a.fileExistsSync(n))return n}return null}var M=class{constructor(t,r={}){this.url=t;this.options=r}async request(t){let r=typeof t.document=="string"?t.document:t.document.loc?.source.body;if(!r)throw new Error("Invalid GraphQL document: no query string found");let e=await fetch(this.url,{method:"POST",headers:{"Content-Type":"application/json",...this.options.headers,...t.requestHeaders},body:JSON.stringify({query:r,variables:t.variables}),signal:t.signal});if(!e.ok)throw new Error(`HTTP ${e.status}: ${e.statusText}`);let o=await e.json();if(o.errors?.length)throw new Error(`GraphQL Error: ${o.errors[0].message}`);if(!o.data)throw new Error("GraphQL response missing data");return o.data}};function P(a,...t){let r=a[0];for(let e=0;e<t.length;e++)r+=String(t[e])+a[e+1];return{loc:{source:{body:r}}}}var L=P`
    query FetchServerHashes {
  notePaths {
    path: value
    hash: latestContentHash
  }
}
    `,V=P`
    query FetchNoteContents($filter: NotePathsFilter) {
  notePaths(filter: $filter) {
    path: value
    content
  }
}
    `,Q=P`
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
    `,q=P`
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
      updated {
        path
        url
      }
    }
  }
}
    `,K=P`
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
      updated {
        path
        url
      }
    }
    ... on ErrorPayload {
      message
    }
  }
}
    `,J=(a,t,r,e)=>a();function F(a,t=J){return{FetchServerHashes(r,e,o){return t(n=>a.request({document:L,variables:r,requestHeaders:{...e,...n},signal:o}),"FetchServerHashes","query",r)},FetchNoteContents(r,e,o){return t(n=>a.request({document:V,variables:r,requestHeaders:{...e,...n},signal:o}),"FetchNoteContents","query",r)},FetchNoteAssets(r,e,o){return t(n=>a.request({document:Q,variables:r,requestHeaders:{...e,...n},signal:o}),"FetchNoteAssets","query",r)},PushNotes(r,e,o){return t(n=>a.request({document:q,variables:r,requestHeaders:{...e,...n},signal:o}),"PushNotes","mutation",r)},HideNotes(r,e,o){return t(n=>a.request({document:K,variables:r,requestHeaders:{...e,...n},signal:o}),"HideNotes","mutation",r)},UploadNoteAsset(r,e,o){return t(n=>a.request({document:j,variables:r,requestHeaders:{...e,...n},signal:o}),"UploadNoteAsset","mutation",r)},CommitNotes(r,e,o){return t(n=>a.request({document:_,variables:r,requestHeaders:{...e,...n},signal:o}),"CommitNotes","mutation",r)}}}function R(a){let t=new M(a.apiUrl,{headers:{"X-API-Key":a.apiKey}});return F(t)}var w=".sync-state.json",O=class{constructor(t){this.pushBatchSize=100;this.folder=S.resolve(t.folder),this.prefix=t.prefix?t.prefix.replace(/\/$/,""):"",this.twoWaySync=t.twoWaySync,this.verbose=t.verbose??!1,this.conflictResolution=t.conflictResolution??"local",this.publishField=t.publishField??"",this.meta=t.meta??{},this.syncState=this.loadSyncState(),this.apiUrl=t.apiUrl,this.apiKey=t.apiKey,this.sdk=R({apiUrl:t.apiUrl,apiKey:t.apiKey})}toRemotePath(t){return this.prefix?`${this.prefix}/${t}`:t}toLocalPath(t){return this.prefix&&t.startsWith(this.prefix+"/")?t.substring(this.prefix.length+1):t}matchesPrefix(t){return this.prefix?t.startsWith(this.prefix+"/"):!0}loadSyncState(){let t=S.join(this.folder,w);try{if(g.existsSync(t)){let r=g.readFileSync(t,"utf-8");return JSON.parse(r)}}catch(r){this.log(`Warning: Could not load sync state: ${r}`)}return{files:{}}}log(t){this.verbose&&console.log(t)}async getLocalFiles(){let t=[],r=e=>{let o=g.readdirSync(e,{withFileTypes:!0});for(let n of o){if(n.name.startsWith(".")||n.name==="node_modules")continue;let i=S.join(e,n.name);if(n.isDirectory())r(i);else if(n.isFile()){let s=S.extname(n.name).toLowerCase();if(s===".md"||s===".html"||n.name.endsWith(".html.json")){let u=g.statSync(i),l=S.relative(this.folder,i);t.push({path:this.toRemotePath(l),mtime:u.mtimeMs})}}}};return r(this.folder),t}async getServerHashes(){try{return(await this.sdk.FetchServerHashes()).notePaths.filter(r=>this.matchesPrefix(r.path)).map(r=>({path:r.path,hash:r.hash}))}catch(t){return console.error(`\u274C Failed to fetch server hashes: ${t}`),[]}}getSyncState(){return this.syncState}async computeHash(t){return N.createHash("sha256").update(t,"utf-8").digest().toString("base64").replace(/\+/g,"-").replace(/\//g,"_")}async readFileContent(t){let r=this.toLocalPath(t),e=S.join(this.folder,r);return g.readFileSync(e,"utf-8")}async writeFile(t,r){let e=S.join(this.folder,t);g.writeFileSync(e,r,"utf-8")}async writeBinaryFile(t,r){let e=S.join(this.folder,t);g.writeFileSync(e,Buffer.from(r))}async readBinaryFile(t){let r=S.join(this.folder,t),e=g.readFileSync(r);return e.buffer.slice(e.byteOffset,e.byteOffset+e.byteLength)}async deleteFile(t){let r=S.join(this.folder,t);g.existsSync(r)&&g.unlinkSync(r)}async createFolder(t){let r=S.join(this.folder,t);g.mkdirSync(r,{recursive:!0})}async fileExists(t){return this.fileExistsSync(t)}fileExistsSync(t){let r=S.join(this.folder,t);return g.existsSync(r)}async pushNotes(t,r){if(t.length===0)return[];let e=t.map(o=>({path:o.path,content:this.injectMeta(o.content)}));if(this.publishField){for(let o of e)if(!this.hasPublishFieldInContent(o.content,o.path))throw new Error(`[Security] Attempted to push note "${o.path}" without publish field "${this.publishField}". This is a bug in the sync logic - please report it.`)}try{let o=await this.sdk.PushNotes({input:{updates:e.map(i=>({path:i.path,content:i.content})),skipCommit:r}});if("message"in o.pushNotes)throw new Error(`Push failed: ${o.pushNotes.message}`);console.log(`\u2705 Pushed ${t.length} notes`);let n=new Map((o.pushNotes.updated??[]).map(i=>[i.path,i.url??null]));return o.pushNotes.notes.map(i=>({id:String(i.id),path:i.path,assets:i.assets.map(s=>({path:s.path,sha256Hash:s.sha256Hash??null,absolutePath:s.absolutePath??null,url:s.url??null})),url:n.get(i.path)??null}))}catch(o){return console.error(`\u274C Failed to push notes: ${o}`),[]}}async hideNotes(t){if(t.length!==0)try{let r=await this.sdk.HideNotes({input:{paths:t}});if("message"in r.hideNotes)throw new Error(`Hide failed: ${r.hideNotes.message}`);console.log(`\u2705 Hidden ${t.length} notes`)}catch(r){console.error(`\u274C Failed to hide notes: ${r}`)}}async fetchNoteContents(t){if(t.length===0)return[];try{return(await this.sdk.FetchNoteContents({filter:{paths:t}})).notePaths.map(e=>({path:e.path,content:e.content}))}catch(r){return console.error(`\u274C Failed to fetch note contents: ${r}`),[]}}async fetchNoteAssets(t){if(t.length===0)return[];try{let r=await this.sdk.PushNotes({input:{updates:[]}});if("message"in r.pushNotes)return console.error(`\u274C Failed to fetch note assets: ${r.pushNotes.message}`),[];let e=new Set(t);return r.pushNotes.notes.filter(o=>e.has(o.path)).map(o=>({path:o.path,noteId:String(o.id),assets:o.assets.map(n=>({id:n.path,url:n.url,hash:n.sha256Hash??"",absolutePath:n.absolutePath}))}))}catch(r){return console.error(`\u274C Failed to fetch note assets: ${r}`),[]}}async uploadAsset(t){for(let e=1;e<=10;e++)try{if(await this.uploadAssetOnce(t))return!0}catch(o){if(e<10){this.log(`\u26A0\uFE0F Upload attempt ${e} failed, retrying: ${t.relativePath}`);continue}return console.error(`\u274C Failed to upload asset ${t.relativePath} after 10 attempts: ${o}`),!1}return!1}async uploadAssetOnce(t){let e=JSON.stringify({query:`mutation UploadNoteAsset($input: UploadNoteAssetInput!) {
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
}`,variables:{input:{file:null,noteId:parseInt(t.noteId),sha256Hash:t.sha256Hash,path:t.relativePath,absolutePath:t.absolutePath}}}),o=JSON.stringify({0:["variables.input.file"]}),n=new FormData;n.append("operations",e),n.append("map",o),n.append("0",t.blob,t.fileName);let i=await fetch(this.apiUrl,{method:"POST",headers:{"X-API-Key":this.apiKey},body:n});if(!i.ok){let l=await i.text();throw new Error(`HTTP ${i.status}: ${i.statusText}
${l}`)}let s=await i.json();if(s.errors)throw new Error(s.errors[0]?.message||"Unknown GraphQL error");let u=s.data?.uploadNoteAsset;if(u?.__typename==="ErrorPayload")throw new Error(`Upload failed: ${u.message}`);return u?.uploadSkipped?this.log(`\u23E9 Asset skipped (already exists): ${t.relativePath}`):console.log(`\u2705 Asset uploaded: ${t.relativePath}`),!0}async downloadAsset(t){try{let r=await fetch(t);return r.ok?await r.arrayBuffer():(console.error(`\u274C Failed to download asset: HTTP ${r.status}`),null)}catch(r){return console.error(`\u274C Failed to download asset from ${t}: ${r}`),null}}async commitNotes(){try{let t=await this.sdk.CommitNotes();if("message"in t.commitNotes)throw new Error(`Commit failed: ${t.commitNotes.message}`);console.log("\u2705 Notes committed")}catch(t){console.error(`\u274C Failed to commit notes: ${t}`)}}async saveSyncState(t){let r=S.join(this.folder,w);t.lastSyncedAt=Date.now(),g.writeFileSync(r,JSON.stringify(t,null,2),"utf-8"),this.syncState=t}async computeBinaryHash(t){return N.createHash("sha256").update(Buffer.from(t)).digest("hex")}async resolveAssetPath(t,r){return U(this,t,r)}onProgress(t){this.verbose&&console.log(`  [${t.step}] ${t.current}/${t.total}: ${t.path??""}`)}async onConflict(t){if(this.conflictResolution==="fail"){console.error(`\u274C ${t.length} conflicts detected:`);for(let e of t)console.error(`   - ${e.path}`);throw new Error("Conflicts detected and --conflict-resolution=fail is set")}let r=this.cliToConflictResolution(this.conflictResolution);return console.log(`\u26A0\uFE0F ${t.length} conflicts detected, resolving with: ${this.conflictResolution}`),t.map(()=>r)}async onAssetConflict(t){if(this.conflictResolution==="fail"){console.error(`\u274C ${t.length} asset conflicts detected:`);for(let e of t)console.error(`   - ${e.path}`);throw new Error("Asset conflicts detected and --conflict-resolution=fail is set")}let r=this.cliToAssetConflictResolution(this.conflictResolution);return console.log(`\u26A0\uFE0F ${t.length} asset conflicts detected, resolving with: ${this.conflictResolution}`),t.map(()=>r)}cliToConflictResolution(t){switch(t){case"local":return"keep_local";case"remote":return"keep_remote";case"skip":return"skip";default:return"keep_local"}}cliToAssetConflictResolution(t){switch(t){case"local":return"keep_local";case"remote":return"keep_remote";case"skip":return"skip";default:return"keep_local"}}async onServerDeleted(t){return console.log(`\u26A0\uFE0F ${t.length} files deleted on server, keeping local copies`),!1}async confirmPush(t){return console.log(`\u{1F4E4} Pushing ${t.length} files...`),!0}injectMeta(t){if(Object.keys(this.meta).length===0)return t;if(t.startsWith("---")){let e=t.indexOf(`
---`,3);if(e!==-1){let o=t.slice(4,e),n=t.slice(e+4);for(let[i,s]of Object.entries(this.meta)){let u=new RegExp(`^${i}\\s*:.*$`,"m");u.test(o)?o=o.replace(u,`${i}: ${s}`):o=o.trimEnd()+`
${i}: ${s}`}return`---
${o}
---${n}`}}return`---
${Object.entries(this.meta).map(([e,o])=>`${e}: ${o}`).join(`
`)}
---
${t}`}hasPublishFieldInContent(t,r){if(!this.publishField||B(r))return!0;if(!t.startsWith("---"))return!1;let e=t.indexOf(`
---`,3);if(e===-1)return!1;let o=t.slice(4,e),n=this.publishField.split(",").map(i=>i.trim()).filter(i=>i);for(let i of n){let s=new RegExp(`^${i}\\s*:\\s*(.+)$`,"m"),u=o.match(s);if(u){let l=u[1].trim().toLowerCase();if(l==="true"||l==="yes"||l==="1"||l==='"true"'||l==="'true'")return!0}}return!1}};function Y(a,t,r){return a===null&&t===null||a===t?"unchanged":a!==null&&t===null?r?"server_deleted":"local_only":a===null&&t!==null?r?"local_deleted":"remote_only":r?a===r?"pull":t===r?"push":"conflict":"conflict"}async function v(a){let t=a.getSyncState(),[r,e]=await Promise.all([a.getLocalFiles(),a.getServerHashes()]),o=new Map;for(let A of e)o.set(A.path,A.hash);let n=new Map,i=t.mtimes||{},s=t.localHashes||{};for(let A of r){let x=i[A.path],f=s[A.path];if(x===A.mtime&&f)n.set(A.path,f);else{let T=await a.readFileContent(A.path),E=await a.computeHash(T);n.set(A.path,E)}}let u=new Set([...n.keys(),...o.keys()]),l=[],p=[],c=[],y=[],m=[],d=[],h=[],b=[],k=0;for(let A of u){let x=n.get(A)||null,f=o.get(A)||null,T=t.files[A]||null,E=Y(x,f,T),I={path:A,action:E,localHash:x,remoteHash:f,lastSyncedHash:T};switch(l.push(I),E){case"unchanged":k++;break;case"pull":p.push(I);break;case"push":c.push(I);break;case"conflict":y.push(I);break;case"local_only":m.push(I);break;case"remote_only":d.push(I);break;case"local_deleted":h.push(I);break;case"server_deleted":b.push(I);break}}return{classifications:l,pulls:p,pushes:c,conflicts:y,localOnly:m,remoteOnly:d,localDeleted:h,serverDeleted:b,unchanged:k}}function D(a,t){let{twoWaySync:r,hasPublishFields:e}=t,o=d=>e?e(d):!0,n=[],i=[],s=[],u=[],l=[],p=[],c=[],y=[],m=0;for(let d of a.classifications){let h=o(d.path);switch(d.action){case"unchanged":n.push(d),m++;break;case"pull":r&&h&&(n.push(d),i.push(d));break;case"push":h&&(n.push(d),s.push(d));break;case"conflict":if(r)h&&(n.push(d),u.push(d));else if(h){let b={...d,action:"push"};n.push(b),s.push(b)}break;case"local_only":h&&(n.push(d),l.push(d));break;case"remote_only":r&&(n.push(d),p.push(d));break;case"local_deleted":h&&(n.push(d),c.push(d));break;case"server_deleted":r&&(n.push(d),y.push(d));break}}return{classifications:n,pulls:i,pushes:s,conflicts:u,localOnly:l,remoteOnly:p,localDeleted:c,serverDeleted:y,unchanged:m}}async function W(a,t,r={twoWaySync:!1}){let e={pulled:0,pushed:0,conflictsResolved:0,assetsUploaded:0,assetsDownloaded:0,errors:[],updatedUrls:[]},o=a.getSyncState(),n=[];if(t.pulls.length>0||t.remoteOnly.length>0){let l=[...t.pulls,...t.remoteOnly],p=await z(a,l,o);e.pulled=p.count,e.errors.push(...p.errors),n.push(...p.pulledPaths)}if(n.length>0){let l=await H(a,n);e.assetsDownloaded+=l.downloaded,e.errors.push(...l.errors)}if(r.twoWaySync){let l=t.classifications.filter(p=>p.action==="unchanged"&&p.remoteHash!==null).map(p=>p.path);if(l.length>0){let p=await H(a,l);e.assetsDownloaded+=p.downloaded,e.errors.push(...p.errors)}}if(t.serverDeleted.length>0&&await et(a,t.serverDeleted,o),t.conflicts.length>0){let l=await Z(a,t.conflicts,o);e.conflictsResolved=l.resolved,e.errors.push(...l.errors)}let i=[...t.pushes,...t.localOnly],s=[];if(i.length>0&&await a.confirmPush(i.map(p=>p.path))){let p=await X(a,i,o);e.pushed=p.count,e.errors.push(...p.errors),s=p.pushedNotes,e.updatedUrls=p.urls}if(t.localDeleted.length>0&&await at(a,t.localDeleted,o),s.length>0){let l=await rt(a,s,r.twoWaySync);e.assetsUploaded=l.uploaded,e.assetsDownloaded=l.downloaded,e.errors.push(...l.errors)}let u=t.classifications.filter(l=>l.action==="unchanged"&&l.remoteHash!==null).map(l=>l.path);if(u.length>0){let l=await nt(a,u);e.assetsUploaded+=l.uploaded,e.errors.push(...l.errors)}return(e.pushed>0||e.assetsUploaded>0)&&await a.commitNotes(),await a.saveSyncState(o),e}async function z(a,t,r){if(t.length===0)return{count:0,errors:[],pulledPaths:[]};let e=t.map(c=>c.path),o=[],n=[],i=0,s=await a.fetchNoteContents(e),u=new Map(s.map(c=>[c.path,c.content])),l=t.length,p=0;for(let c of t){p++,a.onProgress({step:"pull",current:p,total:l,path:c.path});let y=u.get(c.path);if(y===void 0){o.push(`Failed to fetch: ${c.path}`);continue}try{let m=c.path.substring(0,c.path.lastIndexOf("/"));m&&await a.createFolder(m),await a.writeFile(c.path,y);let d=await a.computeHash(y);r.files[c.path]=d,i++,n.push(c.path)}catch(m){o.push(`Failed to write ${c.path}: ${m}`)}}return{count:i,errors:o,pulledPaths:n}}async function X(a,t,r){if(t.length===0)return{count:0,errors:[],pushedNotes:[],urls:[]};let e=[],o=[],n=t.length,i=0;for(let d of t){i++,a.onProgress({step:"push",current:i,total:n,path:d.path});try{let h=await a.readFileContent(d.path);o.push({path:d.path,content:h})}catch(h){e.push(`Failed to read ${d.path}: ${h}`)}}if(o.length===0)return{count:0,errors:e,pushedNotes:[],urls:[]};let s=new Set(o.map(d=>d.path)),u=a.pushBatchSize||100,l=[];for(let d=0;d<o.length;d+=u){let h=o.slice(d,d+u),b=await a.pushNotes(h,!0);l.push(...b)}let p=new Set(l.map(d=>d.path)),c=0;for(let d of o)if(p.has(d.path)){let h=await a.computeHash(d.content);r.files[d.path]=h,c++}let y=l.filter(d=>s.has(d.path)),m=y.filter(d=>typeof d.url=="string").map(d=>({path:d.path,url:d.url}));return{count:c,errors:e,pushedNotes:y,urls:m}}async function Z(a,t,r){if(t.length===0)return{resolved:0,errors:[]};let e=[],o=t.map(p=>p.path),n=await a.fetchNoteContents(o),i=new Map(n.map(p=>[p.path,p.content])),s=[];for(let p of t){let c=i.get(p.path);if(c!==void 0)try{let y=await a.readFileContent(p.path);s.push({path:p.path,localContent:y,remoteContent:c,localHash:p.localHash,remoteHash:p.remoteHash})}catch(y){console.warn(`Failed to read local file for conflict ${p.path}:`,y),e.push(`Failed to read local file for conflict: ${p.path}`)}}if(s.length===0)return{resolved:0,errors:e};let u=await a.onConflict(s),l=0;for(let p=0;p<s.length;p++){let c=s[p],y=u[p]||"skip";try{await tt(a,c,y,r),y!=="skip"&&l++}catch(m){e.push(`Failed to resolve conflict for ${c.path}: ${m}`)}}return{resolved:l,errors:e}}async function tt(a,t,r,e){switch(r){case"keep_local":await a.pushNotes([{path:t.path,content:t.localContent}],!0),e.files[t.path]=t.localHash;break;case"keep_remote":await a.writeFile(t.path,t.remoteContent),e.files[t.path]=t.remoteHash;break;case"keep_both":{let o=t.path.substring(t.path.lastIndexOf(".")),i=`${t.path.substring(0,t.path.lastIndexOf("."))} (server)${o}`;await a.writeFile(i,t.remoteContent),e.files[t.path]=t.localHash;let s=await a.computeHash(t.remoteContent);e.files[i]=s;break}case"skip":break}}async function et(a,t,r){if(t.length===0)return;let e=t.map(n=>n.path);if(await a.onServerDeleted(e))for(let n of t)try{await a.deleteFile(n.path),delete r.files[n.path]}catch(i){console.warn(`Failed to delete file ${n.path}:`,i)}else for(let n of t)n.localHash&&(r.files[n.path]=n.localHash)}async function at(a,t,r){if(t.length===0)return;let e=t.map(o=>o.path);await a.hideNotes(e);for(let o of e)delete r.files[o]}async function rt(a,t,r){console.log(`[Trip2g Sync] syncAssets called with ${t.length} notes, twoWaySync=${r}`);let e={uploaded:0,downloaded:0,conflictsResolved:0,errors:[]};if(t.length===0)return e;let o=[],n=[],i=[];for(let s of t)if(console.log(`[Trip2g Sync] Processing assets for note: ${s.path}, assets count: ${s.assets?.length??0}`),!(!s.assets||s.assets.length===0))for(let u of s.assets){let l=await a.resolveAssetPath(u.path,s.path);if(console.log(`[Trip2g Sync] Asset "${u.path}" -> localPath: ${l??"NOT FOUND"}, sha256Hash: ${u.sha256Hash??"null"}`),!l)continue;if(!u.sha256Hash||!u.absolutePath||!u.url){console.log(`[Trip2g Sync] Queuing upload: ${u.path} (no hash on server)`),o.push({noteId:s.id,notePath:s.path,asset:u,localPath:l});continue}if(await a.fileExists(l))try{let c=await a.readBinaryFile(l),y=await a.computeBinaryHash(c);if(y===u.sha256Hash)continue;i.push({path:u.path,absolutePath:l,noteId:s.id,localHash:y,remoteHash:u.sha256Hash,remoteUrl:u.url})}catch(c){e.errors.push(`Failed to read local asset ${l}: ${c}`)}else r&&n.push({asset:u,localPath:l})}if(console.log(`[Trip2g Sync] Assets to upload: ${o.length}, to download: ${n.length}, conflicts: ${i.length}`),o.length>0){let s=new Map;for(let c of o){let y=`${c.noteId}:${c.localPath}`;s.has(y)||s.set(y,c)}let u=Array.from(s.values()),l=u.length,p=0;console.log(`[Trip2g Sync] Uploading ${l} unique (note, asset) pairs`);for(let c of u){p++,console.log(`[Trip2g Sync] Uploading asset ${p}/${l}: ${c.localPath}`),a.onProgress({step:"upload_asset",current:p,total:l,path:c.asset.path});try{let y=await a.readBinaryFile(c.localPath),m=await a.computeBinaryHash(y),d=new Blob([y]),h=c.localPath.substring(c.localPath.lastIndexOf("/")+1);await a.uploadAsset({noteId:c.noteId,blob:d,fileName:h,relativePath:c.asset.path,absolutePath:c.localPath,sha256Hash:m})&&e.uploaded++}catch(y){e.errors.push(`Failed to upload asset ${c.asset.path}: ${y}`)}}}if(n.length>0){let s=n.length,u=0;for(let l of n)if(u++,a.onProgress({step:"download_asset",current:u,total:s,path:l.asset.path}),!!l.asset.url)try{let p=await a.downloadAsset(l.asset.url);if(!p){e.errors.push(`Failed to download asset ${l.asset.path}`);continue}let c=l.localPath.substring(0,l.localPath.lastIndexOf("/"));c&&await a.createFolder(c),await a.writeBinaryFile(l.localPath,p),e.downloaded++}catch(p){e.errors.push(`Failed to download asset ${l.asset.path}: ${p}`)}}if(i.length>0){let s=await ot(a,i,r);e.uploaded+=s.uploaded,e.downloaded+=s.downloaded,e.conflictsResolved=s.conflictsResolved,e.errors.push(...s.errors)}return e}async function ot(a,t,r){let e={uploaded:0,downloaded:0,conflictsResolved:0,errors:[]};if(t.length===0)return e;let o;r?o=await a.onAssetConflict(t):o=t.map(()=>"keep_local");for(let n=0;n<t.length;n++){let i=t[n],s=o[n]||"skip";try{if(s==="keep_local"){let u=await a.readBinaryFile(i.absolutePath),l=new Blob([u]),p=i.absolutePath.substring(i.absolutePath.lastIndexOf("/")+1);await a.uploadAsset({noteId:i.noteId,blob:l,fileName:p,relativePath:i.path,absolutePath:i.absolutePath,sha256Hash:i.localHash})&&(e.uploaded++,e.conflictsResolved++)}else if(s==="keep_remote"){let u=await a.downloadAsset(i.remoteUrl);u?(await a.writeBinaryFile(i.absolutePath,u),e.downloaded++,e.conflictsResolved++):e.errors.push(`Failed to download asset ${i.path}`)}}catch(u){e.errors.push(`Failed to resolve asset conflict for ${i.path}: ${u}`)}}return e}async function H(a,t){let r={downloaded:0,errors:[]};if(t.length===0)return r;let e=await a.fetchNoteAssets(t);if(e.length===0)return r;let o=new Map;for(let s of e)for(let u of s.assets){let l=u.absolutePath.replace(/^\//,"");o.has(l)||await a.fileExists(l)||o.set(l,{url:u.url,hash:u.hash})}if(o.size===0)return r;let n=o.size,i=0;for(let[s,{url:u}]of o){i++,a.onProgress({step:"download_asset",current:i,total:n,path:s});try{let l=await a.downloadAsset(u);if(!l){r.errors.push(`Failed to download asset ${s}`);continue}let p=s.substring(0,s.lastIndexOf("/"));p&&await a.createFolder(p),await a.writeBinaryFile(s,l),r.downloaded++}catch(l){r.errors.push(`Failed to download asset ${s}: ${l}`)}}return r}async function nt(a,t){let r={uploaded:0,errors:[]};if(t.length===0)return r;let e=await a.fetchNoteAssets(t);if(e.length===0)return r;let o=[];for(let s of e)for(let u of s.assets){let l=u.absolutePath?.replace(/^\//,"");if(!l&&u.id){let c=s.path.includes("/")?s.path.substring(0,s.path.lastIndexOf("/")):"",y=u.id.replace(/^\.\//,"");l=c?`${c}/${y}`:y}if(!(!l||!await a.fileExists(l)))try{let c=await a.readBinaryFile(l),y=await a.computeBinaryHash(c);if(y===u.hash)continue;o.push({noteId:s.noteId,notePath:s.path,assetPath:u.id,localPath:l,localHash:y})}catch(c){r.errors.push(`Failed to read local asset ${l}: ${c}`)}}if(o.length===0)return r;let n=o.length,i=0;for(let s of o){i++,a.onProgress({step:"upload_asset",current:i,total:n,path:s.assetPath});try{let u=await a.readBinaryFile(s.localPath),l=new Blob([u]),p=s.localPath.substring(s.localPath.lastIndexOf("/")+1);await a.uploadAsset({noteId:s.noteId,blob:l,fileName:p,relativePath:s.assetPath,absolutePath:s.localPath,sha256Hash:s.localHash})&&r.uploaded++}catch(u){r.errors.push(`Failed to upload asset ${s.assetPath}: ${u}`)}}return r}function st(){let a=process.argv.slice(2),t={folder:"",prefix:"",apiUrl:process.env.TRIP2G_ENDPOINT||process.env.ENDPOINT||"http://localhost:8081/graphql",apiKey:process.env.TRIP2G_API_KEY||process.env.API_KEY||"",twoWaySync:!1,verbose:!1,dryRun:!1,conflictResolution:"local",meta:{},updatedOutput:""},r=[];for(let e=0;e<a.length;e++){let o=a[e],n;if(o.includes("=")&&o.startsWith("-")){let i=o.indexOf("=");n=o.substring(i+1),o=o.substring(0,i)}switch(o){case"--api-url":case"-u":t.apiUrl=n??a[++e];break;case"--api-key":case"-k":t.apiKey=n??a[++e];break;case"--two-way":case"-2":t.twoWaySync=!0;break;case"--verbose":case"-v":t.verbose=!0;break;case"--dry-run":case"-n":t.dryRun=!0;break;case"--conflict-resolution":case"-c":{let i=n??a[++e];i==="local"||i==="remote"||i==="skip"||i==="fail"?t.conflictResolution=i:(console.error(`\u274C Invalid conflict resolution: ${i}. Use: local, remote, skip, fail`),process.exit(1));break}case"--meta":case"-m":{let i=n??a[++e];if(i&&i.includes("=")){let s=i.indexOf("="),u=i.substring(0,s),l=i.substring(s+1);t.meta[u]=l}else console.error(`\u274C Invalid --meta format: ${i}. Use: --meta key=value`),process.exit(1);break}case"--updated-output":case"-o":t.updatedOutput=n??a[++e];break;case"--help":case"-h":G(),process.exit(0);break;default:o.startsWith("-")||r.push(o)}}return r.length>=1&&(t.folder=r[0]),r.length>=2&&(t.prefix=r[1]),t}function G(){console.log(`
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
  -o, --updated-output <file>
                           Write pushed notes as JSON [{path, url}] to file after sync
  -v, --verbose            Verbose output
  -n, --dry-run            Show what would be done without making changes
  -h, --help               Show this help

Environment Variables:
  TRIP2G_ENDPOINT    GraphQL endpoint URL
  TRIP2G_API_KEY     API key for authentication
  ENDPOINT           Fallback for TRIP2G_ENDPOINT
  API_KEY            Fallback for TRIP2G_API_KEY

Examples:
  # Push-only sync
  trip2g-sync ./vault --api-key xxx

  # Two-way sync
  trip2g-sync ./vault --api-key xxx --two-way

  # Multi-repo setup: each repo pushes to different folder with different meta
  trip2g-sync ./docs docs --meta subgraph=docs
  trip2g-sync ./blog blog --meta subgraph=blog
  trip2g-sync ./wiki wiki --meta subgraph=team-wiki
`)}async function it(){let a=st();a.folder||(console.error("\u274C Error: --folder is required"),G(),process.exit(1)),a.apiKey||(console.error("\u274C Error: --api-key or API_KEY environment variable is required"),process.exit(1)),a.prefix&&a.twoWaySync&&(console.error("\u274C Error: prefix is not supported with --two-way sync"),process.exit(1)),console.log("=".repeat(60)),console.log("obsidian-sync CLI"),console.log("=".repeat(60)),console.log(`Folder:     ${a.folder}`),a.prefix&&console.log(`Prefix:     ${a.prefix}`),console.log(`API URL:    ${a.apiUrl}`),console.log(`Two-way:    ${a.twoWaySync}`),console.log(`Conflicts:  ${a.conflictResolution}`),console.log(`Dry run:    ${a.dryRun}`),Object.keys(a.meta).length>0&&console.log(`Meta:       ${JSON.stringify(a.meta)}`),console.log("=".repeat(60));let t=new O({folder:a.folder,prefix:a.prefix,apiUrl:a.apiUrl,apiKey:a.apiKey,twoWaySync:a.twoWaySync,verbose:a.verbose,conflictResolution:a.conflictResolution,meta:a.meta});console.log(`
\u{1F4CA} Classifying files...`);let r=await v(t),e=D(r,{twoWaySync:a.twoWaySync});if(console.log(`
\u{1F4CB} Sync Plan:`),console.log("-".repeat(40)),console.log(`  Unchanged:      ${e.unchanged}`),console.log(`  To push:        ${e.pushes.length}`),console.log(`  Local only:     ${e.localOnly.length}`),console.log(`  To pull:        ${e.pulls.length}`),console.log(`  Remote only:    ${e.remoteOnly.length}`),console.log(`  Conflicts:      ${e.conflicts.length}`),console.log(`  Local deleted:  ${e.localDeleted.length}`),console.log(`  Server deleted: ${e.serverDeleted.length}`),console.log("-".repeat(40)),a.verbose){if(e.pushes.length>0){console.log(`
\u{1F4E4} Files to push:`);for(let s of e.pushes)console.log(`  ${s.path}`)}if(e.localOnly.length>0){console.log(`
\u{1F195} New local files:`);for(let s of e.localOnly)console.log(`  ${s.path}`)}if(e.pulls.length>0){console.log(`
\u{1F4E5} Files to pull:`);for(let s of e.pulls)console.log(`  ${s.path}`)}if(e.remoteOnly.length>0){console.log(`
\u{1F310} New remote files:`);for(let s of e.remoteOnly)console.log(`  ${s.path}`)}if(e.localDeleted.length>0){console.log(`
\u{1F5D1}\uFE0F To hide on server:`);for(let s of e.localDeleted)console.log(`  ${s.path}`)}}if(a.dryRun){console.log(`
\u23F8\uFE0F Dry run - no changes made`);return}let o=e.pushes.length+e.localOnly.length+e.pulls.length+e.remoteOnly.length+e.conflicts.length+e.localDeleted.length+e.serverDeleted.length;console.log(`
\u{1F680} Executing sync...`);let n=await W(t,e,{twoWaySync:a.twoWaySync});if(o===0&&n.assetsUploaded===0&&n.assetsDownloaded===0){console.log(`
\u2705 Everything is up to date!`);return}if(console.log(`
`+"=".repeat(60)),console.log("\u{1F4CA} SYNC RESULTS:"),console.log("=".repeat(60)),console.log(`  Pushed:             ${n.pushed}`),console.log(`  Pulled:             ${n.pulled}`),console.log(`  Conflicts resolved: ${n.conflictsResolved}`),console.log(`  Assets uploaded:    ${n.assetsUploaded}`),console.log(`  Assets downloaded:  ${n.assetsDownloaded}`),n.errors.length>0){console.log(`  Errors:             ${n.errors.length}`);for(let s of n.errors)console.log(`    \u274C ${s}`)}console.log("=".repeat(60));let i=n.updatedUrls??[];if(i.length>0){if(console.log(`
\u{1F4CE} Published:`),i.length<=20)for(let{path:s,url:u}of i)console.log(`  ${s} \u2192 ${u}`);a.updatedOutput?($.writeFileSync(a.updatedOutput,JSON.stringify(i,null,2)),console.log(`\u{1F4BE} Saved to ${a.updatedOutput}`)):console.log("\u{1F4A1} --updated-output $(mktemp /tmp/updated-XXXXXX.json)")}}it().catch(a=>{console.error("\u274C Fatal error:",a),process.exit(1)});
