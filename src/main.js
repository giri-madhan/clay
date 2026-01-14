import * as THREE from 'three';

// --- Configuration ---
const CONFIG = {
    backgroundColor: 0xD4D0C8, // Soft warm gray
    rotationSpeed: 2.0, // Radians per second
    sculptStrength: 0.05,
    sculptRadius: 0.5, // Vertical influence radius
    minRadius: 0.2, // Don't sculpt thinner than this
    maxRadius: 3.5, // Don't sculpt thicker than this
    clayHeight: 5,
    clayRadius: 1.5,
    segmentsRadial: 64,
    segmentsHeight: 64
};

// --- Material Presets ---
const MATERIALS = {
    clay: {
        name: 'Clay',
        color: 0xB5651D,  // Authentic terracotta brown
        roughness: 0.9,
        metalness: 0.0,
        transparent: false,
        opacity: 1,
        envMapIntensity: 0.1,
        isJelly: false
    },
    gold: {
        name: 'Gold',
        color: 0xFFD700,
        roughness: 0.2,
        metalness: 1.0,
        transparent: false,
        opacity: 1,
        envMapIntensity: 1.0,
        isJelly: false
    },
    glass: {
        name: 'Glass',
        color: 0x88CCFF,
        roughness: 0.0,
        metalness: 0.0,
        transparent: true,
        opacity: 0.4,
        envMapIntensity: 1.0,
        isJelly: false
    },
    chrome: {
        name: 'Chrome',
        color: 0xCCCCCC,
        roughness: 0.05,
        metalness: 1.0,
        transparent: false,
        opacity: 1,
        envMapIntensity: 1.5,
        isJelly: false
    },
    jelly: {
        name: 'Jelly',
        color: 0xFF6B9D,
        roughness: 0.2,
        metalness: 0.0,
        transparent: true,
        opacity: 0.7,
        envMapIntensity: 0.5,
        isJelly: true
    }
};

// --- Shape Templates ---
const SHAPES = {
    cylinder: 'Cylinder',
    sphere: 'Sphere',
    cone: 'Cone',
    cube: 'Cube',
    torus: 'Torus'
};

// --- State ---
let currentMaterial = 'clay';
let currentShape = 'cylinder';
let historyStack = [];
const MAX_HISTORY = 20;

// --- ASMR Sound System ---
let audioContext = null;
let isSoundEnabled = false;
let lastSoundTime = 0;
const SOUND_COOLDOWN = 50; // ms between sounds

function initAudio() {
    if (audioContext) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

// Create a squishy clay sound
function playSquishSound(intensity = 0.5) {
    if (!isSoundEnabled || !audioContext) return;
    
    const now = Date.now();
    if (now - lastSoundTime < SOUND_COOLDOWN) return;
    lastSoundTime = now;
    
    const time = audioContext.currentTime;
    
    // Create noise buffer for squelchy texture
    const bufferSize = audioContext.sampleRate * 0.15;
    const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
        // Brown noise (more bass, less harsh)
        noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    
    // Low-pass filter for muffled, wet sound
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(800 + Math.random() * 400, time);
    lowpass.frequency.exponentialRampToValueAtTime(200, time + 0.1);
    lowpass.Q.value = 2;
    
    // Bandpass for body
    const bandpass = audioContext.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 300 + Math.random() * 200;
    bandpass.Q.value = 1;
    
    // Gain envelope
    const gainNode = audioContext.createGain();
    const volume = 0.15 * intensity;
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(volume, time + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    
    // Connect: noise -> lowpass -> bandpass -> gain -> output
    noiseSource.connect(lowpass);
    lowpass.connect(bandpass);
    bandpass.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    noiseSource.start(time);
    noiseSource.stop(time + 0.15);
    
    // Add a subtle pop/thud for impact
    if (Math.random() > 0.5) {
        const osc = audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150 + Math.random() * 50, time);
        osc.frequency.exponentialRampToValueAtTime(50, time + 0.08);
        
        const oscGain = audioContext.createGain();
        oscGain.gain.setValueAtTime(0.08 * intensity, time);
        oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
        
        osc.connect(oscGain);
        oscGain.connect(audioContext.destination);
        
        osc.start(time);
        osc.stop(time + 0.1);
    }
}

// Create a stretchy/pulling sound for jelly
function playStretchSound(intensity = 0.5) {
    if (!isSoundEnabled || !audioContext) return;
    
    const now = Date.now();
    if (now - lastSoundTime < SOUND_COOLDOWN) return;
    lastSoundTime = now;
    
    const time = audioContext.currentTime;
    
    // Sine wave sweep for stretchy feel
    const osc = audioContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200 + Math.random() * 100, time);
    osc.frequency.exponentialRampToValueAtTime(80 + Math.random() * 40, time + 0.2);
    
    // Add slight vibrato
    const vibrato = audioContext.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.value = 15 + Math.random() * 10;
    
    const vibratoGain = audioContext.createGain();
    vibratoGain.gain.value = 20;
    
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);
    
    // Main gain
    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(0.1 * intensity, time + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    
    // Filter
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 3;
    
    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    osc.start(time);
    vibrato.start(time);
    osc.stop(time + 0.25);
    vibrato.stop(time + 0.25);
}

// Create a metallic tink for chrome/gold
function playMetallicSound(intensity = 0.5) {
    if (!isSoundEnabled || !audioContext) return;
    
    const now = Date.now();
    if (now - lastSoundTime < SOUND_COOLDOWN * 1.5) return;
    lastSoundTime = now;
    
    const time = audioContext.currentTime;
    
    // Multiple harmonics for metallic ring
    const frequencies = [800, 1200, 1800, 2400].map(f => f + Math.random() * 100);
    
    frequencies.forEach((freq, i) => {
        const osc = audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        
        const gainNode = audioContext.createGain();
        const vol = (0.05 / (i + 1)) * intensity;
        gainNode.gain.setValueAtTime(vol, time);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.3 - i * 0.05);
        
        osc.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        osc.start(time);
        osc.stop(time + 0.35);
    });
}

// Create a crystalline sound for glass
function playGlassSound(intensity = 0.5) {
    if (!isSoundEnabled || !audioContext) return;
    
    const now = Date.now();
    if (now - lastSoundTime < SOUND_COOLDOWN * 2) return;
    lastSoundTime = now;
    
    const time = audioContext.currentTime;
    
    // High, pure tones
    const frequencies = [2000, 2500, 3000].map(f => f + Math.random() * 200);
    
    frequencies.forEach((freq, i) => {
        const osc = audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        
        const gainNode = audioContext.createGain();
        const vol = (0.03 / (i + 1)) * intensity;
        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(vol, time + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
        
        osc.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        osc.start(time);
        osc.stop(time + 0.45);
    });
}

// Play sound based on current material
function playSculptSound(intensity = 0.5) {
    switch (currentMaterial) {
        case 'jelly':
            playStretchSound(intensity);
            break;
        case 'gold':
        case 'chrome':
            playMetallicSound(intensity);
            break;
        case 'glass':
            playGlassSound(intensity);
            break;
        default:
            playSquishSound(intensity);
    }
}

// Initialize audio on first user interaction
document.addEventListener('click', () => initAudio(), { once: true });
document.addEventListener('touchstart', () => initAudio(), { once: true });

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.backgroundColor);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 3, 8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- Environment Map for Reflections ---
const cubeTextureLoader = new THREE.CubeTextureLoader();
// Create a simple gradient environment map
const envCanvas = document.createElement('canvas');
envCanvas.width = 256;
envCanvas.height = 256;
const envCtx = envCanvas.getContext('2d');
const gradient = envCtx.createLinearGradient(0, 0, 0, 256);
gradient.addColorStop(0, '#87CEEB');  // Sky blue
gradient.addColorStop(0.5, '#F5F5DC'); // Beige
gradient.addColorStop(1, '#D4C4B0');  // Light brown
envCtx.fillStyle = gradient;
envCtx.fillRect(0, 0, 256, 256);
const envTexture = new THREE.CanvasTexture(envCanvas);
envTexture.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = envTexture;

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
scene.add(dirLight);

// Additional rim light for better material visibility
const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
rimLight.position.set(-5, 5, -5);
scene.add(rimLight);

// --- Create Clay Texture for visible rotation ---
const textureCanvas = document.createElement('canvas');
textureCanvas.width = 512;
textureCanvas.height = 512;
const textureCtx = textureCanvas.getContext('2d');

function generateClayTexture(baseColor) {
    // Parse hex color
    const r = (baseColor >> 16) & 255;
    const g = (baseColor >> 8) & 255;
    const b = baseColor & 255;
    
    textureCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    textureCtx.fillRect(0, 0, 512, 512);
    
    // Add noise/grain for visible rotation
    for (let i = 0; i < 30000; i++) {
        const variation = (Math.random() - 0.5) * 40;
        textureCtx.fillStyle = `rgb(${Math.max(0, Math.min(255, r + variation))}, ${Math.max(0, Math.min(255, g + variation))}, ${Math.max(0, Math.min(255, b + variation))})`;
        textureCtx.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    
    // Add some finger-like streaks
    for (let i = 0; i < 20; i++) {
        const streak = textureCtx.createLinearGradient(0, Math.random() * 512, 512, Math.random() * 512);
        streak.addColorStop(0, `rgba(${r - 20}, ${g - 20}, ${b - 20}, 0)`);
        streak.addColorStop(0.5, `rgba(${r - 20}, ${g - 20}, ${b - 20}, 0.3)`);
        streak.addColorStop(1, `rgba(${r - 20}, ${g - 20}, ${b - 20}, 0)`);
        textureCtx.fillStyle = streak;
        textureCtx.fillRect(0, 0, 512, 512);
    }
}

let clayTexture = new THREE.CanvasTexture(textureCanvas);
clayTexture.wrapS = THREE.RepeatWrapping;
clayTexture.wrapT = THREE.RepeatWrapping;

// --- Create Material ---
function createMaterial(preset) {
    const mat = MATERIALS[preset];
    
    // Regenerate texture with material color
    generateClayTexture(mat.color);
    clayTexture = new THREE.CanvasTexture(textureCanvas);
    clayTexture.wrapS = THREE.RepeatWrapping;
    clayTexture.wrapT = THREE.RepeatWrapping;
    
    return new THREE.MeshPhysicalMaterial({
        map: mat.isJelly || preset === 'glass' ? null : clayTexture,
        color: mat.color,
        roughness: mat.roughness,
        metalness: mat.metalness,
        transparent: mat.transparent,
        opacity: mat.opacity,
        envMapIntensity: mat.envMapIntensity,
        clearcoat: preset === 'glass' ? 1.0 : 0,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide
    });
}

// --- Create Geometry ---
function createGeometry(shape) {
    const segments = CONFIG.segmentsRadial;
    const heightSegments = CONFIG.segmentsHeight;
    
    switch (shape) {
        case 'sphere':
            return new THREE.SphereGeometry(CONFIG.clayRadius * 1.2, segments, heightSegments);
        case 'cone':
            return new THREE.ConeGeometry(CONFIG.clayRadius, CONFIG.clayHeight, segments, heightSegments, true);
        case 'cube':
            return new THREE.BoxGeometry(CONFIG.clayRadius * 2, CONFIG.clayHeight, CONFIG.clayRadius * 2, segments / 4, heightSegments, segments / 4);
        case 'torus':
            return new THREE.TorusGeometry(CONFIG.clayRadius, CONFIG.clayRadius * 0.5, heightSegments, segments);
        case 'cylinder':
        default:
            return new THREE.CylinderGeometry(
                CONFIG.clayRadius,
                CONFIG.clayRadius,
                CONFIG.clayHeight,
                segments,
                heightSegments,
                true
            );
    }
}

// --- Clay Mesh ---
let geometry = createGeometry(currentShape);
let material = createMaterial(currentMaterial);
let clayMesh = new THREE.Mesh(geometry, material);
clayMesh.castShadow = true;
clayMesh.receiveShadow = true;
scene.add(clayMesh);

// Store original positions for reset
let originalPositions = null;

function storeOriginalPositions() {
    const positions = clayMesh.geometry.attributes.position.array;
    originalPositions = new Float32Array(positions);
}
storeOriginalPositions();

// --- Jelly Physics State ---
let velocities = null;
let restPositions = null;

function initJellyPhysics() {
    const positions = clayMesh.geometry.attributes.position;
    const count = positions.count;
    velocities = new Float32Array(count * 3);
    restPositions = new Float32Array(positions.array);
}

function updateJellyPhysics(delta) {
    if (!MATERIALS[currentMaterial].isJelly || !velocities) return;
    
    const positions = clayMesh.geometry.attributes.position;
    const count = positions.count;
    
    const stiffness = 15.0;  // Spring stiffness
    const damping = 0.85;    // Velocity damping
    const maxVelocity = 2.0;
    
    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        
        // Calculate spring force towards rest position
        const dx = restPositions[i3] - positions.array[i3];
        const dy = restPositions[i3 + 1] - positions.array[i3 + 1];
        const dz = restPositions[i3 + 2] - positions.array[i3 + 2];
        
        // Apply spring acceleration
        velocities[i3] += dx * stiffness * delta;
        velocities[i3 + 1] += dy * stiffness * delta;
        velocities[i3 + 2] += dz * stiffness * delta;
        
        // Apply damping
        velocities[i3] *= damping;
        velocities[i3 + 1] *= damping;
        velocities[i3 + 2] *= damping;
        
        // Clamp velocity
        velocities[i3] = Math.max(-maxVelocity, Math.min(maxVelocity, velocities[i3]));
        velocities[i3 + 1] = Math.max(-maxVelocity, Math.min(maxVelocity, velocities[i3 + 1]));
        velocities[i3 + 2] = Math.max(-maxVelocity, Math.min(maxVelocity, velocities[i3 + 2]));
        
        // Update position
        positions.array[i3] += velocities[i3] * delta;
        positions.array[i3 + 1] += velocities[i3 + 1] * delta;
        positions.array[i3 + 2] += velocities[i3 + 2] * delta;
    }
    
    positions.needsUpdate = true;
    clayMesh.geometry.computeVertexNormals();
}

// --- History Management ---
function saveToHistory() {
    const positions = clayMesh.geometry.attributes.position.array;
    historyStack.push(new Float32Array(positions));
    if (historyStack.length > MAX_HISTORY) {
        historyStack.shift();
    }
}

function undo() {
    if (historyStack.length === 0) return false;
    
    const previousState = historyStack.pop();
    const positions = clayMesh.geometry.attributes.position;
    positions.array.set(previousState);
    positions.needsUpdate = true;
    clayMesh.geometry.computeVertexNormals();
    
    // Update rest positions for jelly
    if (restPositions) {
        restPositions.set(previousState);
    }
    
    triggerHaptic(10);
    return true;
}

function resetShape() {
    if (!originalPositions) return;
    
    const positions = clayMesh.geometry.attributes.position;
    positions.array.set(originalPositions);
    positions.needsUpdate = true;
    clayMesh.geometry.computeVertexNormals();
    
    // Clear history
    historyStack = [];
    
    // Reset jelly physics
    if (restPositions) {
        restPositions.set(originalPositions);
        velocities.fill(0);
    }
    
    triggerHaptic(50);
}

function changeShape(newShape) {
    if (newShape === currentShape) return;
    
    currentShape = newShape;
    
    // Remove old mesh
    scene.remove(clayMesh);
    clayMesh.geometry.dispose();
    
    // Create new geometry
    geometry = createGeometry(currentShape);
    clayMesh = new THREE.Mesh(geometry, material);
    clayMesh.castShadow = true;
    clayMesh.receiveShadow = true;
    scene.add(clayMesh);
    
    // Reset state
    storeOriginalPositions();
    historyStack = [];
    
    if (MATERIALS[currentMaterial].isJelly) {
        initJellyPhysics();
    }
    
    triggerHaptic(30);
}

function changeMaterial(newMaterial) {
    if (newMaterial === currentMaterial) return;
    
    currentMaterial = newMaterial;
    material.dispose();
    material = createMaterial(currentMaterial);
    clayMesh.material = material;
    
    // Initialize or clean up jelly physics
    if (MATERIALS[currentMaterial].isJelly) {
        initJellyPhysics();
    } else {
        velocities = null;
    }
    
    triggerHaptic(20);
}

// --- Haptic Feedback ---
let lastHapticTime = 0;
const HAPTIC_COOLDOWN = 50; // ms

function triggerHaptic(duration = 10) {
    const now = Date.now();
    if (now - lastHapticTime < HAPTIC_COOLDOWN) return;
    
    if (navigator.vibrate) {
        navigator.vibrate(duration);
        lastHapticTime = now;
    }
}

// --- Invisible Plane for Raycasting ---
const planeGeo = new THREE.PlaneGeometry(20, 20);
const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
const sculptPlane = new THREE.Mesh(planeGeo, planeMat);
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
floor.position.y = -CONFIG.clayHeight / 2 - 0.1;
floor.receiveShadow = true;
scene.add(floor);

// --- Interaction Logic ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isMouseDown = false;
let isSculpting = false;
let sculptStartTime = 0;

window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('mousedown', () => {
    isMouseDown = true;
    sculptStartTime = Date.now();
});

window.addEventListener('mouseup', () => {
    if (isSculpting && Date.now() - sculptStartTime > 100) {
        saveToHistory();
    }
    isMouseDown = false;
    isSculpting = false;
});

// --- Touch Support ---
window.addEventListener('touchstart', (event) => {
    event.preventDefault();
    isMouseDown = true;
    sculptStartTime = Date.now();
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

window.addEventListener('touchend', () => {
    if (isSculpting && Date.now() - sculptStartTime > 100) {
        saveToHistory();
    }
    isMouseDown = false;
    isSculpting = false;
});
window.addEventListener('touchcancel', () => {
    isMouseDown = false;
    isSculpting = false;
});

// Sculpting Function
function sculpt(intersectPoint) {
    const positionAttribute = clayMesh.geometry.attributes.position;
    
    let targetRadius = Math.abs(intersectPoint.x);
    targetRadius = Math.max(CONFIG.minRadius, Math.min(CONFIG.maxRadius, targetRadius));

    const targetY = intersectPoint.y;
    const count = positionAttribute.count;
    let needsUpdate = false;

    for (let i = 0; i < count; i++) {
        const y = positionAttribute.getY(i);
        const dy = Math.abs(y - targetY);
        
        if (dy < CONFIG.sculptRadius) {
            const x = positionAttribute.getX(i);
            const z = positionAttribute.getZ(i);
            const currentRadius = Math.sqrt(x*x + z*z);
            
            const factor = Math.exp(- (dy * dy) / (0.1));
            const speed = CONFIG.sculptStrength; 
            const newRadius = currentRadius + (targetRadius - currentRadius) * factor * speed;
            
            const angle = Math.atan2(z, x);
            positionAttribute.setX(i, Math.cos(angle) * newRadius);
            positionAttribute.setZ(i, Math.sin(angle) * newRadius);
            
            // Update rest position for jelly physics
            if (restPositions) {
                const i3 = i * 3;
                restPositions[i3] = Math.cos(angle) * newRadius;
                restPositions[i3 + 2] = Math.sin(angle) * newRadius;
                
                // Add impulse to jelly
                if (velocities) {
                    const impulse = (targetRadius - currentRadius) * factor * 0.5;
                    velocities[i3] += Math.cos(angle) * impulse;
                    velocities[i3 + 2] += Math.sin(angle) * impulse;
                }
            }
            
            needsUpdate = true;
            isSculpting = true;
        }
    }

    if (needsUpdate) {
        positionAttribute.needsUpdate = true;
        clayMesh.geometry.computeVertexNormals();
        triggerHaptic(5);
        playSculptSound(0.5 + Math.random() * 0.3);
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
            width: 280px;
            max-height: 70vh;
            overflow-y: auto;
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
        
        .button-group {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        
        .preset-button {
            flex: 1;
            min-width: 70px;
            padding: 10px 8px;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            background: white;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            color: #666;
            transition: all 0.2s ease;
            text-align: center;
        }
        
        .preset-button:hover {
            border-color: #E07A5F;
            color: #E07A5F;
        }
        
        .preset-button.active {
            background: #E07A5F;
            border-color: #E07A5F;
            color: white;
        }
        
        .material-button {
            position: relative;
            overflow: hidden;
        }
        
        .material-button::before {
            content: '';
            position: absolute;
            top: 4px;
            left: 50%;
            transform: translateX(-50%);
            width: 20px;
            height: 20px;
            border-radius: 50%;
        }
        
        .material-button[data-material="clay"]::before { background: #B5651D; }
        .material-button[data-material="gold"]::before { background: linear-gradient(135deg, #FFD700, #FFA500); }
        .material-button[data-material="glass"]::before { background: linear-gradient(135deg, #88CCFF, #AADDFF); opacity: 0.6; }
        .material-button[data-material="chrome"]::before { background: linear-gradient(135deg, #FFFFFF, #888888); }
        .material-button[data-material="jelly"]::before { background: linear-gradient(135deg, #FF6B9D, #FF8FB1); }
        
        .material-button span {
            position: relative;
            display: block;
            margin-top: 24px;
        }
        
        .action-button {
            width: 100%;
            padding: 12px 16px;
            margin-top: 8px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.2s ease;
        }
        
        .action-button svg {
            width: 16px;
            height: 16px;
        }
        
        .action-button.undo {
            background: #f0f0f0;
            color: #666;
        }
        
        .action-button.undo:hover {
            background: #e0e0e0;
        }
        
        .action-button.reset {
            background: #fee2e2;
            color: #dc2626;
        }
        
        .action-button.reset:hover {
            background: #fecaca;
        }
        
        .action-button.share {
            background: linear-gradient(135deg, #E07A5F 0%, #c96b52 100%);
            color: white;
            box-shadow: 0 4px 12px rgba(224, 122, 95, 0.3);
        }
        
        .action-button.share:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(224, 122, 95, 0.4);
        }
        
        .action-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
        }
        
        .divider {
            height: 1px;
            background: #e0e0e0;
            margin: 16px 0;
        }
        
        .action-button.sound {
            background: #e8f5e9;
            color: #2e7d32;
        }
        
        .action-button.sound:hover {
            background: #c8e6c9;
        }
        
        .action-button.sound.muted {
            background: #f0f0f0;
            color: #999;
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
            <label class="setting-label">Shape</label>
            <div class="button-group">
                <button class="preset-button active" data-shape="cylinder">Cylinder</button>
                <button class="preset-button" data-shape="sphere">Sphere</button>
                <button class="preset-button" data-shape="cone">Cone</button>
                <button class="preset-button" data-shape="cube">Cube</button>
                <button class="preset-button" data-shape="torus">Torus</button>
            </div>
        </div>
        
        <div class="divider"></div>
        
        <div class="setting-group">
            <label class="setting-label">Material</label>
            <div class="button-group">
                <button class="preset-button material-button active" data-material="clay"><span>Clay</span></button>
                <button class="preset-button material-button" data-material="gold"><span>Gold</span></button>
                <button class="preset-button material-button" data-material="glass"><span>Glass</span></button>
                <button class="preset-button material-button" data-material="chrome"><span>Chrome</span></button>
                <button class="preset-button material-button" data-material="jelly"><span>Jelly</span></button>
            </div>
        </div>
        
        <div class="divider"></div>
        
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
        
        <div class="divider"></div>
        
        <button class="action-button sound muted" id="sound-button">
            <svg viewBox="0 0 24 24" fill="currentColor" id="sound-icon"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
            Sound Off
        </button>
        
        <button class="action-button undo" id="undo-button">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
            Undo
        </button>
        
        <button class="action-button reset" id="reset-button">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
            Reset Shape
        </button>
        
        <button class="action-button share" id="share-button">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>
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

// Shape buttons
document.querySelectorAll('[data-shape]').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('[data-shape]').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        changeShape(button.dataset.shape);
    });
});

// Material buttons
document.querySelectorAll('[data-material]').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('[data-material]').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        changeMaterial(button.dataset.material);
    });
});

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

// Sound toggle button
document.getElementById('sound-button').addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;
    const soundButton = document.getElementById('sound-button');
    
    if (isSoundEnabled) {
        soundButton.classList.remove('muted');
        soundButton.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            Sound On
        `;
    } else {
        soundButton.classList.add('muted');
        soundButton.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
            Sound Off
        `;
    }
    
    // Initialize audio context if not already done
    if (isSoundEnabled) {
        initAudio();
    }
});

// Undo button
document.getElementById('undo-button').addEventListener('click', () => {
    undo();
});

// Reset button
document.getElementById('reset-button').addEventListener('click', () => {
    resetShape();
});

// Share button
document.getElementById('share-button').addEventListener('click', async () => {
    const shareButton = document.getElementById('share-button');
    shareButton.disabled = true;
    shareButton.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" style="animation: spin 1s linear infinite;">
            <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
        </svg>
        Capturing...
    `;
    
    try {
        cursorMesh.visible = false;
        settingsContainer.style.visibility = 'hidden';
        renderer.render(scene, camera);
        
        const canvas = renderer.domElement;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const file = new File([blob], 'my-sculpture.png', { type: 'image/png' });
        
        settingsContainer.style.visibility = 'visible';
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'My Sculpture',
                text: 'Check out my sculpture! 🎨'
            });
        } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'my-sculpture.png';
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
        shareButton.disabled = false;
        shareButton.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>
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

    // 2. Update jelly physics
    updateJellyPhysics(delta);

    // 3. Mouse sculpting
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
