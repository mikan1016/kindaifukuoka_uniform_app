const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');
const loadingOverlay = document.getElementById('loading-overlay');
const captureBtn = document.getElementById('capture-btn');
const uniformRadios = document.querySelectorAll('input[name="uniform"]');

let currentUniformType = 'male';
const uniforms = {
    male: new Image(),
    female: new Image()
};

// images need to be loaded
uniforms.male.src = 'assets/male.png';
uniforms.female.src = 'assets/female.png';

// Handle image loading errors (placeholder if missing)
function handleImageError(type) {
    console.warn(`${type} uniform image not found. Please place ${type}.png in assets folder.`);
}
uniforms.male.onerror = () => handleImageError('male');
uniforms.female.onerror = () => handleImageError('female');


// Update selected uniform
uniformRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        currentUniformType = e.target.value;
    });
});

function onResults(results) {
    if (isPaused) return;

    // Hide loading overlay once we get results
    loadingOverlay.style.display = 'none';

    // Adjust canvas size to match video
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    // Draw the video frame to the canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Mirror the video image
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    if (results.poseLandmarks) {
        drawUniform(results.poseLandmarks);
    }
}

function drawUniform(landmarks) {
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    // Ankles removed to simplify and stabilize scaling

    // Basic check: Shoulders must be visible
    if (!leftShoulder || !rightShoulder || leftShoulder.visibility < 0.5 || rightShoulder.visibility < 0.5) return;

    const width = canvasElement.width;
    const height = canvasElement.height;

    // Shoulder points
    const x1 = (1 - leftShoulder.x) * width;
    const y1 = leftShoulder.y * height;
    const x2 = (1 - rightShoulder.x) * width;
    const y2 = rightShoulder.y * height;

    const shoulderCenterX = (x1 + x2) / 2;
    const shoulderCenterY = (y1 + y2) / 2;
    const shoulderWidth = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1);

    // Check hips visibility
    const hipsVisible = leftHip && rightHip && leftHip.visibility > 0.5 && rightHip.visibility > 0.5;

    let imgWidth, imgHeight, anchorX, anchorY, yAdjust;

    const img = uniforms[currentUniformType];
    if (!img.complete || img.naturalHeight === 0) return;

    // Anchor is ALWAYS Shoulder Center
    anchorX = shoulderCenterX;
    anchorY = shoulderCenterY;

    if (hipsVisible) {
        // --- Torso Logic (Shoulder to Hip) ---
        const x3 = (1 - leftHip.x) * width;
        const y3 = leftHip.y * height;
        const x4 = (1 - rightHip.x) * width;
        const y4 = rightHip.y * height;

        const hipCenterX = (x3 + x4) / 2;
        const hipCenterY = (y3 + y4) / 2;
        const torsoLength = Math.hypot(hipCenterX - shoulderCenterX, hipCenterY - shoulderCenterY);

        let heightMultiplier;
        // 制服画像内での肩の位置（上からの割合）
        // 0.04 approximates the neck position (slightly above shoulder line)
        // User feedback: 0.1 was at chin (too high), 0.0 was too low.
        let shoulderYRatio;

        if (currentUniformType === 'male') {
            heightMultiplier = 2.95; // Adjusted to balance position and coverage
            shoulderYRatio = 0.04;
        } else {
            heightMultiplier = 2.75;
            shoulderYRatio = 0.04;
        }

        imgHeight = torsoLength * heightMultiplier;
        const imgRatio = img.width / img.height;
        imgWidth = imgHeight * imgRatio;

        // Calculate offset to align image shoulder with detected shoulder
        // We want the point (imgWidth/2, imgHeight * shoulderYRatio) to be at (0,0) in rotated space
        yAdjust = imgHeight * (0.5 - shoulderYRatio); // Convert from center-relative to shoulder-relative

    } else {
        // --- Fallback: Shoulder Width Logic ---
        let scaleFactor;
        // 0.04 approximates the neck position (slightly above shoulder line)
        // User feedback: 0.1 was at chin (too high), 0.0 was too low.
        let shoulderYRatio = 0.04;

        if (currentUniformType === 'male') {
            scaleFactor = 3.7;
        } else {
            scaleFactor = 3.4;
        }

        imgWidth = shoulderWidth * scaleFactor;
        const imgRatio = img.height / img.width;
        imgHeight = imgWidth * imgRatio;

        yAdjust = imgHeight * (0.5 - shoulderYRatio);
    }

    // Draw
    canvasCtx.save();
    canvasCtx.translate(anchorX, anchorY);
    canvasCtx.rotate(angle);
    canvasCtx.drawImage(img, -imgWidth / 2, -imgHeight / 2 + yAdjust, imgWidth, imgHeight);
    canvasCtx.restore();
}

// Setup MediaPipe Pose
const pose = new Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults(onResults);

// Setup Camera
// We use MediaPipe Camera Utils which simplifies the rAF loop
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await pose.send({ image: videoElement });
    },
    width: 640,
    height: 480
});

camera.start().then(() => {
    console.log("Camera started");
}).catch(err => {
    console.error("Error starting camera:", err);
    loadingOverlay.innerHTML = "<p>カメラの起動に失敗しました。<br>カメラの許可を確認してください。</p>";
});

// Capture and Save
const saveBtn = document.getElementById('save-btn');
const retryBtn = document.getElementById('retry-btn');
const resultControls = document.getElementById('result-controls');

let isPaused = false;

// Capture (Freeze)
captureBtn.addEventListener('click', () => {
    isPaused = true;
    captureBtn.style.display = 'none';
    resultControls.style.display = 'flex';
    // Hide uniform selector during preview
    document.querySelector('.uniform-selector').style.display = 'none';
});

// Save (Download)
saveBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `kindai-uniform-${Date.now()}.png`;
    link.href = canvasElement.toDataURL();
    link.click();
});

// Retry (Resume)
retryBtn.addEventListener('click', () => {
    isPaused = false;
    captureBtn.style.display = 'inline-block'; // or block depending on CSS, but inline-block is safer for buttons usually
    resultControls.style.display = 'none';
    document.querySelector('.uniform-selector').style.display = 'flex';
});
