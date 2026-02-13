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

    // Mirror the video image ONLY if using front camera ('user')
    canvasCtx.translate(canvasElement.width, 0);
    if (currentFacingMode === 'user') {
        canvasCtx.scale(-1, 1);
    } else {
        // For back camera, we don't want mirror effect usually, 
        // BUT MediaPipe Pose expects a certain orientation. 
        // If we don't mirror, the drawing might be inverted relative to the video if we used translated context.
        // Actually, standard behavior:
        // Front (User): Mirrored. (User moves right, image moves right).
        // Back (Env): Not Mirrored. (User moves right, image moves left... wait).
        // Let's stick to standard behavior.
        // If we translated (width, 0), then scale(-1, 1) flips it.
        // If we want NORMAL (no flip), we should NOT translate/scale like that, 
        // OR we translate (0,0) and scale (1,1).

        // Reset transformation from the translate above if we are NOT mirroring
        // Wait, the previous line `canvasCtx.translate(canvasElement.width, 0);` is already applied.
        // If we want normal, we need to undo that or handle it.
        // For simplicity:
        // User (Front):  Translate(w, 0) -> Scale(-1, 1)  (Original code)
        // Env (Back):    Translate(0, 0) -> Scale(1, 1)
    }

    // Resetting the transform logic for clarity:
    canvasCtx.restore(); // Restore to clean state (saved at line 44)
    canvasCtx.save(); // Save again for drawing

    if (currentFacingMode === 'user') {
        // Mirror
        canvasCtx.translate(canvasElement.width, 0);
        canvasCtx.scale(-1, 1);
    } else {
        // Normal (No mirror)
        // No extra transform needed
    }

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
    // Shoulder points
    let x1, x2;
    if (currentFacingMode === 'user') {
        x1 = (1 - leftShoulder.x) * width;
        x2 = (1 - rightShoulder.x) * width;
    } else {
        x1 = leftShoulder.x * width;
        x2 = rightShoulder.x * width;
    }

    const y1 = leftShoulder.y * height;
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
        // --- Torso Logic (Shoulder to Hip) ---
        let x3, x4;
        if (currentFacingMode === 'user') {
            x3 = (1 - leftHip.x) * width;
            x4 = (1 - rightHip.x) * width;
        } else {
            x3 = leftHip.x * width;
            x4 = rightHip.x * width;
        }

        const y3 = leftHip.y * height;
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

    if (currentFacingMode === 'environment') {
        // Back camera often results in 180 degree rotation because L/R shoulders are swapped visually
        // flipping Y corrects the upside-down issue while maintaining correct L/R mapping
        canvasCtx.scale(1, -1);
    }

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

// Custom Camera Handling
let animationFrameId;
let currentFacingMode = 'user'; // 'user' (front) or 'environment' (back)

const switchCameraBtn = document.getElementById('switch-camera-btn');

// Stop current video stream
function stopCamera() {
    if (videoElement.srcObject) {
        const stream = videoElement.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        videoElement.srcObject = null;
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
}

// Start Camera with specific facing mode
async function startCamera(facingMode) {
    stopCamera();
    loadingOverlay.style.display = 'flex';

    // Constraints
    const constraints = {
        video: {
            facingMode: facingMode,
            width: { ideal: 640 },
            height: { ideal: 480 }
        },
        audio: false
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;

        // Wait for video to be ready
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            loadingOverlay.style.display = 'none';
            // Start detection loop
            detectPose();
        };
    } catch (err) {
        console.error("Error starting camera:", err);
        loadingOverlay.innerHTML = "<p>カメラの起動に失敗しました。<br>カメラの許可またはhttps接続を確認してください。</p>";
        loadingOverlay.style.display = 'flex';
    }
}

// Detection Loop
async function detectPose() {
    if (!videoElement.paused && !videoElement.ended) {
        await pose.send({ image: videoElement });
        animationFrameId = requestAnimationFrame(detectPose);
    }
}

// Handle Camera Switch
switchCameraBtn.addEventListener('click', () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    startCamera(currentFacingMode);
});


// Logic for onResults needs update for mirroring
// We update the onResults function to handle mirroring based on facing mode

// Replace the original onResults with this modified version
// OR we can modify the existing onResults. 
// Let's modify the existing onResults to support the new logic.
// Note: This block replaces the initialization code, NOT onResults (which is defined earlier).
// But onResults is defined BEFORE this block in the file (lines 33-56).
// We need to make sure onResults uses the correct mirroring.
// Since we cannot edit onResults easily from here without re-writing the whole file or using multi_replace carefully,
// I will rely on the fact that I am replacing the Camera util block.
// BUT, onResults uses canvasCtx.scale(-1, 1). This is hardcoded mirroring.
// We need to change that.

// Let's first start the camera
startCamera(currentFacingMode).then(() => {
    console.log("Camera started");
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
