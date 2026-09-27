// ==========================================
// Elements
// ==========================================

const imageInput =
    document.getElementById("imageInput");

const imagePreview =
    document.getElementById("imagePreview");

const previewContainer =
    document.getElementById("previewContainer");

const classifyButton =
    document.getElementById("classifyButton");

const cameraButton =
    document.getElementById("cameraButton");

const cameraContainer =
    document.getElementById("cameraContainer");

const camera =
    document.getElementById("camera");

const closeCameraButton =
    document.getElementById("closeCameraButton");

const removeImageButton =
    document.getElementById("removeImageButton");

const canvas =
    document.getElementById("canvas");

const loading =
    document.getElementById("loading");

const result =
    document.getElementById("result");

const prediction =
    document.getElementById("prediction");

const confidence =
    document.getElementById("confidence");

const confidenceFill =
    document.getElementById("confidenceFill");

const errorBox =
    document.getElementById("errorBox");

const livePrediction =
    document.getElementById("livePrediction");

const uploadButton = document.getElementById("uploadButton");
const uploadArea = document.getElementById("uploadArea");
const resultEmpty = document.getElementById("resultEmpty");
const resultStatus = document.getElementById("resultStatus");
const resultStatusText = document.getElementById("resultStatusText");
const analysisPanel = document.getElementById("analysisPanel");
const classifyLabel = document.getElementById("classifyLabel");
const imageName = document.getElementById("imageName");
const imageSize = document.getElementById("imageSize");
const confidenceBar = document.getElementById("confidenceBar");


// ==========================================
// State
// ==========================================

let selectedFile = null;

let previewURL = null;

let cameraStream = null;

let liveInterval = null;

let isPredicting = false;

let liveError = false;

let cameraOpening = false;


// Used to stabilize live predictions
let lastPrediction = null;

let stableCount = 0;


// ==========================================
// Live Classification Settings
// ==========================================

// Send one frame every 700 milliseconds
const LIVE_INTERVAL = 700;

// Ignore predictions below this confidence
const CONFIDENCE_THRESHOLD = 70;

// Same class must appear this many times
// before displaying it as detected
const REQUIRED_STABLE_FRAMES = 3;


// ==========================================
// Helper Functions
// ==========================================

function updateInterface() {
    const analyzing = loading.style.display === "flex";
    const hasResult = result.style.display === "block";
    const cameraActive = Boolean(cameraStream);
    const hasError = errorBox.style.display === "block" || liveError;
    const busy = analyzing || cameraOpening;

    uploadArea.hidden = Boolean(selectedFile) || cameraActive;
    previewContainer.style.display = selectedFile && !cameraActive ? "block" : "none";
    resultEmpty.hidden = analyzing || hasResult;
    analysisPanel.setAttribute("aria-busy", String(analyzing));
    classifyLabel.textContent = analyzing ? "Analyzing..." : cameraOpening ? "Opening camera..." : cameraActive ? "Live scan running" : "Classify waste";
    classifyButton.disabled = !selectedFile || busy || cameraActive;
    imageInput.disabled = busy;
    uploadButton.disabled = busy;
    uploadArea.disabled = busy;
    removeImageButton.disabled = busy;
    cameraButton.disabled = busy || cameraActive;

    const state = hasError ? "error" : analyzing ? "analyzing" : cameraOpening ? "opening" : hasResult ? "complete" : cameraActive ? "camera" : selectedFile ? "ready" : "idle";
    const labels = { error: "Action needed", analyzing: "Analyzing image", opening: "Opening camera", complete: "Result ready", camera: "Live camera", ready: "Ready to analyze", idle: "Awaiting image" };
    resultStatus.dataset.state = state;
    resultStatusText.textContent = labels[state];
    resultEmpty.querySelector("h3").textContent = liveError ? "The camera can't get a result." : cameraActive ? "Your camera is scanning." : "A little clarity starts here.";
    resultEmpty.querySelector("p").textContent = liveError ? "Check that the classification service is running. Your camera will keep trying automatically." : cameraActive ? "Keep one item in the frame. A result appears when the camera gets a consistent reading." : "Your material category and confidence score will appear after analysis.";
    resultEmpty.querySelector("ol").hidden = cameraActive;

    imageName.textContent = selectedFile ? selectedFile.name : "";
    imageSize.textContent = selectedFile ? (selectedFile.size < 1024 * 1024 ? `${Math.ceil(selectedFile.size / 1024)} KB` : `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`) : "";
    document.querySelectorAll("[data-category]").forEach(item => {
        item.classList.toggle("is-match", hasResult && item.dataset.category === prediction.textContent.toLowerCase());
    });
}

function showPrediction(className, confidenceValue) {
    const value = Math.max(0, Math.min(Number(confidenceValue), 100));
    prediction.textContent = formatClassName(className);
    confidence.textContent = `${value.toFixed(1)}%`;
    confidenceFill.style.width = `${value}%`;
    confidenceBar.setAttribute("aria-valuenow", String(value));
    result.style.display = "block";
    updateInterface();
}

uploadButton.addEventListener("click", () => imageInput.click());
uploadArea.addEventListener("click", () => imageInput.click());

function showError(message) {

    errorBox.textContent = message;

    errorBox.style.display = "block";

    updateInterface();
}


function hideError() {

    errorBox.textContent = "";

    errorBox.style.display = "none";

    updateInterface();
}


function hideResult() {

    result.style.display = "none";

    updateInterface();
}


function formatClassName(name) {

    if (!name) {
        return "";
    }


    return name
        .replaceAll("_", " ")
        .replace(
            /\b\w/g,
            character => character.toUpperCase()
        );
}


// ==========================================
// Show Uploaded Image Preview
// ==========================================

function showPreview(file) {

    selectedFile = file;


    if (previewURL) {

        URL.revokeObjectURL(
            previewURL
        );
    }


    previewURL =
        URL.createObjectURL(file);


    imagePreview.src =
        previewURL;


    previewContainer.style.display =
        "block";


    classifyButton.disabled =
        false;


    hideResult();
    hideError();
}


// ==========================================
// Clear Image
// ==========================================

function clearImage() {

    selectedFile = null;


    imageInput.value = "";


    imagePreview.src = "";


    previewContainer.style.display =
        "none";


    classifyButton.disabled =
        true;


    hideResult();
    hideError();


    if (previewURL) {

        URL.revokeObjectURL(
            previewURL
        );

        previewURL = null;
    }
}


// ==========================================
// Upload Image
// ==========================================

imageInput.addEventListener(
    "change",
    function () {

        const file =
            imageInput.files[0];


        if (!file) {

            return;
        }


        if (!file.type.startsWith("image/")) {

            showError(
                "Please select a valid image."
            );

            return;
        }


        stopCamera();


        showPreview(
            file
        );
    }
);


// ==========================================
// Open Camera
// ==========================================

cameraButton.addEventListener(
    "click",
    async function () {

        if (cameraOpening || cameraStream || loading.style.display === "flex") {
            return;
        }

        hideError();
        hideResult();


        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {

            showError(
                "Camera access is not supported by this browser."
            );

            return;
        }


        cameraOpening = true;
        updateInterface();

        try {

            cameraStream =
                await navigator.mediaDevices.getUserMedia({

                    video: {

                        // Try to use back camera on mobile
                        facingMode: {
                            ideal: "environment"
                        },

                        width: {
                            ideal: 1280
                        },

                        height: {
                            ideal: 720
                        }
                    },

                    audio: false
                });


            camera.srcObject =
                cameraStream;


            cameraContainer.style.display =
                "block";


            cameraButton.disabled =
                true;

            updateInterface();


            livePrediction.textContent =
                "Starting camera...";


            // Start classification only when
            // camera metadata is available
            camera.onloadedmetadata =
                async function () {

                    await camera.play();


                    startLiveClassification();
                };

        }

        catch (error) {

            console.error(
                "Camera error:",
                error
            );


            showError(
                "Could not access the camera. Please allow camera permission."
            );
        }

        finally {
            cameraOpening = false;
            updateInterface();
        }
    }
);


// ==========================================
// Start Live Classification
// ==========================================

function startLiveClassification() {

    liveError = false;

    lastPrediction = null;

    stableCount = 0;

    isPredicting = false;


    livePrediction.textContent =
        "Scanning...";


    livePrediction.classList.remove(
        "detected"
    );

    updateInterface();


    // Prevent duplicate intervals
    if (liveInterval) {

        clearInterval(
            liveInterval
        );
    }


    liveInterval =
        setInterval(

            classifyCurrentFrame,

            LIVE_INTERVAL
        );
}


// ==========================================
// Classify Current Camera Frame
// ==========================================

async function classifyCurrentFrame() {

    // Don't send another request while
    // previous prediction is still running
    if (isPredicting) {

        return;
    }


    // Make sure camera is active
    if (!cameraStream) {

        return;
    }


    // Camera may not be ready yet
    if (
        !camera.videoWidth ||
        !camera.videoHeight
    ) {

        return;
    }


    isPredicting = true;

    const activeStream = cameraStream;


    try {

        const width =
            camera.videoWidth;


        const height =
            camera.videoHeight;


        canvas.width =
            width;


        canvas.height =
            height;


        const context =
            canvas.getContext(
                "2d"
            );


        // Copy current video frame
        // into hidden canvas
        context.drawImage(
            camera,
            0,
            0,
            width,
            height
        );


        // Convert canvas to JPEG
        const blob =
            await new Promise(
                resolve => {

                    canvas.toBlob(
                        resolve,
                        "image/jpeg",
                        0.80
                    );
                }
            );


        if (!blob) {

            throw new Error(
                "Could not create camera frame."
            );
        }


        // Create form data
        const formData =
            new FormData();


        formData.append(
            "file",
            blob,
            "live_frame.jpg"
        );


        // Send frame to FastAPI
        const response =
            await fetch(

                "/predict",

                {
                    method: "POST",
                    body: formData
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.detail ||
                "Prediction failed."
            );
        }


        // Process result
        if (cameraStream !== activeStream) {
            return;
        }

        handleLivePrediction(
            data.prediction,
            Number(data.confidence)
        );

    }

    catch (error) {

        if (cameraStream !== activeStream) {
            return;
        }

        liveError = true;

        console.error(
            "Live prediction error:",
            error
        );


        livePrediction.textContent =
            "Connection error";


        livePrediction.classList.remove(
            "detected"
        );

        hideResult();

    }

    finally {

        if (cameraStream === activeStream) {
            isPredicting = false;
        }
    }
}


// ==========================================
// Stabilize Live Predictions
// ==========================================

function handleLivePrediction(
    predictedClass,
    confidenceValue
) {

    liveError = false;

    // --------------------------------------
    // Low confidence
    // --------------------------------------

    if (
        confidenceValue <
        CONFIDENCE_THRESHOLD
    ) {

        lastPrediction = null;

        stableCount = 0;


        livePrediction.textContent =
            `Not sure — ${confidenceValue.toFixed(1)}%`;


        livePrediction.classList.remove(
            "detected"
        );

        hideResult();


        return;
    }


    // --------------------------------------
    // Check prediction stability
    // --------------------------------------

    if (
        predictedClass ===
        lastPrediction
    ) {

        stableCount++;

    }

    else {

        lastPrediction =
            predictedClass;


        stableCount = 1;
    }


    // --------------------------------------
    // Wait for stable result
    // --------------------------------------

    if (
        stableCount <
        REQUIRED_STABLE_FRAMES
    ) {

        livePrediction.textContent =
            "Analyzing...";


        livePrediction.classList.remove(
            "detected"
        );

        hideResult();


        return;
    }


    // --------------------------------------
    // Stable Detection
    // --------------------------------------

    const formattedName =
        formatClassName(
            predictedClass
        );


    livePrediction.textContent =
        `${formattedName} — ${confidenceValue.toFixed(1)}%`;


    livePrediction.classList.add(
        "detected"
    );

    showPrediction(predictedClass, confidenceValue);
}


// ==========================================
// Stop Camera
// ==========================================

function stopCamera() {

    const wasActive = Boolean(cameraStream);

    liveError = false;

    // Stop live prediction loop
    if (liveInterval) {

        clearInterval(
            liveInterval
        );


        liveInterval = null;
    }


    // Stop camera tracks
    if (cameraStream) {

        cameraStream
            .getTracks()
            .forEach(
                track => track.stop()
            );


        cameraStream = null;
    }


    camera.srcObject =
        null;


    cameraContainer.style.display =
        "none";


    cameraButton.disabled =
        false;


    isPredicting = false;


    lastPrediction = null;

    stableCount = 0;


    if (livePrediction) {

        livePrediction.textContent =
            "Point the camera at waste";


        livePrediction.classList.remove(
            "detected"
        );
    }

    if (wasActive) {
        hideResult();
    }

    updateInterface();
}


// ==========================================
// Close Camera Button
// ==========================================

closeCameraButton.addEventListener(
    "click",
    function () {

        stopCamera();
    }
);


// ==========================================
// Remove Uploaded Image
// ==========================================

removeImageButton.addEventListener(
    "click",
    function () {

        clearImage();
    }
);


// ==========================================
// Uploaded Image Classification
// ==========================================

classifyButton.addEventListener(
    "click",
    async function () {

        if (!selectedFile) {

            return;
        }


        hideError();
        hideResult();


        const formData =
            new FormData();


        formData.append(
            "file",
            selectedFile
        );


        loading.style.display =
            "flex";


        classifyButton.disabled =
            true;

        updateInterface();


        try {

            const response =
                await fetch(

                    "/predict",

                    {
                        method: "POST",
                        body: formData
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.detail ||
                    "Prediction request failed."
                );
            }


            showPrediction(data.prediction, data.confidence);

        }

        catch (error) {

            console.error(
                "Prediction error:",
                error
            );


            showError(
                error.message ||
                "Could not connect to the classification API."
            );

        }

        finally {

            loading.style.display =
                "none";


            classifyButton.disabled =
                selectedFile === null;

            updateInterface();
        }
    }
);


// ==========================================
// Stop Camera When Page Closes
// ==========================================

window.addEventListener(
    "beforeunload",
    function () {

        stopCamera();
    }
);

updateInterface();
