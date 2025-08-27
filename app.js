// AcneMap MVP: face mesh + redness heatmap + rule-based tips
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const startCameraBtn = document.getElementById('startCamera');
const upload = document.getElementById('imageUpload');
const scanBtn = document.getElementById('scanBtn');
const statusEl = document.getElementById('status');
const scoresEls = {
  forehead: document.getElementById('f-score'),
  cheeks: document.getElementById('c-score'),
  nose: document.getElementById('n-score'),
  chin: document.getElementById('ch-score')
};
const adviceEl = document.getElementById('advice');

let currentImage = null; // ImageBitmap of current frame
let faceLandmarks = null;
let remedies = null;

async function loadRemedies() {
  const res = await fetch('remedies.json');
  remedies = await res.json();
}
loadRemedies();

// Camera start
startCameraBtn.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    video.srcObject = stream;
    video.style.display = 'block';
    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      drawFrame();
      statusEl.textContent = 'Camera ready. Click "Scan Face".';
    };
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Camera access was blocked.';
  }
});

// Upload image
upload.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = async () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    currentImage = await createImageBitmap(img);
    statusEl.textContent = 'Image loaded. Click "Scan Face".';
  };
  img.src = URL.createObjectURL(file);
});

function drawFrame(){
  if (video.readyState >= 2) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(drawFrame);
}

// Setup MediaPipe FaceMesh
const faceMesh = new FaceMesh.FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});
faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});
faceMesh.onResults(onResults);

async function onResults(results){
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0){
    faceLandmarks = null;
    statusEl.textContent = 'No face detected. Adjust lighting and try again.';
    return;
  }
  faceLandmarks = results.multiFaceLandmarks[0];

  // Draw contours
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  drawMesh(faceLandmarks);
  ctx.restore();
}

function drawMesh(landmarks){
  // simple outline
  const indices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
  ctx.beginPath();
  indices.forEach((i, idx) => {
    const p = landmarks[i];
    const x = p.x * canvas.width;
    const y = p.y * canvas.height;
    if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();
}

// Utility to get polygon regions
function landmarkPoint(i){ const p = faceLandmarks[i]; return [p.x*canvas.width, p.y*canvas.height]; }
function polyPath(points){
  ctx.beginPath();
  points.forEach((pt, idx) => { if (idx===0) ctx.moveTo(pt[0], pt[1]); else ctx.lineTo(pt[0], pt[1]); });
  ctx.closePath();
}

function regionPolys(){
  // Use canonical landmark sets for rough areas
  const leftCheek = [234,93,132,58,172,136,150,149,176,148,152,377,400,378,379,365,397,288,361,323,454,356,389,251,284,332,297,338,10,109,67,103,54,21,162,127].map(landmarkPoint);
  // We'll split cheeks using midline
  const midx = faceLandmarks[1].x * canvas.width;

  // Forehead: approximate with top face contour
  const foreheadIdx = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
  const forehead = foreheadIdx.slice(0, 8).map(landmarkPoint); // top arc
  // Nose polygon
  const noseIdx = [1, 197, 195, 5, 4, 275, 440, 344, 278, 279, 129];
  const nose = noseIdx.map(landmarkPoint);
  // Chin
  const chinIdx = [152,377,400,378,379,365,397,288,361,323,361,288,397,365,379,378,400,377,152];
  const chin = chinIdx.map(landmarkPoint);
  // Cheeks (left/right) using broader face with nose cut
  const faceOutlineIdx = [234,93,132,58,172,136,150,149,176,148,152,377,400,378,379,365,397,288,361,323,454,356,389,251,284,332,297,338,10,109,67,103,54,21,162,127];
  const outline = faceOutlineIdx.map(landmarkPoint);

  return {forehead, nose, chin, outline, midx};
}

// Analyze redness/blemishes within a polygon: count pixels whose R is high vs G,B
function analyzeRegion(poly){
  if (!poly || poly.length<3) return 0;
  // Build a path and use isPointInPath to sample grid points
  const step = Math.max(2, Math.round(Math.min(canvas.width, canvas.height)/200)); // adaptive sampling
  let hits=0, redCount=0;
  ctx.save();
  ctx.beginPath();
  poly.forEach((pt, i)=>{ if (i===0) ctx.moveTo(pt[0], pt[1]); else ctx.lineTo(pt[0], pt[1]); });
  ctx.closePath();

  const img = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  for (let y=0; y<canvas.height; y+=step){
    for (let x=0; x<canvas.width; x+=step){
      if (ctx.isPointInPath(x,y)){
        hits++;
        const idx = (y*canvas.width + x)*4;
        const r = img[idx], g = img[idx+1], b = img[idx+2];
        // heuristic: redness if r is high and r - avg(g,b) above threshold
        const avgGB = (g+b)/2;
        const redScore = r - avgGB;
        if (r>110 && redScore>25) redCount++;
      }
    }
  }
  ctx.restore();
  return hits ? redCount / hits : 0;
}

function paintHeat(poly, intensity){
  if (!poly || poly.length<3) return;
  ctx.save();
  ctx.beginPath();
  poly.forEach((pt,i)=>{ if(i===0) ctx.moveTo(pt[0],pt[1]); else ctx.lineTo(pt[0],pt[1]); });
  ctx.closePath();
  ctx.fillStyle = `rgba(255, 20, 147, ${Math.min(0.35, 0.1 + intensity*0.8)})`; // pink overlay
  ctx.fill();
  ctx.restore();
}

function showAdvice(scores){
  const order = Object.entries(scores).sort((a,b)=>b[1]-a[1]); // highest first
  const top = order.filter(([k,v])=>v>0.08).map(([k])=>k); // threshold
  adviceEl.innerHTML = '';
  const universal = remedies?.universal || [];
  if (top.length===0){
    adviceEl.innerHTML = `<div class="tip"><h4>Great news 🎉</h4><p>No strong redness detected. Keep up a gentle routine:</p><ul>${universal.map(t=>`<li><b>${t.title}</b> — ${t.how}</li>`).join('')}</ul></div>`;
    return;
  }
  top.forEach(area => {
    const tips = remedies?.[area] || [];
    const block = document.createElement('div');
    block.className = 'tip';
    block.innerHTML = `<h4>${area[0].toUpperCase()+area.slice(1)} care</h4>
      <p>Suggested gentle home remedies:</p>
      <ul>${tips.map(t=>`<li><b>${t.title}</b> — ${t.how} <em>(${t.caution})</em></li>`).join('')}</ul>`;
    adviceEl.appendChild(block);
  });
  // universal at end
  const uni = document.createElement('div');
  uni.className = 'tip';
  uni.innerHTML = `<h4>Universal hygiene tips</h4><ul>${universal.map(t=>`<li><b>${t.title}</b> — ${t.how}</li>`).join('')}</ul>`;
  adviceEl.appendChild(uni);
}

scanBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Scanning…';
  // Capture current frame
  const imgBitmap = await createImageBitmap(canvas);
  const off = document.createElement('canvas');
  off.width = canvas.width; off.height = canvas.height;
  off.getContext('2d').drawImage(imgBitmap, 0, 0);
  // Send to FaceMesh
  await faceMesh.send({ image: off });
  if (!faceLandmarks){
    statusEl.textContent = 'No face detected. Try again with better lighting.';
    return;
  }
  const polys = regionPolys();
  const scores = {};
  scores.nose = analyzeRegion(polys.nose);
  scores.chin = analyzeRegion(polys.chin);

  // Split cheeks by midline using outline; sample left/right and take average as 'cheeks'
  // Approximate cheeks as the left and right halves of the outline excluding forehead/chin
  const leftPoly = polys.outline.filter(([x,y])=>x < polys.midx);
  const rightPoly = polys.outline.filter(([x,y])=>x >= polys.midx);
  scores.cheeks = (analyzeRegion(leftPoly) + analyzeRegion(rightPoly)) / 2;

  // Forehead: take upper part of outline polygon
  const topPoly = polys.outline.slice(0, 10);
  scores.forehead = analyzeRegion(topPoly);

  // Paint heatmaps
  paintHeat(polys.nose, scores.nose);
  paintHeat(polys.chin, scores.chin);
  paintHeat(leftPoly, scores.cheeks);
  paintHeat(rightPoly, scores.cheeks);
  paintHeat(topPoly, scores.forehead);

  // Update UI
  scoresEls.forehead.textContent = (scores.forehead*100).toFixed(1) + '%';
  scoresEls.cheeks.textContent = (scores.cheeks*100).toFixed(1) + '%';
  scoresEls.nose.textContent = (scores.nose*100).toFixed(1) + '%';
  scoresEls.chin.textContent = (scores.chin*100).toFixed(1) + '%';

  showAdvice(scores);
  statusEl.textContent = 'Scan complete.';
});
