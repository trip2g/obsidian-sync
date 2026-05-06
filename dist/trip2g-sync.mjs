#!/usr/bin/env node
import*as $ from"fs";import*as h from"fs";import*as S from"path";import*as N from"crypto";function U(r){return!!(r.startsWith("_layouts/")&&(r.endsWith(".html")||r.endsWith(".html.json")))}import*as C from"path";function B(r,t,a){if(t.startsWith("./")){let n=C.dirname(a),i=C.join(n,t.slice(2));return r.fileExistsSync(i)?i:null}if(t.startsWith("/")){let n=t.slice(1);return r.fileExistsSync(n)?n:null}if(t.includes("/"))return r.fileExistsSync(t)?t:null;if(r.fileExistsSync(t))return t;let e=C.posix.join("assets",t);if(r.fileExistsSync(e))return e;let o=C.dirname(a);if(o&&o!=="."){let n=C.posix.join(o,t);if(r.fileExistsSync(n))return n}return null}var M=class{constructor(t,a={}){this.url=t;this.options=a}async request(t){let a=typeof t.document=="string"?t.document:t.document.loc?.source.body;if(!a)throw new Error("Invalid GraphQL document: no query string found");let e=await fetch(this.url,{method:"POST",headers:{"Content-Type":"application/json",...this.options.headers,...t.requestHeaders},body:JSON.stringify({query:a,variables:t.variables}),signal:t.signal});if(!e.ok){let n=await e.text().catch(()=>"");throw new Error(`HTTP ${e.status}: ${e.statusText}${n?`
${n}`:""}`)}let o=await e.json();if(o.errors?.length)throw new Error(`GraphQL Error: ${o.errors[0].message}`);if(!o.data)throw new Error("GraphQL response missing data");return o.data}};function P(r,...t){let a=r[0];for(let e=0;e<t.length;e++)a+=String(t[e])+r[e+1];return{loc:{source:{body:a}}}}var L=P`
    query FetchServerHashes {
  notePaths {
    path: value
    hash: latestContentHash
  }
}
    `,V=P`
    query FetchPublishedUrls {
  notePaths {
    path: value
    latestNoteView {
      url
    }
  }
}
    `,Q=P`
    query FetchNoteContents($filter: NotePathsFilter) {
  notePaths(filter: $filter) {
    path: value
    content
  }
}
    `,q=P`
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
      updated {
        path
        url
      }
    }
  }
}
    `,j=P`
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
    `,_=P`
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
    `,J=P`
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
    `,Y=(r,t,a,e)=>r();function F(r,t=Y){return{FetchServerHashes(a,e,o){return t(n=>r.request({document:L,variables:a,requestHeaders:{...e,...n},signal:o}),"FetchServerHashes","query",a)},FetchPublishedUrls(a,e,o){return t(n=>r.request({document:V,variables:a,requestHeaders:{...e,...n},signal:o}),"FetchPublishedUrls","query",a)},FetchNoteContents(a,e,o){return t(n=>r.request({document:Q,variables:a,requestHeaders:{...e,...n},signal:o}),"FetchNoteContents","query",a)},FetchNoteAssets(a,e,o){return t(n=>r.request({document:q,variables:a,requestHeaders:{...e,...n},signal:o}),"FetchNoteAssets","query",a)},PushNotes(a,e,o){return t(n=>r.request({document:K,variables:a,requestHeaders:{...e,...n},signal:o}),"PushNotes","mutation",a)},HideNotes(a,e,o){return t(n=>r.request({document:j,variables:a,requestHeaders:{...e,...n},signal:o}),"HideNotes","mutation",a)},UploadNoteAsset(a,e,o){return t(n=>r.request({document:_,variables:a,requestHeaders:{...e,...n},signal:o}),"UploadNoteAsset","mutation",a)},CommitNotes(a,e,o){return t(n=>r.request({document:J,variables:a,requestHeaders:{...e,...n},signal:o}),"CommitNotes","mutation",a)}}}function R(r){let t=new M(r.apiUrl,{headers:{"X-API-Key":r.apiKey}});return F(t)}var w=".sync-state.json",O=class{constructor(t){this.pushBatchSize=100;this.folder=S.resolve(t.folder),this.prefix=t.prefix?t.prefix.replace(/\/$/,""):"",this.twoWaySync=t.twoWaySync,this.verbose=t.verbose??!1,this.conflictResolution=t.conflictResolution??"local",this.publishField=t.publishField??"",this.meta=t.meta??{},this.syncState=this.loadSyncState(),this.apiUrl=t.apiUrl,this.apiKey=t.apiKey,this.sdk=R({apiUrl:t.apiUrl,apiKey:t.apiKey})}toRemotePath(t){return this.prefix?`${this.prefix}/${t}`:t}toLocalPath(t){return this.prefix&&t.startsWith(this.prefix+"/")?t.substring(this.prefix.length+1):t}matchesPrefix(t){return this.prefix?t.startsWith(this.prefix+"/"):!0}loadSyncState(){let t=S.join(this.folder,w);try{if(h.existsSync(t)){let a=h.readFileSync(t,"utf-8");return JSON.parse(a)}}catch(a){this.log(`Warning: Could not load sync state: ${a}`)}return{files:{}}}log(t){this.verbose&&console.log(t)}async getLocalFiles(){let t=[],a=e=>{let o=h.readdirSync(e,{withFileTypes:!0});for(let n of o){if(n.name.startsWith(".")||n.name==="node_modules")continue;let i=S.join(e,n.name);if(n.isDirectory())a(i);else if(n.isFile()){let s=S.extname(n.name).toLowerCase();if(s===".md"||s===".html"||n.name.endsWith(".html.json")){let u=h.statSync(i),l=S.relative(this.folder,i);t.push({path:this.toRemotePath(l),mtime:u.mtimeMs})}}}};return a(this.folder),t}async getServerHashes(){try{return(await this.sdk.FetchServerHashes()).notePaths.filter(a=>this.matchesPrefix(a.path)).map(a=>({path:a.path,hash:a.hash}))}catch(t){return console.error(`\u274C Failed to fetch server hashes: ${t}`),[]}}getSyncState(){return this.syncState}async computeHash(t){return N.createHash("sha256").update(t,"utf-8").digest().toString("base64").replace(/\+/g,"-").replace(/\//g,"_")}async readFileContent(t){let a=this.toLocalPath(t),e=S.join(this.folder,a);return h.readFileSync(e,"utf-8")}async writeFile(t,a){let e=S.join(this.folder,t);h.writeFileSync(e,a,"utf-8")}async writeBinaryFile(t,a){let e=S.join(this.folder,t);h.writeFileSync(e,Buffer.from(a))}async readBinaryFile(t){let a=S.join(this.folder,t),e=h.readFileSync(a);return e.buffer.slice(e.byteOffset,e.byteOffset+e.byteLength)}async deleteFile(t){let a=S.join(this.folder,t);h.existsSync(a)&&h.unlinkSync(a)}async createFolder(t){let a=S.join(this.folder,t);h.mkdirSync(a,{recursive:!0})}async fileExists(t){return this.fileExistsSync(t)}fileExistsSync(t){let a=S.join(this.folder,t);return h.existsSync(a)}async pushNotes(t,a){if(t.length===0)return[];let e=t.map(o=>({path:o.path,content:this.injectMeta(o.content)}));if(this.publishField){for(let o of e)if(!this.hasPublishFieldInContent(o.content,o.path))throw new Error(`[Security] Attempted to push note "${o.path}" without publish field "${this.publishField}". This is a bug in the sync logic - please report it.`)}try{let o=await this.sdk.PushNotes({input:{updates:e.map(i=>({path:i.path,content:i.content})),skipCommit:a}});if("message"in o.pushNotes)throw new Error(`Push failed: ${o.pushNotes.message}`);console.log(`\u2705 Pushed ${t.length} notes`);let n=new Map((o.pushNotes.updated??[]).map(i=>[i.path,i.url??null]));return o.pushNotes.notes.map(i=>({id:String(i.id),path:i.path,assets:i.assets.map(s=>({path:s.path,sha256Hash:s.sha256Hash??null,absolutePath:s.absolutePath??null,url:s.url??null})),url:n.get(i.path)??null}))}catch(o){return console.error(`\u274C Failed to push notes: ${o}`),[]}}async hideNotes(t){if(t.length!==0)try{let a=await this.sdk.HideNotes({input:{paths:t}});if("message"in a.hideNotes)throw new Error(`Hide failed: ${a.hideNotes.message}`);console.log(`\u2705 Hidden ${t.length} notes`)}catch(a){console.error(`\u274C Failed to hide notes: ${a}`)}}async fetchNoteContents(t){if(t.length===0)return[];try{return(await this.sdk.FetchNoteContents({filter:{paths:t}})).notePaths.map(e=>({path:e.path,content:e.content}))}catch(a){return console.error(`\u274C Failed to fetch note contents: ${a}`),[]}}async fetchNoteAssets(t){if(t.length===0)return[];try{let a=await this.sdk.PushNotes({input:{updates:[]}});if("message"in a.pushNotes)return console.error(`\u274C Failed to fetch note assets: ${a.pushNotes.message}`),[];let e=new Set(t);return a.pushNotes.notes.filter(o=>e.has(o.path)).map(o=>({path:o.path,noteId:String(o.id),assets:o.assets.map(n=>({id:n.path,url:n.url,hash:n.sha256Hash??"",absolutePath:n.absolutePath}))}))}catch(a){return console.error(`\u274C Failed to fetch note assets: ${a}`),[]}}async uploadAsset(t){for(let e=1;e<=10;e++)try{if(await this.uploadAssetOnce(t))return!0}catch(o){if(e<10){this.log(`\u26A0\uFE0F Upload attempt ${e} failed, retrying: ${t.relativePath}`);continue}return console.error(`\u274C Failed to upload asset ${t.relativePath} after 10 attempts: ${o}`),!1}return!1}async uploadAssetOnce(t){let e=JSON.stringify({query:`mutation UploadNoteAsset($input: UploadNoteAssetInput!) {
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
${l}`)}let s=await i.json();if(s.errors)throw new Error(s.errors[0]?.message||"Unknown GraphQL error");let u=s.data?.uploadNoteAsset;if(u?.__typename==="ErrorPayload")throw new Error(`Upload failed: ${u.message}`);return u?.uploadSkipped?this.log(`\u23E9 Asset skipped (already exists): ${t.relativePath}`):console.log(`\u2705 Asset uploaded: ${t.relativePath}`),!0}async downloadAsset(t){try{let a=await fetch(t);return a.ok?await a.arrayBuffer():(console.error(`\u274C Failed to download asset: HTTP ${a.status}`),null)}catch(a){return console.error(`\u274C Failed to download asset from ${t}: ${a}`),null}}async commitNotes(){try{let t=await this.sdk.CommitNotes();if("message"in t.commitNotes)throw new Error(`Commit failed: ${t.commitNotes.message}`);return console.log("\u2705 Notes committed"),{updated:(t.commitNotes.updated??[]).map(a=>({path:a.path,url:a.url??""}))}}catch(t){return console.error(`\u274C Failed to commit notes: ${t}`),{updated:[]}}}async saveSyncState(t){let a=S.join(this.folder,w);t.lastSyncedAt=Date.now(),h.writeFileSync(a,JSON.stringify(t,null,2),"utf-8"),this.syncState=t}async computeBinaryHash(t){return N.createHash("sha256").update(Buffer.from(t)).digest("hex")}async resolveAssetPath(t,a){return B(this,t,a)}onProgress(t){this.verbose&&console.log(`  [${t.step}] ${t.current}/${t.total}: ${t.path??""}`)}async onConflict(t){if(this.conflictResolution==="fail"){console.error(`\u274C ${t.length} conflicts detected:`);for(let e of t)console.error(`   - ${e.path}`);throw new Error("Conflicts detected and --conflict-resolution=fail is set")}let a=this.cliToConflictResolution(this.conflictResolution);return console.log(`\u26A0\uFE0F ${t.length} conflicts detected, resolving with: ${this.conflictResolution}`),t.map(()=>a)}async onAssetConflict(t){if(this.conflictResolution==="fail"){console.error(`\u274C ${t.length} asset conflicts detected:`);for(let e of t)console.error(`   - ${e.path}`);throw new Error("Asset conflicts detected and --conflict-resolution=fail is set")}let a=this.cliToAssetConflictResolution(this.conflictResolution);return console.log(`\u26A0\uFE0F ${t.length} asset conflicts detected, resolving with: ${this.conflictResolution}`),t.map(()=>a)}cliToConflictResolution(t){switch(t){case"local":return"keep_local";case"remote":return"keep_remote";case"skip":return"skip";default:return"keep_local"}}cliToAssetConflictResolution(t){switch(t){case"local":return"keep_local";case"remote":return"keep_remote";case"skip":return"skip";default:return"keep_local"}}async onServerDeleted(t){return console.log(`\u26A0\uFE0F ${t.length} files deleted on server, keeping local copies`),!1}async confirmPush(t){return console.log(`\u{1F4E4} Pushing ${t.length} files...`),!0}injectMeta(t){if(Object.keys(this.meta).length===0)return t;if(t.startsWith("---")){let e=t.indexOf(`
---`,3);if(e!==-1){let o=t.slice(4,e),n=t.slice(e+4);for(let[i,s]of Object.entries(this.meta)){let u=new RegExp(`^${i}\\s*:.*$`,"m");u.test(o)?o=o.replace(u,`${i}: ${s}`):o=o.trimEnd()+`
${i}: ${s}`}return`---
${o}
---${n}`}}return`---
${Object.entries(this.meta).map(([e,o])=>`${e}: ${o}`).join(`
`)}
---
${t}`}hasPublishFieldInContent(t,a){if(!this.publishField||U(a))return!0;if(!t.startsWith("---"))return!1;let e=t.indexOf(`
---`,3);if(e===-1)return!1;let o=t.slice(4,e),n=this.publishField.split(",").map(i=>i.trim()).filter(i=>i);for(let i of n){let s=new RegExp(`^${i}\\s*:\\s*(.+)$`,"m"),u=o.match(s);if(u){let l=u[1].trim().toLowerCase();if(l==="true"||l==="yes"||l==="1"||l==='"true"'||l==="'true'")return!0}}return!1}};function z(r,t,a){return r===null&&t===null||r===t?"unchanged":r!==null&&t===null?a?"server_deleted":"local_only":r===null&&t!==null?a?"local_deleted":"remote_only":a?r===a?"pull":t===a?"push":"conflict":"conflict"}async function v(r){let t=r.getSyncState(),[a,e]=await Promise.all([r.getLocalFiles(),r.getServerHashes()]),o=new Map;for(let A of e)o.set(A.path,A.hash);let n=new Map,i=t.mtimes||{},s=t.localHashes||{};for(let A of a){let x=i[A.path],f=s[A.path];if(x===A.mtime&&f)n.set(A.path,f);else{let T=await r.readFileContent(A.path),E=await r.computeHash(T);n.set(A.path,E)}}let u=new Set([...n.keys(),...o.keys()]),l=[],p=[],c=[],y=[],m=[],d=[],g=[],b=[],k=0;for(let A of u){let x=n.get(A)||null,f=o.get(A)||null,T=t.files[A]||null,E=z(x,f,T),I={path:A,action:E,localHash:x,remoteHash:f,lastSyncedHash:T};switch(l.push(I),E){case"unchanged":k++;break;case"pull":p.push(I);break;case"push":c.push(I);break;case"conflict":y.push(I);break;case"local_only":m.push(I);break;case"remote_only":d.push(I);break;case"local_deleted":g.push(I);break;case"server_deleted":b.push(I);break}}return{classifications:l,pulls:p,pushes:c,conflicts:y,localOnly:m,remoteOnly:d,localDeleted:g,serverDeleted:b,unchanged:k}}function D(r,t){let{twoWaySync:a,hasPublishFields:e}=t,o=d=>e?e(d):!0,n=[],i=[],s=[],u=[],l=[],p=[],c=[],y=[],m=0;for(let d of r.classifications){let g=o(d.path);switch(d.action){case"unchanged":n.push(d),m++;break;case"pull":a&&g&&(n.push(d),i.push(d));break;case"push":g&&(n.push(d),s.push(d));break;case"conflict":if(a)g&&(n.push(d),u.push(d));else if(g){let b={...d,action:"push"};n.push(b),s.push(b)}break;case"local_only":g&&(n.push(d),l.push(d));break;case"remote_only":a&&(n.push(d),p.push(d));break;case"local_deleted":g&&(n.push(d),c.push(d));break;case"server_deleted":a&&(n.push(d),y.push(d));break}}return{classifications:n,pulls:i,pushes:s,conflicts:u,localOnly:l,remoteOnly:p,localDeleted:c,serverDeleted:y,unchanged:m}}async function W(r,t,a={twoWaySync:!1}){let e={pulled:0,pushed:0,conflictsResolved:0,assetsUploaded:0,assetsDownloaded:0,errors:[],updatedUrls:[]},o=r.getSyncState(),n=[];if(t.pulls.length>0||t.remoteOnly.length>0){let l=[...t.pulls,...t.remoteOnly],p=await X(r,l,o);e.pulled=p.count,e.errors.push(...p.errors),n.push(...p.pulledPaths)}if(n.length>0){let l=await H(r,n);e.assetsDownloaded+=l.downloaded,e.errors.push(...l.errors)}if(a.twoWaySync){let l=t.classifications.filter(p=>p.action==="unchanged"&&p.remoteHash!==null).map(p=>p.path);if(l.length>0){let p=await H(r,l);e.assetsDownloaded+=p.downloaded,e.errors.push(...p.errors)}}if(t.serverDeleted.length>0&&await at(r,t.serverDeleted,o),t.conflicts.length>0){let l=await tt(r,t.conflicts,o);e.conflictsResolved=l.resolved,e.errors.push(...l.errors)}let i=[...t.pushes,...t.localOnly],s=[];if(i.length>0&&await r.confirmPush(i.map(p=>p.path))){let p=await Z(r,i,o);e.pushed=p.count,e.errors.push(...p.errors),s=p.pushedNotes}if(t.localDeleted.length>0&&await rt(r,t.localDeleted,o),s.length>0){let l=await ot(r,s,a.twoWaySync);e.assetsUploaded=l.uploaded,e.assetsDownloaded=l.downloaded,e.errors.push(...l.errors)}let u=t.classifications.filter(l=>l.action==="unchanged"&&l.remoteHash!==null).map(l=>l.path);if(u.length>0){let l=await st(r,u);e.assetsUploaded+=l.uploaded,e.errors.push(...l.errors)}if(e.pushed>0||e.assetsUploaded>0){let l=await r.commitNotes();e.updatedUrls=l.updated}return await r.saveSyncState(o),e}async function X(r,t,a){if(t.length===0)return{count:0,errors:[],pulledPaths:[]};let e=t.map(c=>c.path),o=[],n=[],i=0,s=await r.fetchNoteContents(e),u=new Map(s.map(c=>[c.path,c.content])),l=t.length,p=0;for(let c of t){p++,r.onProgress({step:"pull",current:p,total:l,path:c.path});let y=u.get(c.path);if(y===void 0){o.push(`Failed to fetch: ${c.path}`);continue}try{let m=c.path.substring(0,c.path.lastIndexOf("/"));m&&await r.createFolder(m),await r.writeFile(c.path,y);let d=await r.computeHash(y);a.files[c.path]=d,i++,n.push(c.path)}catch(m){o.push(`Failed to write ${c.path}: ${m}`)}}return{count:i,errors:o,pulledPaths:n}}async function Z(r,t,a){if(t.length===0)return{count:0,errors:[],pushedNotes:[],urls:[]};let e=[],o=[],n=t.length,i=0;for(let d of t){i++,r.onProgress({step:"push",current:i,total:n,path:d.path});try{let g=await r.readFileContent(d.path);o.push({path:d.path,content:g})}catch(g){e.push(`Failed to read ${d.path}: ${g}`)}}if(o.length===0)return{count:0,errors:e,pushedNotes:[],urls:[]};let s=new Set(o.map(d=>d.path)),u=r.pushBatchSize||100,l=[];for(let d=0;d<o.length;d+=u){let g=o.slice(d,d+u),b=await r.pushNotes(g,!0);l.push(...b)}let p=new Set(l.map(d=>d.path)),c=0;for(let d of o)if(p.has(d.path)){let g=await r.computeHash(d.content);a.files[d.path]=g,c++}let y=l.filter(d=>s.has(d.path)),m=y.filter(d=>typeof d.url=="string").map(d=>({path:d.path,url:d.url}));return{count:c,errors:e,pushedNotes:y,urls:m}}async function tt(r,t,a){if(t.length===0)return{resolved:0,errors:[]};let e=[],o=t.map(p=>p.path),n=await r.fetchNoteContents(o),i=new Map(n.map(p=>[p.path,p.content])),s=[];for(let p of t){let c=i.get(p.path);if(c!==void 0)try{let y=await r.readFileContent(p.path);s.push({path:p.path,localContent:y,remoteContent:c,localHash:p.localHash,remoteHash:p.remoteHash})}catch(y){console.warn(`Failed to read local file for conflict ${p.path}:`,y),e.push(`Failed to read local file for conflict: ${p.path}`)}}if(s.length===0)return{resolved:0,errors:e};let u=await r.onConflict(s),l=0;for(let p=0;p<s.length;p++){let c=s[p],y=u[p]||"skip";try{await et(r,c,y,a),y!=="skip"&&l++}catch(m){e.push(`Failed to resolve conflict for ${c.path}: ${m}`)}}return{resolved:l,errors:e}}async function et(r,t,a,e){switch(a){case"keep_local":await r.pushNotes([{path:t.path,content:t.localContent}],!0),e.files[t.path]=t.localHash;break;case"keep_remote":await r.writeFile(t.path,t.remoteContent),e.files[t.path]=t.remoteHash;break;case"keep_both":{let o=t.path.substring(t.path.lastIndexOf(".")),i=`${t.path.substring(0,t.path.lastIndexOf("."))} (server)${o}`;await r.writeFile(i,t.remoteContent),e.files[t.path]=t.localHash;let s=await r.computeHash(t.remoteContent);e.files[i]=s;break}case"skip":break}}async function at(r,t,a){if(t.length===0)return;let e=t.map(n=>n.path);if(await r.onServerDeleted(e))for(let n of t)try{await r.deleteFile(n.path),delete a.files[n.path]}catch(i){console.warn(`Failed to delete file ${n.path}:`,i)}else for(let n of t)n.localHash&&(a.files[n.path]=n.localHash)}async function rt(r,t,a){if(t.length===0)return;let e=t.map(o=>o.path);await r.hideNotes(e);for(let o of e)delete a.files[o]}async function ot(r,t,a){console.log(`[Trip2g Sync] syncAssets called with ${t.length} notes, twoWaySync=${a}`);let e={uploaded:0,downloaded:0,conflictsResolved:0,errors:[]};if(t.length===0)return e;let o=[],n=[],i=[];for(let s of t)if(console.log(`[Trip2g Sync] Processing assets for note: ${s.path}, assets count: ${s.assets?.length??0}`),!(!s.assets||s.assets.length===0))for(let u of s.assets){let l=await r.resolveAssetPath(u.path,s.path);if(console.log(`[Trip2g Sync] Asset "${u.path}" -> localPath: ${l??"NOT FOUND"}, sha256Hash: ${u.sha256Hash??"null"}`),!l)continue;if(!u.sha256Hash||!u.absolutePath||!u.url){console.log(`[Trip2g Sync] Queuing upload: ${u.path} (no hash on server)`),o.push({noteId:s.id,notePath:s.path,asset:u,localPath:l});continue}if(await r.fileExists(l))try{let c=await r.readBinaryFile(l),y=await r.computeBinaryHash(c);if(y===u.sha256Hash)continue;i.push({path:u.path,absolutePath:l,noteId:s.id,localHash:y,remoteHash:u.sha256Hash,remoteUrl:u.url})}catch(c){e.errors.push(`Failed to read local asset ${l}: ${c}`)}else a&&n.push({asset:u,localPath:l})}if(console.log(`[Trip2g Sync] Assets to upload: ${o.length}, to download: ${n.length}, conflicts: ${i.length}`),o.length>0){let s=new Map;for(let c of o){let y=`${c.noteId}:${c.localPath}`;s.has(y)||s.set(y,c)}let u=Array.from(s.values()),l=u.length,p=0;console.log(`[Trip2g Sync] Uploading ${l} unique (note, asset) pairs`);for(let c of u){p++,console.log(`[Trip2g Sync] Uploading asset ${p}/${l}: ${c.localPath}`),r.onProgress({step:"upload_asset",current:p,total:l,path:c.asset.path});try{let y=await r.readBinaryFile(c.localPath),m=await r.computeBinaryHash(y),d=new Blob([y]),g=c.localPath.substring(c.localPath.lastIndexOf("/")+1);await r.uploadAsset({noteId:c.noteId,blob:d,fileName:g,relativePath:c.asset.path,absolutePath:c.localPath,sha256Hash:m})&&e.uploaded++}catch(y){e.errors.push(`Failed to upload asset ${c.asset.path}: ${y}`)}}}if(n.length>0){let s=n.length,u=0;for(let l of n)if(u++,r.onProgress({step:"download_asset",current:u,total:s,path:l.asset.path}),!!l.asset.url)try{let p=await r.downloadAsset(l.asset.url);if(!p){e.errors.push(`Failed to download asset ${l.asset.path}`);continue}let c=l.localPath.substring(0,l.localPath.lastIndexOf("/"));c&&await r.createFolder(c),await r.writeBinaryFile(l.localPath,p),e.downloaded++}catch(p){e.errors.push(`Failed to download asset ${l.asset.path}: ${p}`)}}if(i.length>0){let s=await nt(r,i,a);e.uploaded+=s.uploaded,e.downloaded+=s.downloaded,e.conflictsResolved=s.conflictsResolved,e.errors.push(...s.errors)}return e}async function nt(r,t,a){let e={uploaded:0,downloaded:0,conflictsResolved:0,errors:[]};if(t.length===0)return e;let o;a?o=await r.onAssetConflict(t):o=t.map(()=>"keep_local");for(let n=0;n<t.length;n++){let i=t[n],s=o[n]||"skip";try{if(s==="keep_local"){let u=await r.readBinaryFile(i.absolutePath),l=new Blob([u]),p=i.absolutePath.substring(i.absolutePath.lastIndexOf("/")+1);await r.uploadAsset({noteId:i.noteId,blob:l,fileName:p,relativePath:i.path,absolutePath:i.absolutePath,sha256Hash:i.localHash})&&(e.uploaded++,e.conflictsResolved++)}else if(s==="keep_remote"){let u=await r.downloadAsset(i.remoteUrl);u?(await r.writeBinaryFile(i.absolutePath,u),e.downloaded++,e.conflictsResolved++):e.errors.push(`Failed to download asset ${i.path}`)}}catch(u){e.errors.push(`Failed to resolve asset conflict for ${i.path}: ${u}`)}}return e}async function H(r,t){let a={downloaded:0,errors:[]};if(t.length===0)return a;let e=await r.fetchNoteAssets(t);if(e.length===0)return a;let o=new Map;for(let s of e)for(let u of s.assets){let l=u.absolutePath.replace(/^\//,"");o.has(l)||await r.fileExists(l)||o.set(l,{url:u.url,hash:u.hash})}if(o.size===0)return a;let n=o.size,i=0;for(let[s,{url:u}]of o){i++,r.onProgress({step:"download_asset",current:i,total:n,path:s});try{let l=await r.downloadAsset(u);if(!l){a.errors.push(`Failed to download asset ${s}`);continue}let p=s.substring(0,s.lastIndexOf("/"));p&&await r.createFolder(p),await r.writeBinaryFile(s,l),a.downloaded++}catch(l){a.errors.push(`Failed to download asset ${s}: ${l}`)}}return a}async function st(r,t){let a={uploaded:0,errors:[]};if(t.length===0)return a;let e=await r.fetchNoteAssets(t);if(e.length===0)return a;let o=[];for(let s of e)for(let u of s.assets){let l=u.absolutePath?.replace(/^\//,"");if(!l&&u.id){let c=s.path.includes("/")?s.path.substring(0,s.path.lastIndexOf("/")):"",y=u.id.replace(/^\.\//,"");l=c?`${c}/${y}`:y}if(!(!l||!await r.fileExists(l)))try{let c=await r.readBinaryFile(l),y=await r.computeBinaryHash(c);if(y===u.hash)continue;o.push({noteId:s.noteId,notePath:s.path,assetPath:u.id,localPath:l,localHash:y})}catch(c){a.errors.push(`Failed to read local asset ${l}: ${c}`)}}if(o.length===0)return a;let n=o.length,i=0;for(let s of o){i++,r.onProgress({step:"upload_asset",current:i,total:n,path:s.assetPath});try{let u=await r.readBinaryFile(s.localPath),l=new Blob([u]),p=s.localPath.substring(s.localPath.lastIndexOf("/")+1);await r.uploadAsset({noteId:s.noteId,blob:l,fileName:p,relativePath:s.assetPath,absolutePath:s.localPath,sha256Hash:s.localHash})&&a.uploaded++}catch(u){a.errors.push(`Failed to upload asset ${s.assetPath}: ${u}`)}}return a}function it(){let r=process.argv.slice(2),t={folder:"",prefix:"",apiUrl:process.env.TRIP2G_ENDPOINT||process.env.ENDPOINT||"http://localhost:8081/graphql",apiKey:process.env.TRIP2G_API_KEY||process.env.API_KEY||"",twoWaySync:!1,verbose:!1,dryRun:!1,conflictResolution:"local",meta:{},updatedOutput:""},a=[];for(let e=0;e<r.length;e++){let o=r[e],n;if(o.includes("=")&&o.startsWith("-")){let i=o.indexOf("=");n=o.substring(i+1),o=o.substring(0,i)}switch(o){case"--api-url":case"-u":t.apiUrl=n??r[++e];break;case"--api-key":case"-k":t.apiKey=n??r[++e];break;case"--two-way":case"-2":t.twoWaySync=!0;break;case"--verbose":case"-v":t.verbose=!0;break;case"--dry-run":case"-n":t.dryRun=!0;break;case"--conflict-resolution":case"-c":{let i=n??r[++e];i==="local"||i==="remote"||i==="skip"||i==="fail"?t.conflictResolution=i:(console.error(`\u274C Invalid conflict resolution: ${i}. Use: local, remote, skip, fail`),process.exit(1));break}case"--meta":case"-m":{let i=n??r[++e];if(i&&i.includes("=")){let s=i.indexOf("="),u=i.substring(0,s),l=i.substring(s+1);t.meta[u]=l}else console.error(`\u274C Invalid --meta format: ${i}. Use: --meta key=value`),process.exit(1);break}case"--updated-output":case"-o":t.updatedOutput=n??r[++e];break;case"--help":case"-h":G(),process.exit(0);break;default:o.startsWith("-")||a.push(o)}}return a.length>=1&&(t.folder=a[0]),a.length>=2&&(t.prefix=a[1]),t}function G(){console.log(`
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
`)}async function lt(){let r=it();r.folder||(console.error("\u274C Error: --folder is required"),G(),process.exit(1)),r.apiKey||(console.error("\u274C Error: --api-key or API_KEY environment variable is required"),process.exit(1)),r.prefix&&r.twoWaySync&&(console.error("\u274C Error: prefix is not supported with --two-way sync"),process.exit(1)),r.dryRun&&console.log(`[dry-run] folder=${r.folder}${r.prefix?` prefix=${r.prefix}`:""}`);let t=new O({folder:r.folder,prefix:r.prefix,apiUrl:r.apiUrl,apiKey:r.apiKey,twoWaySync:r.twoWaySync,verbose:r.verbose,conflictResolution:r.conflictResolution,meta:r.meta});console.log(`
\u{1F4CA} Classifying files...`);let a=await v(t),e=D(a,{twoWaySync:r.twoWaySync});if(console.log(`
\u{1F4CB} Sync Plan:`),console.log("-".repeat(40)),console.log(`  Unchanged:      ${e.unchanged}`),console.log(`  To push:        ${e.pushes.length}`),console.log(`  Local only:     ${e.localOnly.length}`),console.log(`  To pull:        ${e.pulls.length}`),console.log(`  Remote only:    ${e.remoteOnly.length}`),console.log(`  Conflicts:      ${e.conflicts.length}`),console.log(`  Local deleted:  ${e.localDeleted.length}`),console.log(`  Server deleted: ${e.serverDeleted.length}`),console.log("-".repeat(40)),r.verbose){if(e.pushes.length>0){console.log(`
\u{1F4E4} Files to push:`);for(let s of e.pushes)console.log(`  ${s.path}`)}if(e.localOnly.length>0){console.log(`
\u{1F195} New local files:`);for(let s of e.localOnly)console.log(`  ${s.path}`)}if(e.pulls.length>0){console.log(`
\u{1F4E5} Files to pull:`);for(let s of e.pulls)console.log(`  ${s.path}`)}if(e.remoteOnly.length>0){console.log(`
\u{1F310} New remote files:`);for(let s of e.remoteOnly)console.log(`  ${s.path}`)}if(e.localDeleted.length>0){console.log(`
\u{1F5D1}\uFE0F To hide on server:`);for(let s of e.localDeleted)console.log(`  ${s.path}`)}}if(r.dryRun){console.log(`
\u23F8\uFE0F Dry run - no changes made`);return}let o=e.pushes.length+e.localOnly.length+e.pulls.length+e.remoteOnly.length+e.conflicts.length+e.localDeleted.length+e.serverDeleted.length;console.log(`
\u{1F680} Executing sync...`);let n=await W(t,e,{twoWaySync:r.twoWaySync});if(o===0&&n.assetsUploaded===0&&n.assetsDownloaded===0){console.log(`
\u2705 Everything is up to date!`);return}if(console.log(`
`+"=".repeat(60)),console.log("\u{1F4CA} SYNC RESULTS:"),console.log("=".repeat(60)),console.log(`  Pushed:             ${n.pushed}`),console.log(`  Pulled:             ${n.pulled}`),console.log(`  Conflicts resolved: ${n.conflictsResolved}`),console.log(`  Assets uploaded:    ${n.assetsUploaded}`),console.log(`  Assets downloaded:  ${n.assetsDownloaded}`),n.errors.length>0){console.log(`  Errors:             ${n.errors.length}`);for(let s of n.errors)console.log(`    \u274C ${s}`)}console.log("=".repeat(60));let i=n.updatedUrls??[];if(i.length>0){if(console.log(`
\u{1F4CE} Published:`),i.length<=20)for(let{path:s,url:u}of i)console.log(`  ${s} \u2192 ${u}`);r.updatedOutput?($.writeFileSync(r.updatedOutput,JSON.stringify(i,null,2)),console.log(`\u{1F4BE} Saved to ${r.updatedOutput}`)):console.log("\u{1F4A1} --updated-output $(mktemp /tmp/updated-XXXXXX.json)")}}lt().catch(r=>{console.error("\u274C Fatal error:",r),process.exit(1)});
