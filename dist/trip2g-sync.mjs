#!/usr/bin/env node
import*as k from"fs";import*as G from"path";import*as g from"fs";import*as S from"path";import*as U from"crypto";function B(r){return!!(r.startsWith("_layouts/")&&(r.endsWith(".html")||r.endsWith(".html.json")))}import*as C from"path";function R(r,t,a){if(t.startsWith("./")){let o=C.dirname(a),l=C.join(o,t.slice(2));return r.fileExistsSync(l)?l:null}if(t.startsWith("/")){let o=t.slice(1);return r.fileExistsSync(o)?o:null}if(t.includes("/"))return r.fileExistsSync(t)?t:null;if(r.fileExistsSync(t))return t;let e=C.posix.join("assets",t);if(r.fileExistsSync(e))return e;let n=C.dirname(a);if(n&&n!=="."){let o=C.posix.join(n,t);if(r.fileExistsSync(o))return o}return null}var M=class{constructor(t,a={}){this.url=t;this.options=a}async request(t){let a=typeof t.document=="string"?t.document:t.document.loc?.source.body;if(!a)throw new Error("Invalid GraphQL document: no query string found");let e=await fetch(this.url,{method:"POST",headers:{"Content-Type":"application/json",...this.options.headers,...t.requestHeaders},body:JSON.stringify({query:a,variables:t.variables}),signal:t.signal});if(!e.ok){let o=await e.text().catch(()=>"");throw new Error(`HTTP ${e.status}: ${e.statusText}${o?`
${o}`:""}`)}let n=await e.json();if(n.errors?.length)throw new Error(`GraphQL Error: ${n.errors[0].message}`);if(!n.data)throw new Error("GraphQL response missing data");return n.data}};function P(r,...t){let a=r[0];for(let e=0;e<t.length;e++)a+=String(t[e])+r[e+1];return{loc:{source:{body:a}}}}var Q=P`
    query FetchServerHashes {
  notePaths {
    path: value
    hash: latestContentHash
  }
}
    `,q=P`
    query FetchPublishedUrls {
  notePaths {
    path: value
    latestNoteView {
      url
    }
  }
}
    `,K=P`
    query FetchAllWarnings {
  notePaths {
    path: value
    latestNoteView {
      url
      warnings {
        level
        message
      }
    }
  }
}
    `,_=P`
    query FetchNoteContents($filter: NotePathsFilter) {
  notePaths(filter: $filter) {
    path: value
    content
  }
}
    `,j=P`
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
    `,J=P`
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
    `,Y=P`
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
    `,z=P`
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
    `,X=P`
    mutation CommitNotes {
  commitNotes {
    ... on CommitNotesPayload {
      success
      updated {
        path
        url
        warnings {
          level
          message
        }
      }
    }
    ... on ErrorPayload {
      message
    }
  }
}
    `,Z=(r,t,a,e)=>r();function w(r,t=Z){return{FetchServerHashes(a,e,n){return t(o=>r.request({document:Q,variables:a,requestHeaders:{...e,...o},signal:n}),"FetchServerHashes","query",a)},FetchPublishedUrls(a,e,n){return t(o=>r.request({document:q,variables:a,requestHeaders:{...e,...o},signal:n}),"FetchPublishedUrls","query",a)},FetchAllWarnings(a,e,n){return t(o=>r.request({document:K,variables:a,requestHeaders:{...e,...o},signal:n}),"FetchAllWarnings","query",a)},FetchNoteContents(a,e,n){return t(o=>r.request({document:_,variables:a,requestHeaders:{...e,...o},signal:n}),"FetchNoteContents","query",a)},FetchNoteAssets(a,e,n){return t(o=>r.request({document:j,variables:a,requestHeaders:{...e,...o},signal:n}),"FetchNoteAssets","query",a)},PushNotes(a,e,n){return t(o=>r.request({document:J,variables:a,requestHeaders:{...e,...o},signal:n}),"PushNotes","mutation",a)},HideNotes(a,e,n){return t(o=>r.request({document:Y,variables:a,requestHeaders:{...e,...o},signal:n}),"HideNotes","mutation",a)},UploadNoteAsset(a,e,n){return t(o=>r.request({document:z,variables:a,requestHeaders:{...e,...o},signal:n}),"UploadNoteAsset","mutation",a)},CommitNotes(a,e,n){return t(o=>r.request({document:X,variables:a,requestHeaders:{...e,...o},signal:n}),"CommitNotes","mutation",a)}}}function O(r){let t=new M(r.apiUrl,{headers:{"X-API-Key":r.apiKey}});return w(t)}var v=".sync-state.json",N=class{constructor(t){this.pushBatchSize=100;this.folder=S.resolve(t.folder),this.prefix=t.prefix?t.prefix.replace(/\/$/,""):"",this.twoWaySync=t.twoWaySync,this.verbose=t.verbose??!1,this.conflictResolution=t.conflictResolution??"local",this.publishField=t.publishField??"",this.meta=t.meta??{},this.syncState=this.loadSyncState(),this.apiUrl=t.apiUrl,this.apiKey=t.apiKey,this.sdk=O({apiUrl:t.apiUrl,apiKey:t.apiKey})}toRemotePath(t){return this.prefix?`${this.prefix}/${t}`:t}toLocalPath(t){return this.prefix&&t.startsWith(this.prefix+"/")?t.substring(this.prefix.length+1):t}matchesPrefix(t){return this.prefix?t.startsWith(this.prefix+"/"):!0}loadSyncState(){let t=S.join(this.folder,v);try{if(g.existsSync(t)){let a=g.readFileSync(t,"utf-8");return JSON.parse(a)}}catch(a){this.log(`Warning: Could not load sync state: ${a}`)}return{files:{}}}log(t){this.verbose&&console.log(t)}async getLocalFiles(){let t=[],a=e=>{let n=g.readdirSync(e,{withFileTypes:!0});for(let o of n){if(o.name.startsWith(".")||o.name==="node_modules")continue;let l=S.join(e,o.name);if(o.isDirectory())a(l);else if(o.isFile()){let s=S.extname(o.name).toLowerCase();if(s===".md"||s===".html"||o.name.endsWith(".html.json")){let u=g.statSync(l),i=S.relative(this.folder,l);t.push({path:this.toRemotePath(i),mtime:u.mtimeMs})}}}};return a(this.folder),t}async getServerHashes(){try{return(await this.sdk.FetchServerHashes()).notePaths.filter(a=>this.matchesPrefix(a.path)).map(a=>({path:a.path,hash:a.hash}))}catch(t){return console.error(`\u274C Failed to fetch server hashes: ${t}`),[]}}getSyncState(){return this.syncState}async computeHash(t){return U.createHash("sha256").update(t,"utf-8").digest().toString("base64").replace(/\+/g,"-").replace(/\//g,"_")}async readFileContent(t){let a=this.toLocalPath(t),e=S.join(this.folder,a);return g.readFileSync(e,"utf-8")}async writeFile(t,a){let e=S.join(this.folder,t);g.writeFileSync(e,a,"utf-8")}async writeBinaryFile(t,a){let e=S.join(this.folder,t);g.writeFileSync(e,Buffer.from(a))}async readBinaryFile(t){let a=S.join(this.folder,t),e=g.readFileSync(a);return e.buffer.slice(e.byteOffset,e.byteOffset+e.byteLength)}async deleteFile(t){let a=S.join(this.folder,t);g.existsSync(a)&&g.unlinkSync(a)}async createFolder(t){let a=S.join(this.folder,t);g.mkdirSync(a,{recursive:!0})}async fileExists(t){return this.fileExistsSync(t)}fileExistsSync(t){let a=S.join(this.folder,t);return g.existsSync(a)}async pushNotes(t,a){if(t.length===0)return[];let e=t.map(n=>({path:n.path,content:this.injectMeta(n.content)}));if(this.publishField){for(let n of e)if(!this.hasPublishFieldInContent(n.content,n.path))throw new Error(`[Security] Attempted to push note "${n.path}" without publish field "${this.publishField}". This is a bug in the sync logic - please report it.`)}try{let n=await this.sdk.PushNotes({input:{updates:e.map(l=>({path:l.path,content:l.content})),skipCommit:a}});if("message"in n.pushNotes)throw new Error(`Push failed: ${n.pushNotes.message}`);console.log(`\u2705 Pushed ${t.length} notes`);let o=new Map((n.pushNotes.updated??[]).map(l=>[l.path,l.url??null]));return n.pushNotes.notes.map(l=>({id:String(l.id),path:l.path,assets:l.assets.map(s=>({path:s.path,sha256Hash:s.sha256Hash??null,absolutePath:s.absolutePath??null,url:s.url??null})),url:o.get(l.path)??null}))}catch(n){return console.error(`\u274C Failed to push notes: ${n}`),[]}}async hideNotes(t){if(t.length!==0)try{let a=await this.sdk.HideNotes({input:{paths:t}});if("message"in a.hideNotes)throw new Error(`Hide failed: ${a.hideNotes.message}`);console.log(`\u2705 Hidden ${t.length} notes`)}catch(a){console.error(`\u274C Failed to hide notes: ${a}`)}}async fetchNoteContents(t){if(t.length===0)return[];try{return(await this.sdk.FetchNoteContents({filter:{paths:t}})).notePaths.map(e=>({path:e.path,content:e.content}))}catch(a){return console.error(`\u274C Failed to fetch note contents: ${a}`),[]}}async fetchNoteAssets(t){if(t.length===0)return[];try{let a=await this.sdk.PushNotes({input:{updates:[]}});if("message"in a.pushNotes)return console.error(`\u274C Failed to fetch note assets: ${a.pushNotes.message}`),[];let e=new Set(t);return a.pushNotes.notes.filter(n=>e.has(n.path)).map(n=>({path:n.path,noteId:String(n.id),assets:n.assets.map(o=>({id:o.path,url:o.url,hash:o.sha256Hash??"",absolutePath:o.absolutePath}))}))}catch(a){return console.error(`\u274C Failed to fetch note assets: ${a}`),[]}}async uploadAsset(t){for(let e=1;e<=10;e++)try{if(await this.uploadAssetOnce(t))return!0}catch(n){if(e<10){this.log(`\u26A0\uFE0F Upload attempt ${e} failed, retrying: ${t.relativePath}`);continue}return console.error(`\u274C Failed to upload asset ${t.relativePath} after 10 attempts: ${n}`),!1}return!1}async uploadAssetOnce(t){let e=JSON.stringify({query:`mutation UploadNoteAsset($input: UploadNoteAssetInput!) {
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
}`,variables:{input:{file:null,noteId:parseInt(t.noteId),sha256Hash:t.sha256Hash,path:t.relativePath,absolutePath:t.absolutePath}}}),n=JSON.stringify({0:["variables.input.file"]}),o=new FormData;o.append("operations",e),o.append("map",n),o.append("0",t.blob,t.fileName);let l=await fetch(this.apiUrl,{method:"POST",headers:{"X-API-Key":this.apiKey},body:o});if(!l.ok){let i=await l.text();throw new Error(`HTTP ${l.status}: ${l.statusText}
${i}`)}let s=await l.json();if(s.errors)throw new Error(s.errors[0]?.message||"Unknown GraphQL error");let u=s.data?.uploadNoteAsset;if(u?.__typename==="ErrorPayload")throw new Error(`Upload failed: ${u.message}`);return u?.uploadSkipped?this.log(`\u23E9 Asset skipped (already exists): ${t.relativePath}`):console.log(`\u2705 Asset uploaded: ${t.relativePath}`),!0}async downloadAsset(t){try{let a=await fetch(t);return a.ok?await a.arrayBuffer():(console.error(`\u274C Failed to download asset: HTTP ${a.status}`),null)}catch(a){return console.error(`\u274C Failed to download asset from ${t}: ${a}`),null}}async commitNotes(){try{let t=await this.sdk.CommitNotes();if("message"in t.commitNotes)throw new Error(`Commit failed: ${t.commitNotes.message}`);return console.log("\u2705 Notes committed"),{updated:(t.commitNotes.updated??[]).map(a=>({path:a.path,url:a.url??"",warnings:(a.warnings??[]).map(e=>({level:e.level,message:e.message}))}))}}catch(t){return console.error(`\u274C Failed to commit notes: ${t}`),{updated:[]}}}async saveSyncState(t){let a=S.join(this.folder,v);t.lastSyncedAt=Date.now(),g.writeFileSync(a,JSON.stringify(t,null,2),"utf-8"),this.syncState=t}async computeBinaryHash(t){return U.createHash("sha256").update(Buffer.from(t)).digest("hex")}async resolveAssetPath(t,a){return R(this,t,a)}onProgress(t){this.verbose&&console.log(`  [${t.step}] ${t.current}/${t.total}: ${t.path??""}`)}async onConflict(t){if(this.conflictResolution==="fail"){console.error(`\u274C ${t.length} conflicts detected:`);for(let e of t)console.error(`   - ${e.path}`);throw new Error("Conflicts detected and --conflict-resolution=fail is set")}let a=this.cliToConflictResolution(this.conflictResolution);return console.log(`\u26A0\uFE0F ${t.length} conflicts detected, resolving with: ${this.conflictResolution}`),t.map(()=>a)}async onAssetConflict(t){if(this.conflictResolution==="fail"){console.error(`\u274C ${t.length} asset conflicts detected:`);for(let e of t)console.error(`   - ${e.path}`);throw new Error("Asset conflicts detected and --conflict-resolution=fail is set")}let a=this.cliToAssetConflictResolution(this.conflictResolution);return console.log(`\u26A0\uFE0F ${t.length} asset conflicts detected, resolving with: ${this.conflictResolution}`),t.map(()=>a)}cliToConflictResolution(t){switch(t){case"local":return"keep_local";case"remote":return"keep_remote";case"skip":return"skip";default:return"keep_local"}}cliToAssetConflictResolution(t){switch(t){case"local":return"keep_local";case"remote":return"keep_remote";case"skip":return"skip";default:return"keep_local"}}async onServerDeleted(t){return console.log(`\u26A0\uFE0F ${t.length} files deleted on server, keeping local copies`),!1}async confirmPush(t){return console.log(`\u{1F4E4} Pushing ${t.length} files...`),!0}injectMeta(t){if(Object.keys(this.meta).length===0)return t;if(t.startsWith("---")){let e=t.indexOf(`
---`,3);if(e!==-1){let n=t.slice(4,e),o=t.slice(e+4);for(let[l,s]of Object.entries(this.meta)){let u=new RegExp(`^${l}\\s*:.*$`,"m");u.test(n)?n=n.replace(u,`${l}: ${s}`):n=n.trimEnd()+`
${l}: ${s}`}return`---
${n}
---${o}`}}return`---
${Object.entries(this.meta).map(([e,n])=>`${e}: ${n}`).join(`
`)}
---
${t}`}hasPublishFieldInContent(t,a){if(!this.publishField||B(a))return!0;if(!t.startsWith("---"))return!1;let e=t.indexOf(`
---`,3);if(e===-1)return!1;let n=t.slice(4,e),o=this.publishField.split(",").map(l=>l.trim()).filter(l=>l);for(let l of o){let s=new RegExp(`^${l}\\s*:\\s*(.+)$`,"m"),u=n.match(s);if(u){let i=u[1].trim().toLowerCase();if(i==="true"||i==="yes"||i==="1"||i==='"true"'||i==="'true'")return!0}}return!1}};function tt(r,t,a){return r===null&&t===null||r===t?"unchanged":r!==null&&t===null?a?"server_deleted":"local_only":r===null&&t!==null?a?"local_deleted":"remote_only":a?r===a?"pull":t===a?"push":"conflict":"conflict"}async function D(r){let t=r.getSyncState(),[a,e]=await Promise.all([r.getLocalFiles(),r.getServerHashes()]),n=new Map;for(let A of e)n.set(A.path,A.hash);let o=new Map,l=t.mtimes||{},s=t.localHashes||{};for(let A of a){let x=l[A.path],f=s[A.path];if(x===A.mtime&&f)o.set(A.path,f);else{let T=await r.readFileContent(A.path),E=await r.computeHash(T);o.set(A.path,E)}}let u=new Set([...o.keys(),...n.keys()]),i=[],p=[],c=[],y=[],m=[],d=[],h=[],b=[],F=0;for(let A of u){let x=o.get(A)||null,f=n.get(A)||null,T=t.files[A]||null,E=tt(x,f,T),I={path:A,action:E,localHash:x,remoteHash:f,lastSyncedHash:T};switch(i.push(I),E){case"unchanged":F++;break;case"pull":p.push(I);break;case"push":c.push(I);break;case"conflict":y.push(I);break;case"local_only":m.push(I);break;case"remote_only":d.push(I);break;case"local_deleted":h.push(I);break;case"server_deleted":b.push(I);break}}return{classifications:i,pulls:p,pushes:c,conflicts:y,localOnly:m,remoteOnly:d,localDeleted:h,serverDeleted:b,unchanged:F}}function W(r,t){let{twoWaySync:a,hasPublishFields:e}=t,n=d=>e?e(d):!0,o=[],l=[],s=[],u=[],i=[],p=[],c=[],y=[],m=0;for(let d of r.classifications){let h=n(d.path);switch(d.action){case"unchanged":o.push(d),m++;break;case"pull":a&&h&&(o.push(d),l.push(d));break;case"push":h&&(o.push(d),s.push(d));break;case"conflict":if(a)h&&(o.push(d),u.push(d));else if(h){let b={...d,action:"push"};o.push(b),s.push(b)}break;case"local_only":h&&(o.push(d),i.push(d));break;case"remote_only":a&&(o.push(d),p.push(d));break;case"local_deleted":h&&(o.push(d),c.push(d));break;case"server_deleted":a&&(o.push(d),y.push(d));break}}return{classifications:o,pulls:l,pushes:s,conflicts:u,localOnly:i,remoteOnly:p,localDeleted:c,serverDeleted:y,unchanged:m}}async function $(r,t,a={twoWaySync:!1}){let e={pulled:0,pushed:0,conflictsResolved:0,assetsUploaded:0,assetsDownloaded:0,errors:[],updatedUrls:[],warnings:[]},n=r.getSyncState(),o=[];if(t.pulls.length>0||t.remoteOnly.length>0){let i=[...t.pulls,...t.remoteOnly],p=await et(r,i,n);e.pulled=p.count,e.errors.push(...p.errors),o.push(...p.pulledPaths)}if(o.length>0){let i=await H(r,o);e.assetsDownloaded+=i.downloaded,e.errors.push(...i.errors)}if(a.twoWaySync){let i=t.classifications.filter(p=>p.action==="unchanged"&&p.remoteHash!==null).map(p=>p.path);if(i.length>0){let p=await H(r,i);e.assetsDownloaded+=p.downloaded,e.errors.push(...p.errors)}}if(t.serverDeleted.length>0&&await nt(r,t.serverDeleted,n),t.conflicts.length>0){let i=await rt(r,t.conflicts,n);e.conflictsResolved=i.resolved,e.errors.push(...i.errors)}let l=[...t.pushes,...t.localOnly],s=[];if(l.length>0&&await r.confirmPush(l.map(p=>p.path))){let p=await at(r,l,n);e.pushed=p.count,e.errors.push(...p.errors),s=p.pushedNotes}if(t.localDeleted.length>0&&await st(r,t.localDeleted,n),s.length>0){let i=await it(r,s,a.twoWaySync);e.assetsUploaded=i.uploaded,e.assetsDownloaded=i.downloaded,e.errors.push(...i.errors)}let u=t.classifications.filter(i=>i.action==="unchanged"&&i.remoteHash!==null).map(i=>i.path);if(u.length>0){let i=await ut(r,u);e.assetsUploaded+=i.uploaded,e.errors.push(...i.errors)}if(e.pushed>0||e.assetsUploaded>0){let i=await r.commitNotes();e.updatedUrls=i.updated.map(({path:p,url:c})=>({path:p,url:c}));for(let p of i.updated)for(let c of p.warnings)e.warnings.push({path:p.path,level:c.level,message:c.message})}return await r.saveSyncState(n),e}async function et(r,t,a){if(t.length===0)return{count:0,errors:[],pulledPaths:[]};let e=t.map(c=>c.path),n=[],o=[],l=0,s=await r.fetchNoteContents(e),u=new Map(s.map(c=>[c.path,c.content])),i=t.length,p=0;for(let c of t){p++,r.onProgress({step:"pull",current:p,total:i,path:c.path});let y=u.get(c.path);if(y===void 0){n.push(`Failed to fetch: ${c.path}`);continue}try{let m=c.path.substring(0,c.path.lastIndexOf("/"));m&&await r.createFolder(m),await r.writeFile(c.path,y);let d=await r.computeHash(y);a.files[c.path]=d,l++,o.push(c.path)}catch(m){n.push(`Failed to write ${c.path}: ${m}`)}}return{count:l,errors:n,pulledPaths:o}}async function at(r,t,a){if(t.length===0)return{count:0,errors:[],pushedNotes:[],urls:[]};let e=[],n=[],o=t.length,l=0;for(let d of t){l++,r.onProgress({step:"push",current:l,total:o,path:d.path});try{let h=await r.readFileContent(d.path);n.push({path:d.path,content:h})}catch(h){e.push(`Failed to read ${d.path}: ${h}`)}}if(n.length===0)return{count:0,errors:e,pushedNotes:[],urls:[]};let s=new Set(n.map(d=>d.path)),u=r.pushBatchSize||100,i=[];for(let d=0;d<n.length;d+=u){let h=n.slice(d,d+u),b=await r.pushNotes(h,!0);i.push(...b)}let p=new Set(i.map(d=>d.path)),c=0;for(let d of n)if(p.has(d.path)){let h=await r.computeHash(d.content);a.files[d.path]=h,c++}let y=i.filter(d=>s.has(d.path)),m=y.filter(d=>typeof d.url=="string").map(d=>({path:d.path,url:d.url}));return{count:c,errors:e,pushedNotes:y,urls:m}}async function rt(r,t,a){if(t.length===0)return{resolved:0,errors:[]};let e=[],n=t.map(p=>p.path),o=await r.fetchNoteContents(n),l=new Map(o.map(p=>[p.path,p.content])),s=[];for(let p of t){let c=l.get(p.path);if(c!==void 0)try{let y=await r.readFileContent(p.path);s.push({path:p.path,localContent:y,remoteContent:c,localHash:p.localHash,remoteHash:p.remoteHash})}catch(y){console.warn(`Failed to read local file for conflict ${p.path}:`,y),e.push(`Failed to read local file for conflict: ${p.path}`)}}if(s.length===0)return{resolved:0,errors:e};let u=await r.onConflict(s),i=0;for(let p=0;p<s.length;p++){let c=s[p],y=u[p]||"skip";try{await ot(r,c,y,a),y!=="skip"&&i++}catch(m){e.push(`Failed to resolve conflict for ${c.path}: ${m}`)}}return{resolved:i,errors:e}}async function ot(r,t,a,e){switch(a){case"keep_local":await r.pushNotes([{path:t.path,content:t.localContent}],!0),e.files[t.path]=t.localHash;break;case"keep_remote":await r.writeFile(t.path,t.remoteContent),e.files[t.path]=t.remoteHash;break;case"keep_both":{let n=t.path.substring(t.path.lastIndexOf(".")),l=`${t.path.substring(0,t.path.lastIndexOf("."))} (server)${n}`;await r.writeFile(l,t.remoteContent),e.files[t.path]=t.localHash;let s=await r.computeHash(t.remoteContent);e.files[l]=s;break}case"skip":break}}async function nt(r,t,a){if(t.length===0)return;let e=t.map(o=>o.path);if(await r.onServerDeleted(e))for(let o of t)try{await r.deleteFile(o.path),delete a.files[o.path]}catch(l){console.warn(`Failed to delete file ${o.path}:`,l)}else for(let o of t)o.localHash&&(a.files[o.path]=o.localHash)}async function st(r,t,a){if(t.length===0)return;let e=t.map(n=>n.path);await r.hideNotes(e);for(let n of e)delete a.files[n]}async function it(r,t,a){console.log(`[Trip2g Sync] syncAssets called with ${t.length} notes, twoWaySync=${a}`);let e={uploaded:0,downloaded:0,conflictsResolved:0,errors:[]};if(t.length===0)return e;let n=[],o=[],l=[];for(let s of t)if(console.log(`[Trip2g Sync] Processing assets for note: ${s.path}, assets count: ${s.assets?.length??0}`),!(!s.assets||s.assets.length===0))for(let u of s.assets){let i=await r.resolveAssetPath(u.path,s.path);if(console.log(`[Trip2g Sync] Asset "${u.path}" -> localPath: ${i??"NOT FOUND"}, sha256Hash: ${u.sha256Hash??"null"}`),!i)continue;if(!u.sha256Hash||!u.absolutePath||!u.url){console.log(`[Trip2g Sync] Queuing upload: ${u.path} (no hash on server)`),n.push({noteId:s.id,notePath:s.path,asset:u,localPath:i});continue}if(await r.fileExists(i))try{let c=await r.readBinaryFile(i),y=await r.computeBinaryHash(c);if(y===u.sha256Hash)continue;l.push({path:u.path,absolutePath:i,noteId:s.id,localHash:y,remoteHash:u.sha256Hash,remoteUrl:u.url})}catch(c){e.errors.push(`Failed to read local asset ${i}: ${c}`)}else a&&o.push({asset:u,localPath:i})}if(console.log(`[Trip2g Sync] Assets to upload: ${n.length}, to download: ${o.length}, conflicts: ${l.length}`),n.length>0){let s=new Map;for(let c of n){let y=`${c.noteId}:${c.localPath}`;s.has(y)||s.set(y,c)}let u=Array.from(s.values()),i=u.length,p=0;console.log(`[Trip2g Sync] Uploading ${i} unique (note, asset) pairs`);for(let c of u){p++,console.log(`[Trip2g Sync] Uploading asset ${p}/${i}: ${c.localPath}`),r.onProgress({step:"upload_asset",current:p,total:i,path:c.asset.path});try{let y=await r.readBinaryFile(c.localPath),m=await r.computeBinaryHash(y),d=new Blob([y]),h=c.localPath.substring(c.localPath.lastIndexOf("/")+1);await r.uploadAsset({noteId:c.noteId,blob:d,fileName:h,relativePath:c.asset.path,absolutePath:c.localPath,sha256Hash:m})&&e.uploaded++}catch(y){e.errors.push(`Failed to upload asset ${c.asset.path}: ${y}`)}}}if(o.length>0){let s=o.length,u=0;for(let i of o)if(u++,r.onProgress({step:"download_asset",current:u,total:s,path:i.asset.path}),!!i.asset.url)try{let p=await r.downloadAsset(i.asset.url);if(!p){e.errors.push(`Failed to download asset ${i.asset.path}`);continue}let c=i.localPath.substring(0,i.localPath.lastIndexOf("/"));c&&await r.createFolder(c),await r.writeBinaryFile(i.localPath,p),e.downloaded++}catch(p){e.errors.push(`Failed to download asset ${i.asset.path}: ${p}`)}}if(l.length>0){let s=await lt(r,l,a);e.uploaded+=s.uploaded,e.downloaded+=s.downloaded,e.conflictsResolved=s.conflictsResolved,e.errors.push(...s.errors)}return e}async function lt(r,t,a){let e={uploaded:0,downloaded:0,conflictsResolved:0,errors:[]};if(t.length===0)return e;let n;a?n=await r.onAssetConflict(t):n=t.map(()=>"keep_local");for(let o=0;o<t.length;o++){let l=t[o],s=n[o]||"skip";try{if(s==="keep_local"){let u=await r.readBinaryFile(l.absolutePath),i=new Blob([u]),p=l.absolutePath.substring(l.absolutePath.lastIndexOf("/")+1);await r.uploadAsset({noteId:l.noteId,blob:i,fileName:p,relativePath:l.path,absolutePath:l.absolutePath,sha256Hash:l.localHash})&&(e.uploaded++,e.conflictsResolved++)}else if(s==="keep_remote"){let u=await r.downloadAsset(l.remoteUrl);u?(await r.writeBinaryFile(l.absolutePath,u),e.downloaded++,e.conflictsResolved++):e.errors.push(`Failed to download asset ${l.path}`)}}catch(u){e.errors.push(`Failed to resolve asset conflict for ${l.path}: ${u}`)}}return e}async function H(r,t){let a={downloaded:0,errors:[]};if(t.length===0)return a;let e=await r.fetchNoteAssets(t);if(e.length===0)return a;let n=new Map;for(let s of e)for(let u of s.assets){let i=u.absolutePath.replace(/^\//,"");n.has(i)||await r.fileExists(i)||n.set(i,{url:u.url,hash:u.hash})}if(n.size===0)return a;let o=n.size,l=0;for(let[s,{url:u}]of n){l++,r.onProgress({step:"download_asset",current:l,total:o,path:s});try{let i=await r.downloadAsset(u);if(!i){a.errors.push(`Failed to download asset ${s}`);continue}let p=s.substring(0,s.lastIndexOf("/"));p&&await r.createFolder(p),await r.writeBinaryFile(s,i),a.downloaded++}catch(i){a.errors.push(`Failed to download asset ${s}: ${i}`)}}return a}async function ut(r,t){let a={uploaded:0,errors:[]};if(t.length===0)return a;let e=await r.fetchNoteAssets(t);if(e.length===0)return a;let n=[];for(let s of e)for(let u of s.assets){let i=u.absolutePath?.replace(/^\//,"");if(!i&&u.id){let c=s.path.includes("/")?s.path.substring(0,s.path.lastIndexOf("/")):"",y=u.id.replace(/^\.\//,"");i=c?`${c}/${y}`:y}if(!(!i||!await r.fileExists(i)))try{let c=await r.readBinaryFile(i),y=await r.computeBinaryHash(c);if(y===u.hash)continue;n.push({noteId:s.noteId,notePath:s.path,assetPath:u.id,localPath:i,localHash:y})}catch(c){a.errors.push(`Failed to read local asset ${i}: ${c}`)}}if(n.length===0)return a;let o=n.length,l=0;for(let s of n){l++,r.onProgress({step:"upload_asset",current:l,total:o,path:s.assetPath});try{let u=await r.readBinaryFile(s.localPath),i=new Blob([u]),p=s.localPath.substring(s.localPath.lastIndexOf("/")+1);await r.uploadAsset({noteId:s.noteId,blob:i,fileName:p,relativePath:s.assetPath,absolutePath:s.localPath,sha256Hash:s.localHash})&&a.uploaded++}catch(u){a.errors.push(`Failed to upload asset ${s.assetPath}: ${u}`)}}return a}function L(){try{let r=G.join(process.cwd(),".obsidian","plugins","trip2g","data.json"),a=JSON.parse(k.readFileSync(r,"utf8"))?.syncDirs?.[0];return a?{apiUrl:a.apiUrl?`${a.apiUrl}/_system/graphql`:void 0,apiKey:a.apiKey||void 0}:{}}catch{return{}}}function pt(){let r=process.argv.slice(2),t=L(),a={folder:"",prefix:"",apiUrl:process.env.TRIP2G_ENDPOINT||process.env.ENDPOINT||t.apiUrl||"http://localhost:8081/_system/graphql",apiKey:process.env.TRIP2G_API_KEY||process.env.API_KEY||t.apiKey||"",twoWaySync:!1,verbose:!1,dryRun:!1,conflictResolution:"local",meta:{},updatedOutput:""},e=[];for(let n=0;n<r.length;n++){let o=r[n],l;if(o.includes("=")&&o.startsWith("-")){let s=o.indexOf("=");l=o.substring(s+1),o=o.substring(0,s)}switch(o){case"--api-url":case"-u":a.apiUrl=l??r[++n];break;case"--api-key":case"-k":a.apiKey=l??r[++n];break;case"--two-way":case"-2":a.twoWaySync=!0;break;case"--verbose":case"-v":a.verbose=!0;break;case"--dry-run":case"-n":a.dryRun=!0;break;case"--conflict-resolution":case"-c":{let s=l??r[++n];s==="local"||s==="remote"||s==="skip"||s==="fail"?a.conflictResolution=s:(console.error(`\u274C Invalid conflict resolution: ${s}. Use: local, remote, skip, fail`),process.exit(1));break}case"--meta":case"-m":{let s=l??r[++n];if(s&&s.includes("=")){let u=s.indexOf("="),i=s.substring(0,u),p=s.substring(u+1);a.meta[i]=p}else console.error(`\u274C Invalid --meta format: ${s}. Use: --meta key=value`),process.exit(1);break}case"--updated-output":case"-o":a.updatedOutput=l??r[++n];break;case"--help":case"-h":V(),process.exit(0);break;default:o.startsWith("-")||e.push(o)}}return e.length>=1&&(a.folder=e[0]),e.length>=2&&(a.prefix=e[1]),a}function V(){console.log(`
obsidian-sync CLI

Usage:
  npx ts-node src/sync/cli/cmd.ts [options] <folder> [prefix]

Arguments:
  folder                   Local folder to sync (required)
  prefix                   Remote path prefix (optional, for multi-repo setups)

Options:
  -u, --api-url <url>      GraphQL endpoint (default: $ENDPOINT or .obsidian/plugins/trip2g/data.json or http://localhost:8081/_system/graphql)
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
`)}async function ct(){let r=L(),t=process.env.TRIP2G_ENDPOINT||process.env.ENDPOINT||r.apiUrl||"http://localhost:8081/_system/graphql",a=process.env.TRIP2G_API_KEY||process.env.API_KEY||r.apiKey||"";a||(console.error("\u274C TRIP2G_API_KEY or API_KEY required"),process.exit(1));let n=await O({apiUrl:t,apiKey:a}).FetchAllWarnings(),o=[];for(let l of n.notePaths){let s=l.latestNoteView;if(s)for(let u of s.warnings??[])o.push({path:l.path,level:u.level,message:u.message,url:s.url??""})}console.log(JSON.stringify(o,null,2))}async function dt(){if(process.argv[2]==="warnings"){await ct();return}let r=pt();r.folder||(console.error("\u274C Error: --folder is required"),V(),process.exit(1)),r.apiKey||(console.error("\u274C Error: --api-key or API_KEY environment variable is required"),process.exit(1)),r.prefix&&r.twoWaySync&&(console.error("\u274C Error: prefix is not supported with --two-way sync"),process.exit(1)),r.dryRun&&console.log(`[dry-run] folder=${r.folder}${r.prefix?` prefix=${r.prefix}`:""}`);let t=new N({folder:r.folder,prefix:r.prefix,apiUrl:r.apiUrl,apiKey:r.apiKey,twoWaySync:r.twoWaySync,verbose:r.verbose,conflictResolution:r.conflictResolution,meta:r.meta});console.log(`
\u{1F4CA} Classifying files...`);let a=await D(t),e=W(a,{twoWaySync:r.twoWaySync});if(console.log(`
\u{1F4CB} Sync Plan:`),console.log("-".repeat(40)),console.log(`  Unchanged:      ${e.unchanged}`),console.log(`  To push:        ${e.pushes.length}`),console.log(`  Local only:     ${e.localOnly.length}`),console.log(`  To pull:        ${e.pulls.length}`),console.log(`  Remote only:    ${e.remoteOnly.length}`),console.log(`  Conflicts:      ${e.conflicts.length}`),console.log(`  Local deleted:  ${e.localDeleted.length}`),console.log(`  Server deleted: ${e.serverDeleted.length}`),console.log("-".repeat(40)),r.verbose){if(e.pushes.length>0){console.log(`
\u{1F4E4} Files to push:`);for(let s of e.pushes)console.log(`  ${s.path}`)}if(e.localOnly.length>0){console.log(`
\u{1F195} New local files:`);for(let s of e.localOnly)console.log(`  ${s.path}`)}if(e.pulls.length>0){console.log(`
\u{1F4E5} Files to pull:`);for(let s of e.pulls)console.log(`  ${s.path}`)}if(e.remoteOnly.length>0){console.log(`
\u{1F310} New remote files:`);for(let s of e.remoteOnly)console.log(`  ${s.path}`)}if(e.localDeleted.length>0){console.log(`
\u{1F5D1}\uFE0F To hide on server:`);for(let s of e.localDeleted)console.log(`  ${s.path}`)}}if(r.dryRun){console.log(`
\u23F8\uFE0F Dry run - no changes made`);return}let n=e.pushes.length+e.localOnly.length+e.pulls.length+e.remoteOnly.length+e.conflicts.length+e.localDeleted.length+e.serverDeleted.length;console.log(`
\u{1F680} Executing sync...`);let o=await $(t,e,{twoWaySync:r.twoWaySync});if(n===0&&o.assetsUploaded===0&&o.assetsDownloaded===0){console.log(`
\u2705 Everything is up to date!`);return}if(console.log(`
`+"=".repeat(60)),console.log("\u{1F4CA} SYNC RESULTS:"),console.log("=".repeat(60)),console.log(`  Pushed:             ${o.pushed}`),console.log(`  Pulled:             ${o.pulled}`),console.log(`  Conflicts resolved: ${o.conflictsResolved}`),console.log(`  Assets uploaded:    ${o.assetsUploaded}`),console.log(`  Assets downloaded:  ${o.assetsDownloaded}`),o.errors.length>0){console.log(`  Errors:             ${o.errors.length}`);for(let s of o.errors)console.log(`    \u274C ${s}`)}if(o.warnings.length>0){console.log(`  Warnings:           ${o.warnings.length}`);for(let s of o.warnings)console.log(`    \u26A0\uFE0F  [${s.level}] ${s.path}: ${s.message}`)}console.log("=".repeat(60));let l=o.updatedUrls??[];if(l.length>0){if(console.log(`
\u{1F4CE} Published:`),l.length<=20)for(let{path:s,url:u}of l)console.log(`  ${s} \u2192 ${u}`);r.updatedOutput?(k.writeFileSync(r.updatedOutput,JSON.stringify(l,null,2)),console.log(`\u{1F4BE} Saved to ${r.updatedOutput}`)):console.log("\u{1F4A1} --updated-output $(mktemp /tmp/updated-XXXXXX.json)")}}dt().catch(r=>{console.error("\u274C Fatal error:",r),process.exit(1)});
