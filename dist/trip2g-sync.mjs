#!/usr/bin/env node
import*as h from"fs";import*as m from"path";import*as B from"crypto";import*as I from"path";function w(r,t,a){if(t.startsWith("./")){let o=I.dirname(a),i=I.join(o,t.slice(2));return r.fileExistsSync(i)?i:null}if(t.startsWith("/")){let o=t.slice(1);return r.fileExistsSync(o)?o:null}if(t.includes("/"))return r.fileExistsSync(t)?t:null;if(r.fileExistsSync(t))return t;let e=I.posix.join("assets",t);if(r.fileExistsSync(e))return e;let n=I.dirname(a);if(n&&n!=="."){let o=I.posix.join(n,t);if(r.fileExistsSync(o))return o}return null}var E=class{constructor(t,a={}){this.url=t;this.options=a}async request(t){let a=typeof t.document=="string"?t.document:t.document.loc?.source.body;if(!a)throw new Error("Invalid GraphQL document: no query string found");let e=await fetch(this.url,{method:"POST",headers:{"Content-Type":"application/json",...this.options.headers,...t.requestHeaders},body:JSON.stringify({query:a,variables:t.variables}),signal:t.signal});if(!e.ok)throw new Error(`HTTP ${e.status}: ${e.statusText}`);let n=await e.json();if(n.errors?.length)throw new Error(`GraphQL Error: ${n.errors[0].message}`);if(!n.data)throw new Error("GraphQL response missing data");return n.data}};function P(r,...t){let a=r[0];for(let e=0;e<t.length;e++)a+=String(t[e])+r[e+1];return{loc:{source:{body:a}}}}var $=P`
    query FetchServerHashes {
  notePaths {
    path: value
    hash: latestContentHash
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
    `,V=P`
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
    `,G=P`
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
    `,j=(r,t,a,e)=>r();function U(r,t=j){return{FetchServerHashes(a,e,n){return t(o=>r.request({document:$,variables:a,requestHeaders:{...e,...o},signal:n}),"FetchServerHashes","query",a)},FetchNoteContents(a,e,n){return t(o=>r.request({document:Q,variables:a,requestHeaders:{...e,...o},signal:n}),"FetchNoteContents","query",a)},FetchNoteAssets(a,e,n){return t(o=>r.request({document:q,variables:a,requestHeaders:{...e,...o},signal:n}),"FetchNoteAssets","query",a)},PushNotes(a,e,n){return t(o=>r.request({document:V,variables:a,requestHeaders:{...e,...o},signal:n}),"PushNotes","mutation",a)},HideNotes(a,e,n){return t(o=>r.request({document:K,variables:a,requestHeaders:{...e,...o},signal:n}),"HideNotes","mutation",a)},UploadNoteAsset(a,e,n){return t(o=>r.request({document:G,variables:a,requestHeaders:{...e,...o},signal:n}),"UploadNoteAsset","mutation",a)},CommitNotes(a,e,n){return t(o=>r.request({document:_,variables:a,requestHeaders:{...e,...o},signal:n}),"CommitNotes","mutation",a)}}}function O(r){let t=new E(r.apiUrl,{headers:{"X-API-Key":r.apiKey}});return U(t)}var F=".sync-state.json",M=class{constructor(t){this.pushBatchSize=100;this.folder=m.resolve(t.folder),this.twoWaySync=t.twoWaySync,this.verbose=t.verbose??!1,this.conflictResolution=t.conflictResolution??"local",this.syncState=this.loadSyncState(),this.apiUrl=t.apiUrl,this.apiKey=t.apiKey,this.sdk=O({apiUrl:t.apiUrl,apiKey:t.apiKey})}loadSyncState(){let t=m.join(this.folder,F);try{if(h.existsSync(t)){let a=h.readFileSync(t,"utf-8");return JSON.parse(a)}}catch(a){this.log(`Warning: Could not load sync state: ${a}`)}return{files:{}}}log(t){this.verbose&&console.log(t)}async getLocalFiles(){let t=[],a=e=>{let n=h.readdirSync(e,{withFileTypes:!0});for(let o of n){if(o.name.startsWith(".")||o.name==="node_modules")continue;let i=m.join(e,o.name);if(o.isDirectory())a(i);else if(o.isFile()){let l=m.extname(o.name).toLowerCase();if(l===".md"||l===".html"){let u=h.statSync(i),s=m.relative(this.folder,i);t.push({path:s,mtime:u.mtimeMs})}}}};return a(this.folder),t}async getServerHashes(){try{return(await this.sdk.FetchServerHashes()).notePaths.map(a=>({path:a.path,hash:a.hash}))}catch(t){return console.error(`\u274C Failed to fetch server hashes: ${t}`),[]}}getSyncState(){return this.syncState}async computeHash(t){return B.createHash("sha256").update(t,"utf-8").digest().toString("base64").replace(/\+/g,"-").replace(/\//g,"_")}async readFileContent(t){let a=m.join(this.folder,t);return h.readFileSync(a,"utf-8")}async writeFile(t,a){let e=m.join(this.folder,t);h.writeFileSync(e,a,"utf-8")}async writeBinaryFile(t,a){let e=m.join(this.folder,t);h.writeFileSync(e,Buffer.from(a))}async readBinaryFile(t){let a=m.join(this.folder,t),e=h.readFileSync(a);return e.buffer.slice(e.byteOffset,e.byteOffset+e.byteLength)}async deleteFile(t){let a=m.join(this.folder,t);h.existsSync(a)&&h.unlinkSync(a)}async createFolder(t){let a=m.join(this.folder,t);h.mkdirSync(a,{recursive:!0})}async fileExists(t){return this.fileExistsSync(t)}fileExistsSync(t){let a=m.join(this.folder,t);return h.existsSync(a)}async pushNotes(t,a){if(t.length===0)return[];try{let e=await this.sdk.PushNotes({input:{updates:t.map(n=>({path:n.path,content:n.content})),skipCommit:a}});if("message"in e.pushNotes)throw new Error(`Push failed: ${e.pushNotes.message}`);return console.log(`\u2705 Pushed ${t.length} notes`),e.pushNotes.notes.map(n=>({id:String(n.id),path:n.path,assets:n.assets.map(o=>({path:o.path,sha256Hash:o.sha256Hash??null,absolutePath:o.absolutePath??null,url:o.url??null}))}))}catch(e){return console.error(`\u274C Failed to push notes: ${e}`),[]}}async hideNotes(t){if(t.length!==0)try{let a=await this.sdk.HideNotes({input:{paths:t}});if("message"in a.hideNotes)throw new Error(`Hide failed: ${a.hideNotes.message}`);console.log(`\u2705 Hidden ${t.length} notes`)}catch(a){console.error(`\u274C Failed to hide notes: ${a}`)}}async fetchNoteContents(t){if(t.length===0)return[];try{return(await this.sdk.FetchNoteContents({filter:{paths:t}})).notePaths.map(e=>({path:e.path,content:e.content}))}catch(a){return console.error(`\u274C Failed to fetch note contents: ${a}`),[]}}async fetchNoteAssets(t){if(t.length===0)return[];try{return(await this.sdk.FetchNoteAssets({filter:{paths:t}})).notePaths.map(e=>({path:e.path,assets:e.assetReplaces.map(n=>({id:n.id,url:n.url,hash:n.hash,absolutePath:n.absolutePath}))}))}catch(a){return console.error(`\u274C Failed to fetch note assets: ${a}`),[]}}async uploadAsset(t){for(let e=1;e<=3;e++)try{if(await this.uploadAssetOnce(t))return!0}catch(n){if(e<3){this.log(`\u26A0\uFE0F Upload attempt ${e} failed, retrying: ${t.relativePath}`);continue}return console.error(`\u274C Failed to upload asset ${t.relativePath} after 3 attempts: ${n}`),!1}return!1}async uploadAssetOnce(t){let e=JSON.stringify({query:`mutation UploadNoteAsset($input: UploadNoteAssetInput!) {
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
}`,variables:{input:{file:null,noteId:parseInt(t.noteId),sha256Hash:t.sha256Hash,path:t.relativePath,absolutePath:t.absolutePath}}}),n=JSON.stringify({0:["variables.input.file"]}),o=new FormData;o.append("operations",e),o.append("map",n),o.append("0",t.blob,t.fileName);let i=await fetch(this.apiUrl,{method:"POST",headers:{"X-API-Key":this.apiKey},body:o});if(!i.ok)throw new Error(`HTTP ${i.status}: ${i.statusText}`);let l=await i.json();if(l.errors)throw new Error(l.errors[0]?.message||"Unknown GraphQL error");let u=l.data?.uploadNoteAsset;if(u?.__typename==="ErrorPayload")throw new Error(`Upload failed: ${u.message}`);return u?.uploadSkipped?this.log(`\u23E9 Asset skipped (already exists): ${t.relativePath}`):console.log(`\u2705 Asset uploaded: ${t.relativePath}`),!0}async downloadAsset(t){try{let a=await fetch(t);return a.ok?await a.arrayBuffer():(console.error(`\u274C Failed to download asset: HTTP ${a.status}`),null)}catch(a){return console.error(`\u274C Failed to download asset from ${t}: ${a}`),null}}async commitNotes(){try{let t=await this.sdk.CommitNotes();if("message"in t.commitNotes)throw new Error(`Commit failed: ${t.commitNotes.message}`);console.log("\u2705 Notes committed")}catch(t){console.error(`\u274C Failed to commit notes: ${t}`)}}async saveSyncState(t){let a=m.join(this.folder,F);t.lastSyncedAt=Date.now(),h.writeFileSync(a,JSON.stringify(t,null,2),"utf-8"),this.syncState=t}async computeBinaryHash(t){return B.createHash("sha256").update(Buffer.from(t)).digest("hex")}async resolveAssetPath(t,a){return w(this,t,a)}onProgress(t){this.verbose&&console.log(`  [${t.step}] ${t.current}/${t.total}: ${t.path??""}`)}async onConflict(t){if(this.conflictResolution==="fail"){console.error(`\u274C ${t.length} conflicts detected:`);for(let e of t)console.error(`   - ${e.path}`);throw new Error("Conflicts detected and --conflict-resolution=fail is set")}let a=this.cliToConflictResolution(this.conflictResolution);return console.log(`\u26A0\uFE0F ${t.length} conflicts detected, resolving with: ${this.conflictResolution}`),t.map(()=>a)}async onAssetConflict(t){if(this.conflictResolution==="fail"){console.error(`\u274C ${t.length} asset conflicts detected:`);for(let e of t)console.error(`   - ${e.path}`);throw new Error("Asset conflicts detected and --conflict-resolution=fail is set")}let a=this.cliToAssetConflictResolution(this.conflictResolution);return console.log(`\u26A0\uFE0F ${t.length} asset conflicts detected, resolving with: ${this.conflictResolution}`),t.map(()=>a)}cliToConflictResolution(t){switch(t){case"local":return"keep_local";case"remote":return"keep_remote";case"skip":return"skip";default:return"keep_local"}}cliToAssetConflictResolution(t){switch(t){case"local":return"keep_local";case"remote":return"keep_remote";case"skip":return"skip";default:return"keep_local"}}async onServerDeleted(t){return console.log(`\u26A0\uFE0F ${t.length} files deleted on server, keeping local copies`),!1}async confirmPush(t){return console.log(`\u{1F4E4} Pushing ${t.length} files...`),!0}};function W(r,t,a){return r===null&&t===null||r===t?"unchanged":r!==null&&t===null?a?"server_deleted":"local_only":r===null&&t!==null?a?"local_deleted":"remote_only":a?r===a?"pull":t===a?"push":"conflict":"conflict"}async function k(r){let t=r.getSyncState(),[a,e]=await Promise.all([r.getLocalFiles(),r.getServerHashes()]),n=new Map;for(let S of e)n.set(S.path,S.hash);let o=new Map,i=t.mtimes||{},l=t.localHashes||{};for(let S of a){let x=i[S.path],C=l[S.path];if(x===S.mtime&&C)o.set(S.path,C);else{let T=await r.readFileContent(S.path),N=await r.computeHash(T);o.set(S.path,N)}}let u=new Set([...o.keys(),...n.keys()]),s=[],p=[],c=[],g=[],y=[],d=[],A=[],b=[],R=0;for(let S of u){let x=o.get(S)||null,C=n.get(S)||null,T=t.files[S]||null,N=W(x,C,T),f={path:S,action:N,localHash:x,remoteHash:C,lastSyncedHash:T};switch(s.push(f),N){case"unchanged":R++;break;case"pull":p.push(f);break;case"push":c.push(f);break;case"conflict":g.push(f);break;case"local_only":y.push(f);break;case"remote_only":d.push(f);break;case"local_deleted":A.push(f);break;case"server_deleted":b.push(f);break}}return{classifications:s,pulls:p,pushes:c,conflicts:g,localOnly:y,remoteOnly:d,localDeleted:A,serverDeleted:b,unchanged:R}}function v(r,t){let{twoWaySync:a,hasPublishFields:e}=t,n=d=>e?e(d):!0,o=[],i=[],l=[],u=[],s=[],p=[],c=[],g=[],y=0;for(let d of r.classifications){let A=n(d.path);switch(d.action){case"unchanged":o.push(d),y++;break;case"pull":a&&A&&(o.push(d),i.push(d));break;case"push":A&&(o.push(d),l.push(d));break;case"conflict":if(a)A&&(o.push(d),u.push(d));else if(A){let b={...d,action:"push"};o.push(b),l.push(b)}break;case"local_only":A&&(o.push(d),s.push(d));break;case"remote_only":a&&(o.push(d),p.push(d));break;case"local_deleted":A&&(o.push(d),c.push(d));break;case"server_deleted":a&&(o.push(d),g.push(d));break}}return{classifications:o,pulls:i,pushes:l,conflicts:u,localOnly:s,remoteOnly:p,localDeleted:c,serverDeleted:g,unchanged:y}}async function H(r,t,a={twoWaySync:!1}){let e={pulled:0,pushed:0,conflictsResolved:0,assetsUploaded:0,assetsDownloaded:0,errors:[]},n=r.getSyncState(),o=[];if(t.pulls.length>0||t.remoteOnly.length>0){let s=[...t.pulls,...t.remoteOnly],p=await J(r,s,n);e.pulled=p.count,e.errors.push(...p.errors),o.push(...p.pulledPaths)}if(o.length>0){let s=await D(r,o);e.assetsDownloaded+=s.downloaded,e.errors.push(...s.errors)}let i=t.classifications.filter(s=>s.action==="unchanged"&&s.remoteHash!==null).map(s=>s.path);if(i.length>0){let s=await D(r,i);e.assetsDownloaded+=s.downloaded,e.errors.push(...s.errors)}if(t.serverDeleted.length>0&&await Z(r,t.serverDeleted,n),t.conflicts.length>0){let s=await Y(r,t.conflicts,n);e.conflictsResolved=s.resolved,e.errors.push(...s.errors)}let l=[...t.pushes,...t.localOnly],u=[];if(l.length>0&&await r.confirmPush(l.map(p=>p.path))){let p=await z(r,l,n);e.pushed=p.count,e.errors.push(...p.errors),u=p.pushedNotes}if(t.localDeleted.length>0&&await tt(r,t.localDeleted,n),u.length>0){let s=await et(r,u,a.twoWaySync);e.assetsUploaded=s.uploaded,e.assetsDownloaded=s.downloaded,e.errors.push(...s.errors)}return(e.pushed>0||e.assetsUploaded>0)&&await r.commitNotes(),await r.saveSyncState(n),e}async function J(r,t,a){if(t.length===0)return{count:0,errors:[],pulledPaths:[]};let e=t.map(c=>c.path),n=[],o=[],i=0,l=await r.fetchNoteContents(e),u=new Map(l.map(c=>[c.path,c.content])),s=t.length,p=0;for(let c of t){p++,r.onProgress({step:"pull",current:p,total:s,path:c.path});let g=u.get(c.path);if(g===void 0){n.push(`Failed to fetch: ${c.path}`);continue}try{let y=c.path.substring(0,c.path.lastIndexOf("/"));y&&await r.createFolder(y),await r.writeFile(c.path,g);let d=await r.computeHash(g);a.files[c.path]=d,i++,o.push(c.path)}catch(y){n.push(`Failed to write ${c.path}: ${y}`)}}return{count:i,errors:n,pulledPaths:o}}async function z(r,t,a){if(t.length===0)return{count:0,errors:[],pushedNotes:[]};let e=[],n=[],o=t.length,i=0;for(let y of t){i++,r.onProgress({step:"push",current:i,total:o,path:y.path});try{let d=await r.readFileContent(y.path);n.push({path:y.path,content:d})}catch(d){e.push(`Failed to read ${y.path}: ${d}`)}}if(n.length===0)return{count:0,errors:e,pushedNotes:[]};let l=new Set(n.map(y=>y.path)),u=r.pushBatchSize||100,s=[];for(let y=0;y<n.length;y+=u){let d=n.slice(y,y+u),A=await r.pushNotes(d,!0);s.push(...A)}let p=new Set(s.map(y=>y.path)),c=0;for(let y of n)if(p.has(y.path)){let d=await r.computeHash(y.content);a.files[y.path]=d,c++}let g=s.filter(y=>l.has(y.path));return{count:c,errors:e,pushedNotes:g}}async function Y(r,t,a){if(t.length===0)return{resolved:0,errors:[]};let e=[],n=t.map(p=>p.path),o=await r.fetchNoteContents(n),i=new Map(o.map(p=>[p.path,p.content])),l=[];for(let p of t){let c=i.get(p.path);if(c!==void 0)try{let g=await r.readFileContent(p.path);l.push({path:p.path,localContent:g,remoteContent:c,localHash:p.localHash,remoteHash:p.remoteHash})}catch(g){console.warn(`Failed to read local file for conflict ${p.path}:`,g),e.push(`Failed to read local file for conflict: ${p.path}`)}}if(l.length===0)return{resolved:0,errors:e};let u=await r.onConflict(l),s=0;for(let p=0;p<l.length;p++){let c=l[p],g=u[p]||"skip";try{await X(r,c,g,a),g!=="skip"&&s++}catch(y){e.push(`Failed to resolve conflict for ${c.path}: ${y}`)}}return{resolved:s,errors:e}}async function X(r,t,a,e){switch(a){case"keep_local":await r.pushNotes([{path:t.path,content:t.localContent}],!0),e.files[t.path]=t.localHash;break;case"keep_remote":await r.writeFile(t.path,t.remoteContent),e.files[t.path]=t.remoteHash;break;case"keep_both":{let n=t.path.substring(t.path.lastIndexOf(".")),i=`${t.path.substring(0,t.path.lastIndexOf("."))} (server)${n}`;await r.writeFile(i,t.remoteContent),e.files[t.path]=t.localHash;let l=await r.computeHash(t.remoteContent);e.files[i]=l;break}case"skip":break}}async function Z(r,t,a){if(t.length===0)return;let e=t.map(o=>o.path);if(await r.onServerDeleted(e))for(let o of t)try{await r.deleteFile(o.path),delete a.files[o.path]}catch(i){console.warn(`Failed to delete file ${o.path}:`,i)}else for(let o of t)o.localHash&&(a.files[o.path]=o.localHash)}async function tt(r,t,a){if(t.length===0)return;let e=t.map(n=>n.path);await r.hideNotes(e);for(let n of e)delete a.files[n]}async function et(r,t,a){let e={uploaded:0,downloaded:0,conflictsResolved:0,errors:[]};if(t.length===0)return e;let n=[],o=[],i=[];for(let l of t)if(!(!l.assets||l.assets.length===0))for(let u of l.assets){let s=await r.resolveAssetPath(u.path,l.path);if(!s)continue;if(!u.sha256Hash||!u.absolutePath||!u.url){n.push({noteId:l.id,notePath:l.path,asset:u,localPath:s});continue}if(await r.fileExists(s))try{let c=await r.readBinaryFile(s),g=await r.computeBinaryHash(c);if(g===u.sha256Hash)continue;i.push({path:u.path,absolutePath:s,noteId:l.id,localHash:g,remoteHash:u.sha256Hash,remoteUrl:u.url})}catch(c){e.errors.push(`Failed to read local asset ${s}: ${c}`)}else a&&o.push({asset:u,localPath:s})}if(n.length>0){let l=new Map;for(let c of n)l.has(c.localPath)||l.set(c.localPath,c);let u=Array.from(l.values()),s=u.length,p=0;for(let c of u){p++,r.onProgress({step:"upload_asset",current:p,total:s,path:c.asset.path});try{let g=await r.readBinaryFile(c.localPath),y=await r.computeBinaryHash(g),d=new Blob([g]),A=c.localPath.substring(c.localPath.lastIndexOf("/")+1);await r.uploadAsset({noteId:c.noteId,blob:d,fileName:A,relativePath:c.asset.path,absolutePath:c.localPath,sha256Hash:y})&&e.uploaded++}catch(g){e.errors.push(`Failed to upload asset ${c.asset.path}: ${g}`)}}}if(o.length>0){let l=o.length,u=0;for(let s of o)if(u++,r.onProgress({step:"download_asset",current:u,total:l,path:s.asset.path}),!!s.asset.url)try{let p=await r.downloadAsset(s.asset.url);if(!p){e.errors.push(`Failed to download asset ${s.asset.path}`);continue}let c=s.localPath.substring(0,s.localPath.lastIndexOf("/"));c&&await r.createFolder(c),await r.writeBinaryFile(s.localPath,p),e.downloaded++}catch(p){e.errors.push(`Failed to download asset ${s.asset.path}: ${p}`)}}if(i.length>0){let l=await at(r,i,a);e.uploaded+=l.uploaded,e.downloaded+=l.downloaded,e.conflictsResolved=l.conflictsResolved,e.errors.push(...l.errors)}return e}async function at(r,t,a){let e={uploaded:0,downloaded:0,conflictsResolved:0,errors:[]};if(t.length===0)return e;let n;a?n=await r.onAssetConflict(t):n=t.map(()=>"keep_local");for(let o=0;o<t.length;o++){let i=t[o],l=n[o]||"skip";try{if(l==="keep_local"){let u=await r.readBinaryFile(i.absolutePath),s=new Blob([u]),p=i.absolutePath.substring(i.absolutePath.lastIndexOf("/")+1);await r.uploadAsset({noteId:i.noteId,blob:s,fileName:p,relativePath:i.path,absolutePath:i.absolutePath,sha256Hash:i.localHash})&&(e.uploaded++,e.conflictsResolved++)}else if(l==="keep_remote"){let u=await r.downloadAsset(i.remoteUrl);u?(await r.writeBinaryFile(i.absolutePath,u),e.downloaded++,e.conflictsResolved++):e.errors.push(`Failed to download asset ${i.path}`)}}catch(u){e.errors.push(`Failed to resolve asset conflict for ${i.path}: ${u}`)}}return e}async function D(r,t){let a={downloaded:0,errors:[]};if(t.length===0)return a;let e=await r.fetchNoteAssets(t);if(e.length===0)return a;let n=new Map;for(let l of e)for(let u of l.assets){let s=u.absolutePath.replace(/^\//,"");n.has(s)||await r.fileExists(s)||n.set(s,{url:u.url,hash:u.hash})}if(n.size===0)return a;let o=n.size,i=0;for(let[l,{url:u}]of n){i++,r.onProgress({step:"download_asset",current:i,total:o,path:l});try{let s=await r.downloadAsset(u);if(!s){a.errors.push(`Failed to download asset ${l}`);continue}let p=l.substring(0,l.lastIndexOf("/"));p&&await r.createFolder(p),await r.writeBinaryFile(l,s),a.downloaded++}catch(s){a.errors.push(`Failed to download asset ${l}: ${s}`)}}return a}function rt(){let r=process.argv.slice(2),t={folder:"",apiUrl:process.env.ENDPOINT||"http://localhost:8081/graphql",apiKey:process.env.API_KEY||"",twoWaySync:!1,verbose:!1,dryRun:!1,conflictResolution:"local"};for(let a=0;a<r.length;a++){let e=r[a],n;if(e.includes("=")){let o=e.indexOf("=");n=e.substring(o+1),e=e.substring(0,o)}switch(e){case"--folder":case"-f":t.folder=n??r[++a];break;case"--api-url":case"-u":t.apiUrl=n??r[++a];break;case"--api-key":case"-k":t.apiKey=n??r[++a];break;case"--two-way":case"-2":t.twoWaySync=!0;break;case"--verbose":case"-v":t.verbose=!0;break;case"--dry-run":case"-n":t.dryRun=!0;break;case"--conflict-resolution":case"-c":{let o=n??r[++a];o==="local"||o==="remote"||o==="skip"||o==="fail"?t.conflictResolution=o:(console.error(`\u274C Invalid conflict resolution: ${o}. Use: local, remote, skip, fail`),process.exit(1));break}case"--help":case"-h":L(),process.exit(0);break;default:!t.folder&&!e.startsWith("-")&&(t.folder=e)}}return t}function L(){console.log(`
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
`)}async function ot(){let r=rt();r.folder||(console.error("\u274C Error: --folder is required"),L(),process.exit(1)),r.apiKey||(console.error("\u274C Error: --api-key or API_KEY environment variable is required"),process.exit(1)),console.log("=".repeat(60)),console.log("obsidian-sync CLI"),console.log("=".repeat(60)),console.log(`Folder:     ${r.folder}`),console.log(`API URL:    ${r.apiUrl}`),console.log(`Two-way:    ${r.twoWaySync}`),console.log(`Conflicts:  ${r.conflictResolution}`),console.log(`Dry run:    ${r.dryRun}`),console.log("=".repeat(60));let t=new M({folder:r.folder,apiUrl:r.apiUrl,apiKey:r.apiKey,twoWaySync:r.twoWaySync,verbose:r.verbose,conflictResolution:r.conflictResolution});console.log(`
\u{1F4CA} Classifying files...`);let a=await k(t),e=v(a,{twoWaySync:r.twoWaySync});if(console.log(`
\u{1F4CB} Sync Plan:`),console.log("-".repeat(40)),console.log(`  Unchanged:      ${e.unchanged}`),console.log(`  To push:        ${e.pushes.length}`),console.log(`  Local only:     ${e.localOnly.length}`),console.log(`  To pull:        ${e.pulls.length}`),console.log(`  Remote only:    ${e.remoteOnly.length}`),console.log(`  Conflicts:      ${e.conflicts.length}`),console.log(`  Local deleted:  ${e.localDeleted.length}`),console.log(`  Server deleted: ${e.serverDeleted.length}`),console.log("-".repeat(40)),r.verbose){if(e.pushes.length>0){console.log(`
\u{1F4E4} Files to push:`);for(let i of e.pushes)console.log(`  ${i.path}`)}if(e.localOnly.length>0){console.log(`
\u{1F195} New local files:`);for(let i of e.localOnly)console.log(`  ${i.path}`)}if(e.pulls.length>0){console.log(`
\u{1F4E5} Files to pull:`);for(let i of e.pulls)console.log(`  ${i.path}`)}if(e.remoteOnly.length>0){console.log(`
\u{1F310} New remote files:`);for(let i of e.remoteOnly)console.log(`  ${i.path}`)}if(e.localDeleted.length>0){console.log(`
\u{1F5D1}\uFE0F To hide on server:`);for(let i of e.localDeleted)console.log(`  ${i.path}`)}}if(r.dryRun){console.log(`
\u23F8\uFE0F Dry run - no changes made`);return}if(e.pushes.length+e.localOnly.length+e.pulls.length+e.remoteOnly.length+e.conflicts.length+e.localDeleted.length+e.serverDeleted.length===0){await t.saveSyncState(t.getSyncState()),console.log(`
\u2705 Everything is up to date!`);return}console.log(`
\u{1F680} Executing sync...`);let o=await H(t,e,{twoWaySync:r.twoWaySync});if(console.log(`
`+"=".repeat(60)),console.log("\u{1F4CA} SYNC RESULTS:"),console.log("=".repeat(60)),console.log(`  Pushed:             ${o.pushed}`),console.log(`  Pulled:             ${o.pulled}`),console.log(`  Conflicts resolved: ${o.conflictsResolved}`),console.log(`  Assets uploaded:    ${o.assetsUploaded}`),console.log(`  Assets downloaded:  ${o.assetsDownloaded}`),o.errors.length>0){console.log(`  Errors:             ${o.errors.length}`);for(let i of o.errors)console.log(`    \u274C ${i}`)}console.log("=".repeat(60))}ot().catch(r=>{console.error("\u274C Fatal error:",r),process.exit(1)});
