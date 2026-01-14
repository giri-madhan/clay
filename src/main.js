import * as THREE from 'three';

// --- Configuration ---
const CONFIG = {
    clayColor: 0xE07A5F,
    backgroundColor: 0xF5F5DC, // Beige
    rotationSpeed: 2.0, // Radians per second
    sculptStrength: 0.05,
    sculptRadius: 0.5, // Vertical influence radius
    minRadius: 0.2, // Don't sculpt thinner than this
    maxRadius: 3.5, // Don't sculpt thicker than this
    clayHeight: 5,
    clayRadius: 1.5,
    segmentsRadial: 128,
    segmentsHeight: 128
};

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.backgroundColor);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 3, 8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
scene.add(dirLight);

// --- Clay Mesh ---
// Generate a simple noise texture for the clay so we can see it spinning
const canvas = document.createElement('canvas');
canvas.width = 512;
canvas.height = 512;
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#E07A5F';
ctx.fillRect(0,0,512,512);
// Add noise
for(let i=0; i<50000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#cc6950' : '#f08a6f';
    ctx.fillRect(Math.random()*512, Math.random()*512, 2, 2);
}
const clayTexture = new THREE.CanvasTexture(canvas);

const geometry = new THREE.CylinderGeometry(
    CONFIG.clayRadius, // radiusTop
    CONFIG.clayRadius, // radiusBottom
    CONFIG.clayHeight,
    CONFIG.segmentsRadial,
    CONFIG.segmentsHeight,
    true // openEnded?
);
// Determine UVs properly or just use default. Default cylinder UVs wrap around.

const positionAttribute = geometry.attributes.position;
const vertex = new THREE.Vector3();

const material = new THREE.MeshStandardMaterial({
    map: clayTexture,
    roughness: 0.8,
    metalness: 0.1,
});

const clayMesh = new THREE.Mesh(geometry, material);
clayMesh.castShadow = true;
clayMesh.receiveShadow = true;
scene.add(clayMesh);

// --- Invisible Plane for Raycasting ---
// This plane bisects the cylinder and faces the camera roughly.
// Since our camera is at (0, 3, 8), a plane at Z=0 is perfect.
const planeGeo = new THREE.PlaneGeometry(20, 20);
const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
const sculptPlane = new THREE.Mesh(planeGeo, planeMat);
// We want the plane to align with the axis of rotation (Y) and be roughly perpendicular to camera view.
// Default PlaneGeometry is in XY plane (normal Z). That works for Z distance check.
scene.add(sculptPlane);

// --- Cursor Helper ---
const cursorGeo = new THREE.SphereGeometry(0.1, 16, 16);
const cursorMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 });
const cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
scene.add(cursorMesh);


// --- Floor ---
const floorGeo = new THREE.PlaneGeometry(20, 20);
const floorMat = new THREE.MeshStandardMaterial({ 
    color: 0xeeeeee,
    roughness: 1.0,
    metalness: 0.0
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -CONFIG.clayHeight / 2 - 0.1; // Just below the clay
floor.receiveShadow = true;
scene.add(floor);


// --- Interaction Logic ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isMouseDown = false;

window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('mousedown', () => { isMouseDown = true; });
window.addEventListener('mouseup', () => { isMouseDown = false; });

// --- Touch Support ---
window.addEventListener('touchstart', (event) => {
    event.preventDefault();
    isMouseDown = true;
    const touch = event.touches[0];
    mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
}, { passive: false });

window.addEventListener('touchmove', (event) => {
    event.preventDefault();
    const touch = event.touches[0];
    mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
}, { passive: false });

window.addEventListener('touchend', () => { isMouseDown = false; });
window.addEventListener('touchcancel', () => { isMouseDown = false; });

// Sculpting Function
function sculpt(intersectPoint) {
    // The intersectPoint is on the plane Z=0.
    // localPoint relative to mesh? Mesh is at 0,0,0.
    // So intersectPoint IS the local point (ignoring rotation for the "radius" target).
    
    // We want the radius at this Y height to become the distance from Y axis.
    // P = (x, y, 0). Dist = abs(x).
    
    // However, the user might be dragging outside the mesh to "pull" or inside to "push".
    // Reference radius is simply abs(intersectPoint.x).
    
    let targetRadius = Math.abs(intersectPoint.x);
    
    // Clamp target radius
    targetRadius = Math.max(CONFIG.minRadius, Math.min(CONFIG.maxRadius, targetRadius));

    // Y level
    const targetY = intersectPoint.y;
    
    // Apply changes
    const count = positionAttribute.count;
    let needsUpdate = false;

    // Iterate vertices
    for (let i = 0; i < count; i++) {
        const y = positionAttribute.getY(i);
        const dy = Math.abs(y - targetY);
        
        if (dy < CONFIG.sculptRadius) {
            const x = positionAttribute.getX(i);
            const z = positionAttribute.getZ(i);
            const currentRadius = Math.sqrt(x*x + z*z);
            
            // Influence factor
            const factor = Math.exp(- (dy * dy) / (0.1)); // Shape of the tool
            
            // Move towards target radius
            // We use lerp to make it feel like "pressure" over time
            const speed = CONFIG.sculptStrength; 
            const newRadius = currentRadius + (targetRadius - currentRadius) * factor * speed;
            
            const angle = Math.atan2(z, x);
            positionAttribute.setX(i, Math.cos(angle) * newRadius);
            positionAttribute.setZ(i, Math.sin(angle) * newRadius);
            
            needsUpdate = true;
        }
    }

    if (needsUpdate) {
        positionAttribute.needsUpdate = true;
        geometry.computeVertexNormals();
    }
}




// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Custom Settings Menu ---
let isInteractingWithGUI = false;
let isMenuOpen = false;

// Create settings container
const settingsContainer = document.createElement('div');
settingsContainer.id = 'settings-container';
settingsContainer.innerHTML = `
    <style>
        #settings-container {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        #gear-button {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.9);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            transition: all 0.3s ease;
        }
        
        #gear-button:hover {
            background: rgba(255, 255, 255, 1);
            transform: scale(1.05);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
        }
        
        #gear-button.active {
            background: #E07A5F;
        }
        
        #gear-button.active svg {
            fill: white;
        }
        
        #gear-button svg {
            width: 24px;
            height: 24px;
            fill: #333;
            transition: transform 0.4s ease;
        }
        
        #gear-button.active svg {
            transform: rotate(90deg);
        }
        
        #settings-menu {
            position: absolute;
            top: 60px;
            right: 0;
            width: 260px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            padding: 20px;
            opacity: 0;
            visibility: hidden;
            transform: translateY(-10px) scale(0.95);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        #settings-menu.open {
            opacity: 1;
            visibility: visible;
            transform: translateY(0) scale(1);
        }
        
        .setting-group {
            margin-bottom: 16px;
        }
        
        .setting-group:last-child {
            margin-bottom: 0;
        }
        
        .setting-label {
            font-size: 12px;
            font-weight: 600;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
            display: block;
        }
        
        .setting-slider {
            width: 100%;
            height: 6px;
            -webkit-appearance: none;
            appearance: none;
            background: #e0e0e0;
            border-radius: 3px;
            outline: none;
            cursor: pointer;
        }
        
        .setting-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px;
            height: 18px;
            background: #E07A5F;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(224, 122, 95, 0.4);
            transition: transform 0.2s ease;
        }
        
        .setting-slider::-webkit-slider-thumb:hover {
            transform: scale(1.1);
        }
        
        .setting-value {
            font-size: 11px;
            color: #999;
            margin-top: 4px;
            text-align: right;
        }
        
        .color-picker-wrapper {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .color-picker {
            width: 40px;
            height: 40px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            padding: 0;
            overflow: hidden;
        }
        
        .color-preview {
            width: 40px;
            height: 40px;
            border-radius: 8px;
            background: #E07A5F;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        #share-button {
            width: 100%;
            padding: 14px 20px;
            margin-top: 16px;
            background: linear-gradient(135deg, #E07A5F 0%, #c96b52 100%);
            border: none;
            border-radius: 12px;
            color: white;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(224, 122, 95, 0.3);
        }
        
        #share-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(224, 122, 95, 0.4);
        }
        
        #share-button:active {
            transform: translateY(0);
        }
        
        #share-button svg {
            width: 18px;
            height: 18px;
            fill: white;
        }
        
        #share-button.sharing {
            opacity: 0.7;
            pointer-events: none;
        }
        
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    </style>
    
    <button id="gear-button" title="Settings">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
        </svg>
    </button>
    
    <div id="settings-menu">
        <div class="setting-group">
            <label class="setting-label">Rotation Speed</label>
            <input type="range" class="setting-slider" id="rotation-speed" min="0" max="10" step="0.1" value="${CONFIG.rotationSpeed}">
            <div class="setting-value" id="rotation-speed-value">${CONFIG.rotationSpeed.toFixed(1)}</div>
        </div>
        
        <div class="setting-group">
            <label class="setting-label">Sculpt Strength</label>
            <input type="range" class="setting-slider" id="sculpt-strength" min="0.01" max="0.5" step="0.01" value="${CONFIG.sculptStrength}">
            <div class="setting-value" id="sculpt-strength-value">${CONFIG.sculptStrength.toFixed(2)}</div>
        </div>
        
        <div class="setting-group">
            <label class="setting-label">Sculpt Radius</label>
            <input type="range" class="setting-slider" id="sculpt-radius" min="0.1" max="2.0" step="0.1" value="${CONFIG.sculptRadius}">
            <div class="setting-value" id="sculpt-radius-value">${CONFIG.sculptRadius.toFixed(1)}</div>
        </div>
        
        <div class="setting-group">
            <label class="setting-label">Clay Color</label>
            <div class="color-picker-wrapper">
                <input type="color" class="color-picker" id="clay-color" value="#E07A5F">
            </div>
        </div>
        
        <button id="share-button">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
            </svg>
            Share Sculpture
        </button>
    </div>
`;
document.body.appendChild(settingsContainer);

// Get elements
const gearButton = document.getElementById('gear-button');
const settingsMenu = document.getElementById('settings-menu');

// Toggle menu
gearButton.addEventListener('click', () => {
    isMenuOpen = !isMenuOpen;
    gearButton.classList.toggle('active', isMenuOpen);
    settingsMenu.classList.toggle('open', isMenuOpen);
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    if (!settingsContainer.contains(e.target) && isMenuOpen) {
        isMenuOpen = false;
        gearButton.classList.remove('active');
        settingsMenu.classList.remove('open');
    }
});

// Prevent GUI interactions from affecting clay sculpting
settingsContainer.addEventListener('mouseenter', () => { isInteractingWithGUI = true; });
settingsContainer.addEventListener('mouseleave', () => { isInteractingWithGUI = false; });
settingsContainer.addEventListener('touchstart', (e) => { 
    isInteractingWithGUI = true; 
    e.stopPropagation(); 
}, { passive: false });
settingsContainer.addEventListener('touchend', () => { isInteractingWithGUI = false; });
settingsContainer.addEventListener('touchcancel', () => { isInteractingWithGUI = false; });

// Slider event listeners
document.getElementById('rotation-speed').addEventListener('input', (e) => {
    CONFIG.rotationSpeed = parseFloat(e.target.value);
    document.getElementById('rotation-speed-value').textContent = CONFIG.rotationSpeed.toFixed(1);
});

document.getElementById('sculpt-strength').addEventListener('input', (e) => {
    CONFIG.sculptStrength = parseFloat(e.target.value);
    document.getElementById('sculpt-strength-value').textContent = CONFIG.sculptStrength.toFixed(2);
});

document.getElementById('sculpt-radius').addEventListener('input', (e) => {
    CONFIG.sculptRadius = parseFloat(e.target.value);
    document.getElementById('sculpt-radius-value').textContent = CONFIG.sculptRadius.toFixed(1);
});

document.getElementById('clay-color').addEventListener('input', (e) => {
    const color = e.target.value;
    material.color.setStyle(color);
});

// Share button functionality
document.getElementById('share-button').addEventListener('click', async () => {
    const shareButton = document.getElementById('share-button');
    shareButton.classList.add('sharing');
    shareButton.innerHTML = `
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="animation: spin 1s linear infinite;">
            <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
        </svg>
        Capturing...
    `;
    
    try {
        // Hide cursor and settings for clean screenshot
        const wasMenuOpen = isMenuOpen;
        cursorMesh.visible = false;
        settingsContainer.style.visibility = 'hidden';
        
        // Render one frame to update the scene
        renderer.render(scene, camera);
        
        // Get the canvas data
        const canvas = renderer.domElement;
        
        // Convert canvas to blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const file = new File([blob], 'my-clay-sculpture.png', { type: 'image/png' });
        
        // Restore UI
        settingsContainer.style.visibility = 'visible';
        
        // Check if Web Share API is available and can share files
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'My Clay Sculpture',
                text: 'Check out my clay sculpture! 🎨'
            });
        } else if (navigator.share) {
            // Fallback: share without file (just text/url)
            // First download the image
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'my-clay-sculpture.png';
            a.click();
            URL.revokeObjectURL(url);
            
            // Then try to share text
            await navigator.share({
                title: 'My Clay Sculpture',
                text: 'Check out my clay sculpture! 🎨'
            });
        } else {
            // Fallback for desktop: just download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'my-clay-sculpture.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Share failed:', error);
        }
    } finally {
        // Restore button state
        shareButton.classList.remove('sharing');
        shareButton.innerHTML = `
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
            </svg>
            Share Sculpture
        `;
        settingsContainer.style.visibility = 'visible';
    }
});

// --- Animation Loop ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // 1. Rotate Clay
    clayMesh.rotation.y += CONFIG.rotationSpeed * delta;

    // 2. Mouse sculpting
    raycaster.setFromCamera(mouse, camera);
    
    const intersects = raycaster.intersectObject(sculptPlane);
    
    if (intersects.length > 0) {
        const point = intersects[0].point;
        
        if (point.y < CONFIG.clayHeight/2 + 1 && point.y > -CONFIG.clayHeight/2 - 1) {
            cursorMesh.visible = true;
            cursorMesh.position.copy(point);
            cursorMesh.material.color.set(isMouseDown ? 0xffff00 : 0xff0000);
            
            if (isMouseDown && !isInteractingWithGUI) {
                sculpt(point);
            }
        } else {
            cursorMesh.visible = false;
        }
    } else {
        cursorMesh.visible = false;
    }

    renderer.render(scene, camera);
}

animate();

