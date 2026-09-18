/* Scratchlight — local-first image colouring studio */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const galleryView=$("#galleryView"),studioView=$("#studioView"),upload=$("#imageUpload"),grid=$("#workGrid");
const canvases={art:$("#artCanvas"),scratch:$("#scratchCanvas"),outline:$("#outlineCanvas"),paint:$("#paintCanvas")};
const ctx=Object.fromEntries(Object.entries(canvases).map(([k,c])=>[k,c.getContext("2d",{willReadFrequently:true})]));
const DB_KEY="scratchlight.works.v1", ACTIVE_KEY="scratchlight.active.v1";
let works=[],current=null,regions=[],palette=[],selected=0,mode="tap",outlines=true,scale=1,rotation=0,panX=0,panY=0,gesture=null,painting=false,lastPoint=null,painted=new Set(),filter="all",saveTimer;
const ambient=$("#ambientAudio"),paintSound=$("#paintAudio");
const setStatus=t=>$("#saveStatus").textContent=t;
const id=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
function readWorks(){try{works=JSON.parse(localStorage.getItem(DB_KEY)||"[]")}catch{works=[]}}
function persist(){try{localStorage.setItem(DB_KEY,JSON.stringify(works));setStatus("Saved locally")}catch(e){setStatus("Storage full");console.warn(e)}}
function scheduleSave(){setStatus("Saving…");clearTimeout(saveTimer);saveTimer=setTimeout(saveCurrent,180)}
function saveCurrent(){if(!current)return;const i=works.findIndex(w=>w.id===current.id);if(i>=0){works[i]={...current,done:[...painted],updated:Date.now()};persist();renderGallery()}}
function imageFromData(url){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=url})}
function compressedDataURL(img,max=1500){const c=document.createElement("canvas");const r=Math.min(1,max/Math.max(img.width,img.height));c.width=Math.max(1,Math.round(img.width*r));c.height=Math.max(1,Math.round(img.height*r));c.getContext("2d").drawImage(img,0,0,c.width,c.height);return c.toDataURL("image/jpeg",.82)}
upload.addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith("image/"))return alert("Please choose an image file.");try{const url=URL.createObjectURL(file),img=await imageFromData(url),data=compressedDataURL(img);URL.revokeObjectURL(url);const w={id:id(),title:file.name.replace(/\.[^.]+$/,"").slice(0,48)||"Untitled page",image:data,width:img.width,height:img.height,created:Date.now(),updated:Date.now(),detail:3,done:[]};works.unshift(w);persist();openWork(w.id)}catch(err){alert("That image could not be opened. Try a JPG or PNG.")}upload.value=""});
function renderGallery(){grid.innerHTML="";const shown=works.filter(w=>filter==="all"||(filter==="complete"?w.done?.length>=Math.max(1,w.regionCount||Infinity):w.done?.length>0&&(w.done?.length<(w.regionCount||Infinity))));$("#workCount").textContent=works.length;$("#emptyState").classList.toggle("hidden",works.length>0);shown.forEach(w=>{const pct=w.regionCount?Math.round((w.done?.length||0)/w.regionCount*100):0;const card=document.createElement("button");card.className="work-card";card.innerHTML=`<div class="thumb"><img alt="" src="${w.image}"></div><div class="work-info"><strong>${esc(w.title)}</strong><div class="work-meta"><span>${pct>=100?"Complete":pct?"In progress":"Not started"}</span><span>${pct}%</span></div><div class="mini-progress"><span style="width:${pct}%"></span></div></div>`;card.onclick=()=>openWork(w.id);grid.append(card)})}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$$(".filter").forEach(b=>b.onclick=()=>{$$(".filter").forEach(x=>x.classList.toggle("active",x===b));filter=b.dataset.filter;renderGallery()});
$("#homeBtn").onclick=$("#galleryBtn").onclick=()=>showGallery();
function showGallery(){saveCurrent();studioView.classList.add("hidden");galleryView.classList.remove("hidden");$("#sidebar").classList.remove("closed");renderGallery()}
async function openWork(workId){current=works.find(w=>w.id===workId);if(!current)return;galleryView.classList.add("hidden");studioView.classList.remove("hidden");$("#artTitle").textContent=current.title;$("#detailRange").value=current.detail||3;painted=new Set(current.done||[]);selected=0;mode="tap";$$(".mode-btn").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));$("#modeHelp").textContent="Tap a shape to reveal its colour.";$("#welcomeHint").classList.remove("hidden");$("#sidebar").classList.remove("closed");setStatus("Opening…");await loadArtwork();setStatus("Saved locally")}
async function loadArtwork(){const im=await imageFromData(current.image);const maxW=Math.min(window.innerWidth*(innerWidth<760?.88:.78),1000),maxH=window.innerHeight*.76;const factor=Math.min(maxW/im.width,maxH/im.height,1);const w=Math.max(1,Math.round(im.width*factor)),h=Math.max(1,Math.round(im.height*factor));Object.values(canvases).forEach(c=>{c.width=w;c.height=h});const stage=$("#canvasStage");stage.style.width=w+"px";stage.style.height=h+"px";ctx.art.drawImage(im,0,0,w,h);setTransform();await segmentImage(w,h,current.detail||3);drawScratch();drawOutlines();renderPalette();updateProgress();$("#welcomeHint").classList.toggle("hidden",painted.size>0)}
function setTransform(){const st=$("#canvasStage");st.style.transform=`translate(calc(-50% + ${panX}px),calc(-50% + ${panY}px)) scale(${scale}) rotate(${rotation}deg)`}
function segmentImage(w,h,detail){setStatus("Finding colour regions…");const src=ctx.art.getImageData(0,0,w,h),data=src.data;const step=[0,0,0,0,0,0,0,0,0,0][detail-1]||0;const levels=[5,7,9,12,16][detail-1];const q=new Uint8Array(w*h*3);for(let i=0,p=0;i<data.length;i+=4,p++){q[p*3]=Math.round(data[i]/(256/levels));q[p*3+1]=Math.round(data[i+1]/(256/levels));q[p*3+2]=Math.round(data[i+2]/(256/levels))}
 // Quantize to a compact palette, then flood-fill same/near quantized bins into connected regions.
 const bins=new Map(),pixelBin=new Uint16Array(w*h);let binCount=0;
 for(let p=0;p<w*h;p++){const key=(q[p*3]<<16)|(q[p*3+1]<<8)|q[p*3+2];let b=bins.get(key);if(b===undefined){b=binCount++;bins.set(key,b)}pixelBin[p]=b}
 const labels=new Int32Array(w*h);labels.fill(-1);regions=[];const maxRegions=1800;let rid=0;const queue=new Int32Array(w*h);
 for(let p=0;p<w*h;p++){if(labels[p]>=0)continue;const b=pixelBin[p],head=0;let tail=0;queue[tail++]=p;labels[p]=rid;let sumR=0,sumG=0,sumB=0,count=0;while(head<tail){break} // initialized below with mutable queue pointers
   let read=0;while(read<tail){const at=queue[read++],x=at%w,y=(at/w)|0,di=at*4;sumR+=data[di];sumG+=data[di+1];sumB+=data[di+2];count++;
     const ns=[];if(x)ns.push(at-1);if(x<w-1)ns.push(at+1);if(y)ns.push(at-w);if(y<h-1)ns.push(at+w);
     for(const n of ns)if(labels[n]<0&&pixelBin[n]===b){labels[n]=rid;queue[tail++]=n}
   }
   if(count<Math.max(2,Math.round(w*h/150000))&&rid>0){const near=rid-1;for(let k=0;k<tail;k++)labels[queue[k]]=near;const r=regions[near];r.count+=count;r.sumR+=sumR;r.sumG+=sumG;r.sumB+=sumB;continue}
   regions.push({id:rid,count,sumR,sumG,sumB,color:[Math.round(sumR/count),Math.round(sumG/count),Math.round(sumB/count)],pixels:queue.slice(0,tail)});rid++;if(rid>=maxRegions)break
 }
 // For rare unassigned pixels after safety cap, map to final region.
 for(let p=0;p<labels.length;p++)if(labels[p]<0)labels[p]=Math.max(0,rid-1);
 // Merge tiny fragmented regions into a neighboring region by reassigning labels and rebuild region pixel lists.
 const counts=new Int32Array(regions.length);for(const l of labels)counts[l]++;
 const minSize=Math.max(4,Math.floor(w*h/(detail*12000)));for(let p=0;p<labels.length;p++){let l=labels[p];if(counts[l]>=minSize)continue;const x=p%w,y=(p/w)|0,neighbors=[];if(x)neighbors.push(labels[p-1]);if(x<w-1)neighbors.push(labels[p+1]);if(y)neighbors.push(labels[p-w]);if(y<h-1)neighbors.push(labels[p+w]);const candidate=neighbors.find(n=>n!==l&&counts[n]>=minSize);if(candidate!==undefined)labels[p]=candidate}
 // Compact ids and make each final region a list of pixel indices.
 const compact=new Map(),final=[];for(let p=0;p<labels.length;p++){let old=labels[p],n=compact.get(old);if(n===undefined){n=final.length;compact.set(old,n);final.push({id:n,pixels:[],sumR:0,sumG:0,sumB:0,count:0})}const r=final[n],i=p*4;r.pixels.push(p);r.sumR+=data[i];r.sumG+=data[i+1];r.sumB+=data[i+2];r.count++}
 regions=final.map(r=>({...r,color:[Math.round(r.sumR/r.count),Math.round(r.sumG/r.count),Math.round(r.sumB/r.count)]}));
 // Palette groups region colours by perceptual-ish RGB distance, preserving distinct colour families.
 palette=[];const threshold=[42,36,30,24,19][detail-1];regions.forEach(r=>{let group=palette.find(g=>dist(g.rgb,r.color)<threshold);if(!group){group={id:palette.length,rgb:r.color.slice(),regions:[],done:0};palette.push(group)}group.regions.push(r.id);r.group=group.id});
 current.regionCount=regions.length;current.detail=detail;current.done=[...painted];current.palette=palette.map(p=>p.rgb);current.regionMap=Array.from({length:regions.length},(_,i)=>i);setStatus("Ready")}
function dist(a,b){return Math.sqrt((a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2)}
function drawScratch(){const c=canvases.scratch,x=ctx.scratch;x.globalCompositeOperation="source-over";x.clearRect(0,0,c.width,c.height);x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);const im=ctx.art.getImageData(0,0,c.width,c.height),d=im.data;for(const r of regions)if(painted.has(r.id))for(const p of r.pixels)d[p*4+3]=0;x.putImageData(im,0,0)}
function drawOutlines(){const c=canvases.outline,x=ctx.outline,w=c.width,h=c.height;x.clearRect(0,0,w,h);if(!outlines)return;const img=x.createImageData(w,h),d=img.data,labels=makeLabelArray(w*h);for(let p=0;p<labels.length;p++){const xx=p%w,yy=(p/w)|0,l=labels[p];let edge=false;if(xx&&labels[p-1]!==l)edge=true;if(xx<w-1&&labels[p+1]!==l)edge=true;if(yy&&labels[p-w]!==l)edge=true;if(yy<h-1&&labels[p+w]!==l)edge=true;if(edge){const i=p*4;d[i]=20;d[i+1]=19;d[i+2]=17;d[i+3]=210}}x.putImageData(img,0,0)}
function makeLabelArray(n){const a=new Int32Array(n);a.fill(-1);for(const r of regions)for(const p of r.pixels)a[p]=r.id;return a}
function renderPalette(){const el=$("#palette");el.innerHTML="";$("#paletteCount").textContent=palette.length+" groups";palette.forEach((g,i)=>{const b=document.createElement("button");b.className="swatch"+(selected===i?" active":"")+(g.regions.every(r=>painted.has(r))?" done":"");b.innerHTML=`<span class="swatch-dot" style="background:rgb(${g.rgb.join(",")})"></span><span>${i+1}</span>`;b.title=`Colour ${i+1}`;b.onclick=()=>{selected=i;renderPalette()};el.append(b)})}
function updateProgress(){const pct=regions.length?Math.round(painted.size/regions.length*100):0;$("#progressLabel").textContent=pct+"%";$("#progressBar").style.width=pct+"%";if(current){current.done=[...painted];current.regionCount=regions.length}if(pct===100)$("#welcomeHint").classList.add("hidden")}
function revealRegion(id){if(painted.has(id))return;painted.add(id);const r=regions[id];if(!r)return;const im=ctx.scratch.getImageData(0,0,canvases.scratch.width,canvases.scratch.height),d=im.data;for(const p of r.pixels)d[p*4+3]=0;ctx.scratch.putImageData(im,0,0);updateProgress();renderPalette();scheduleSave();if(painted.size===regions.length)setStatus("Page complete · saved")}
function revealGroup(groupId){const g=palette[groupId];if(!g)return;g.regions.forEach(revealRegion)}
function coords(e){const rect=canvases.paint.getBoundingClientRect();const x=(e.clientX-rect.left)*canvases.paint.width/rect.width,y=(e.clientY-rect.top)*canvases.paint.height/rect.height;return{x,y}}
function regionAt(x,y){const w=canvases.paint.width,ix=Math.max(0,Math.min(w-1,Math.floor(x))),iy=Math.max(0,Math.min(canvases.paint.height-1,Math.floor(y)));for(const r of regions){ // direct region lookup kept via pixel labels for simple hit testing
 if(r.pixels.includes(iy*w+ix))return r.id
 }return -1}
let labelMap=null;function getRegionAt(x,y){if(!labelMap)labelMap=makeLabelArray(canvases.paint.width*canvases.paint.height);const w=canvases.paint.width,ix=Math.max(0,Math.min(w-1,Math.floor(x))),iy=Math.max(0,Math.min(canvases.paint.height-1,Math.floor(y)));return labelMap[iy*w+ix]}
function setMode(next){mode=next;$$(".mode-btn").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));$("#modeHelp").textContent=mode==="tap"?"Tap a shape to reveal its colour.":"Paint inside shapes to gradually reveal the image.";canvases.paint.classList.toggle("paint-cursor",mode==="paint")}
$$(".mode-btn").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
function brush(e){const p=coords(e),c=canvases.paint,x=ctx.paint;const color=palette[selected]?.rgb||[180,100,70];x.globalCompositeOperation="source-over";x.lineCap="round";x.lineJoin="round";x.lineWidth=Math.max(14,Math.min(c.width,c.height)*.045);x.strokeStyle=`rgb(${color.join(",")})`;if(!lastPoint)lastPoint=p;x.beginPath();x.moveTo(lastPoint.x,lastPoint.y);x.lineTo(p.x,p.y);x.stroke();lastPoint=p;const rid=getRegionAt(p.x,p.y);if(rid>=0){const r=regions[rid];if(r.group===selected){ // pigment-style reveal proportional to strokes; use soft eraser under brush
 ctx.scratch.save();ctx.scratch.globalCompositeOperation="destination-out";ctx.scratch.lineCap="round";ctx.scratch.lineJoin="round";ctx.scratch.lineWidth=x.lineWidth;ctx.scratch.beginPath();ctx.scratch.moveTo(lastPoint.x,lastPoint.y);ctx.scratch.lineTo(p.x,p.y);ctx.scratch.stroke();ctx.scratch.restore();painted.add(rid);updateProgress();scheduleSave()}}
 if(paintSound.src&&!paintSound.paused){/* already playing */}else if(paintSound.getAttribute("src")){paintSound.currentTime=0;paintSound.play().catch(()=>{})}}
canvases.paint.addEventListener("pointerdown",e=>{if(!current)return;const p=coords(e);if(mode==="tap"){const rid=getRegionAt(p.x,p.y);if(rid>=0&&regions[rid].group===selected)revealRegion(rid);return}painting=true;lastPoint=p;canvases.paint.setPointerCapture(e.pointerId);brush(e)});
canvases.paint.addEventListener("pointermove",e=>{if(painting&&mode==="paint")brush(e)});
function endPaint(){painting=false;lastPoint=null;ctx.paint.clearRect(0,0,canvases.paint.width,canvases.paint.height)}
canvases.paint.addEventListener("pointerup",endPaint);canvases.paint.addEventListener("pointercancel",endPaint);
$("#outlineToggle").onchange=e=>{outlines=e.target.checked;drawOutlines()};
$("#detailRange").onchange=async e=>{if(!current)return;painted=new Set();labelMap=null;current.detail=+e.target.value;$("#detailValue").textContent=["Very low","Low","Balanced","Detailed","Very detailed"][current.detail-1];await loadArtwork();scheduleSave()};
$("#detailRange").oninput=e=>$("#detailValue").textContent=["Very low","Low","Balanced","Detailed","Very detailed"][+e.target.value-1];
$("#clearColour").onclick=()=>{if(!current)return;const g=palette[selected];if(!g)return;g.regions.forEach(id=>painted.delete(id));drawScratch();renderPalette();updateProgress();scheduleSave()};
$("#sidebarToggle").onclick=()=>$("#sidebar").classList.toggle("closed");$("#closeSidebar").onclick=()=>$("#sidebar").classList.add("closed");
$("#finishBtn").onclick=showGallery;
$("#deleteBtn").onclick=()=>{if(!current||!confirm("Delete this work and its saved progress?"))return;works=works.filter(w=>w.id!==current.id);persist();current=null;showGallery()};
$("#musicToggle").onchange=e=>{if(e.target.checked)ambient.play().catch(()=>{e.target.checked=false;alert("Add an MP3 file at assets/audio/ambient.mp3 to enable ambient music.")});else ambient.pause()};
$("#fitBtn").onclick=()=>{scale=1;rotation=0;panX=0;panY=0;setTransform()};
function pointDist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}function pointAngle(a,b){return Math.atan2(b.y-a.y,b.x-a.x)}
const wrap=$("#canvasWrap");wrap.addEventListener("pointerdown",e=>{if(e.target===canvases.paint||!current)return;const pts=[...wrap.querySelectorAll(":scope .unused")];gesture={x:e.clientX,y:e.clientY,panX,panY,scale,rotation};wrap.setPointerCapture?.(e.pointerId)});
wrap.addEventListener("pointermove",e=>{if(!gesture||!current)return;panX=gesture.panX+e.clientX-gesture.x;panY=gesture.panY+e.clientY-gesture.y;setTransform()});wrap.addEventListener("pointerup",()=>gesture=null);wrap.addEventListener("pointercancel",()=>gesture=null);
let touches=new Map(),multiStart=null;
wrap.addEventListener("touchstart",e=>{if(e.touches.length===2){const a=e.touches[0],b=e.touches[1];multiStart={dist:Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY),angle:Math.atan2(b.clientY-a.clientY,b.clientX-a.clientX),scale,rotation,panX,panY,cx:(a.clientX+b.clientX)/2,cy:(a.clientY+b.clientY)/2}}},{passive:true});
wrap.addEventListener("touchmove",e=>{if(e.touches.length===2&&multiStart){const a=e.touches[0],b=e.touches[1],d=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY),ang=Math.atan2(b.clientY-a.clientY,b.clientX-a.clientX);scale=Math.max(.35,Math.min(4,multiStart.scale*d/multiStart.dist));rotation=multiStart.rotation+(ang-multiStart.angle)*180/Math.PI;panX=multiStart.panX+(a.clientX+b.clientX)/2-multiStart.cx;panY=multiStart.panY+(a.clientY+b.clientY)/2-multiStart.cy;setTransform();e.preventDefault()}},{passive:false});wrap.addEventListener("touchend",e=>{if(e.touches.length<2)multiStart=null},{passive:true});
window.addEventListener("resize",()=>{if(current)setTransform()});
readWorks();renderGallery();$("#detailValue").textContent="Balanced";
// Installable PWA manifest is linked above. Local-first; no server or account required.
