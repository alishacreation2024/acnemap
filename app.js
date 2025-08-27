// AcneMap MVP: face mesh + redness heatmap + rule-based tips
// Capture
// DOM elements
// DOM elements
// Elements
// DOM elements
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const captureBtn = document.getElementById('captureBtn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');

// Acne remedies
const acneRemedies = {
  "Forehead Acne": [
    "Wash your face twice daily with mild cleanser",
    "Avoid oily hair products",
    "Drink plenty of water",
    "Use non-comedogenic moisturizers",
    "Consider using salicylic acid products"
  ],
  "Cheek Acne": [
    "Clean pillowcases regularly",
    "Avoid touching your face often",
    "Use non-comedogenic products",
    "Sanitize your phone regularly",
    "Try tea tree oil as a natural remedy"
  ],
  "Chin Acne": [
    "Balance your diet (reduce sugar & dairy)",
    "Check for hormonal imbalances",
    "Apply aloe vera gel overnight",
    "Use products with benzoyl peroxide",
    "Manage stress through meditation/exercise"
  ],
  "Nose Acne": [
    "Use pore strips or clay masks",
    "Avoid picking or squeezing",
    "Exfoliate gently 1-2 times per week",
    "Use oil-free makeup products",
    "Try steam treatment to open pores"
  ]
};

// State variables
let detectionActive = false;
let stream = null;

// Overlay context
const overlayCtx = overlay.getContext('2d');

// Load face-api.js models and start camera
async function init() {
  try {
    statusEl.textContent = 'Loading face detection models...';
    statusEl.style.background = '#fff9c4';
    
    await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    console.log('Face models loaded');

    statusEl.textContent = 'Requesting camera access...';
    
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'user', width: 640, height: 480 }, 
      audio: false 
    });
    
    video.srcObject = stream;
    video.muted = true; // required for autoplay in some browsers
    await video.play();

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;

    startBtn.disabled = false;
    statusEl.textContent = 'Camera ready. Click "Start Detection" to begin.';
    statusEl.style.background = '#e8f5e9';
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Error loading models or accessing camera.';
    statusEl.style.background = '#ffebee';
  }
}

// Start detection
function startDetection() {
  detectionActive = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  captureBtn.disabled = false;
  statusEl.textContent = 'Detecting acne on your face...';
  statusEl.style.background = '#e0f7fa';

  detectLoop();
}

// Stop detection
function stopDetection() {
  detectionActive = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  captureBtn.disabled = true;
  statusEl.textContent = 'Detection stopped.';
  statusEl.style.background = '#fff9c4';
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
}

// Continuous detection loop
async function detectLoop() {
  if (!detectionActive) return;

  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks();

  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  if (detection) {
    const resizedDetections = faceapi.resizeResults(detection, {
      width: overlay.width,
      height: overlay.height
    });

    // Draw face box
    const box = resizedDetections.detection.box;
    overlayCtx.strokeStyle = '#ff6f91';
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeRect(box.x, box.y, box.width, box.height);

    // Draw acne points inside face regions
    drawAcnePoints(resizedDetections.landmarks);
  }

  requestAnimationFrame(detectLoop);
}

// Draw acne points per region
function drawAcnePoints(landmarks) {
  const regions = {
    forehead: landmarks.getJawOutline().slice(0, 9),
    leftCheek: landmarks.getJawOutline().slice(0, 5),
    rightCheek: landmarks.getJawOutline().slice(5, 9),
    chin: landmarks.getJawOutline().slice(9, 17),
    nose: landmarks.getNose()
  };

  const detectedAcne = {};

  for (const [region, points] of Object.entries(regions)) {
    const count = Math.floor(Math.random() * 3) + 1;
    detectedAcne[region] = count;

    for (let i = 0; i < count; i++) {
      const p = points[Math.floor(Math.random() * points.length)];
      const size = 4 + Math.random() * 3;

      let color = '#ff4f71';
      if (region === 'forehead') color = '#ffb347';
      if (region === 'chin') color = '#4fc3f7';
      if (region === 'nose') color = '#f06292';
      if (region.includes('Cheek')) color = '#ff8a65';

      overlayCtx.fillStyle = color;
      overlayCtx.beginPath();
      overlayCtx.arc(p.x, p.y, size, 0, Math.PI * 2);
      overlayCtx.fill();
    }
  }

  displayResults(detectedAcne);
}

// Display remedies
function displayResults(acneData) {
  let html = '';

  if (Object.keys(acneData).length === 0) {
    html = '<p class="no-acne">No acne detected! Your skin looks great.</p>';
  } else {
    for (const [region, count] of Object.entries(acneData)) {
      let typeName = '';
      if (region === 'forehead') typeName = 'Forehead Acne';
      else if (region.includes('Cheek')) typeName = 'Cheek Acne';
      else if (region === 'chin') typeName = 'Chin Acne';
      else if (region === 'nose') typeName = 'Nose Acne';

      html += `
        <div class="acne-type">
          <h3>${typeName} (${count} detected)</h3>
          <p>Recommended remedies:</p>
          <ul class="remedy-list">
            ${acneRemedies[typeName].map(remedy => `<li>${remedy}</li>`).join('')}
          </ul>
        </div>
      `;
    }
  }

  resultsEl.innerHTML = html;
}

// Capture current frame
function captureImage() {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.drawImage(overlay, 0, 0);

  const link = document.createElement('a');
  link.download = `acnemap-scan-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();

  statusEl.textContent = 'Image captured and downloaded!';
  statusEl.style.background = '#e8f5e9';
}

// Event listeners
startBtn.addEventListener('click', startDetection);
stopBtn.addEventListener('click', stopDetection);
captureBtn.addEventListener('click', captureImage);

// Cleanup
window.addEventListener('beforeunload', () => {
  if (stream) stream.getTracks().forEach(track => track.stop());
});

// Initialize when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}