/**
 * Aviary Escape Room - Main JavaScript
 * 
 * Manages interactive logic, audio controls, and UI interactions
 * 
 * Features:
 * - Background music with user-initiated start (respects autoplay restrictions)
 * - Music mute/unmute toggle
 * - Puzzle logic and interactions (to be added)
 * - State management
 * - Layout Manager for positioning 3D models
 */

let bgmEntity = null;
let isMuted = false;
let hasStarted = false; // Track if experience has been started
let hasKey = false; // Track if player has the key
let isPadlockUnlocked = false; // Track if padlock is solved
let currentCode = [0, 0, 0]; // Current values of the 3 digits
const CORRECT_CODE = [4, 9, 7]; // The solution code

const AUTO_START_DELAY = 20000; // 20 seconds

// --- Layout Manager ---
const LayoutManager = {
  gui: null,
  items: {},

  init: function () {
    console.log('Initializing Layout Manager...');
    this.gui = new lil.GUI({ title: 'Layout Manager' });
    this.gui.close(); // Start closed
    this.gui.hide(); // Hide completely by default (User request)

    // Add a button to print all configurations
    const config = {
      printConfig: () => this.printAllConfigs()
    };
    this.gui.add(config, 'printConfig').name('Print All Configs');
  },

  registerItem: function (el, name) {
    if (!this.gui) return;

    const folder = this.gui.addFolder(name);
    const obj = {
      posX: el.object3D.position.x,
      posY: el.object3D.position.y,
      posZ: el.object3D.position.z,
      rotX: THREE.MathUtils.radToDeg(el.object3D.rotation.x),
      rotY: THREE.MathUtils.radToDeg(el.object3D.rotation.y),
      rotZ: THREE.MathUtils.radToDeg(el.object3D.rotation.z),
      scaleX: el.object3D.scale.x,
      scaleY: el.object3D.scale.y,
      scaleZ: el.object3D.scale.z,
      visible: el.getAttribute('visible')
    };

    // Position
    folder.add(obj, 'posX').onChange(v => el.object3D.position.x = v).name('Pos X').step(0.01);
    folder.add(obj, 'posY').onChange(v => el.object3D.position.y = v).name('Pos Y').step(0.01);
    folder.add(obj, 'posZ').onChange(v => el.object3D.position.z = v).name('Pos Z').step(0.01);

    // Rotation
    folder.add(obj, 'rotX').onChange(v => el.object3D.rotation.x = THREE.MathUtils.degToRad(v)).name('Rot X').step(1);
    folder.add(obj, 'rotY').onChange(v => el.object3D.rotation.y = THREE.MathUtils.degToRad(v)).name('Rot Y').step(1);
    folder.add(obj, 'rotZ').onChange(v => el.object3D.rotation.z = THREE.MathUtils.degToRad(v)).name('Rot Z').step(1);

    // Scale
    folder.add(obj, 'scaleX').onChange(v => {
      el.object3D.scale.x = v;
    }).name('Scale X').step(0.001);
    folder.add(obj, 'scaleY').onChange(v => el.object3D.scale.y = v).name('Scale Y').step(0.001);
    folder.add(obj, 'scaleZ').onChange(v => el.object3D.scale.z = v).name('Scale Z').step(0.001);

    // Visibility
    folder.add(obj, 'visible').onChange(v => el.setAttribute('visible', v)).name('Visible');

    this.items[name] = { el, obj };
  },

  printAllConfigs: function () {
    console.log('--- Current Layout Configuration ---');
    const configs = {};
    for (const [name, item] of Object.entries(this.items)) {
      const el = item.el;
      const p = el.object3D.position;
      const r = el.object3D.rotation;
      const s = el.object3D.scale;

      configs[name] = {
        position: `${p.x.toFixed(3)} ${p.y.toFixed(3)} ${p.z.toFixed(3)}`,
        rotation: `${THREE.MathUtils.radToDeg(r.x).toFixed(1)} ${THREE.MathUtils.radToDeg(r.y).toFixed(1)} ${THREE.MathUtils.radToDeg(r.z).toFixed(1)}`,
        scale: `${s.x.toFixed(4)} ${s.y.toFixed(4)} ${s.z.toFixed(4)}`
      };

      console.log(`${name}:`);
      console.log(`  position="${configs[name].position}"`);
      console.log(`  rotation="${configs[name].rotation}"`);
      console.log(`  scale="${configs[name].scale}"`);
    }
    console.log(JSON.stringify(configs, null, 2));
    alert('Configuration printed to console! (Press F12 to view)');
  }
};

// Register layout-item component
AFRAME.registerComponent('layout-item', {
  schema: {
    name: { type: 'string', default: 'Item' }
  },
  init: function () {
    // Wait for LayoutManager to be ready
    if (LayoutManager.gui) {
      LayoutManager.registerItem(this.el, this.data.name);
    } else {
      // Retry if initialized before LayoutManager
      setTimeout(() => {
        if (LayoutManager.gui) LayoutManager.registerItem(this.el, this.data.name);
      }, 100);
    }
  }
});

// Wait for the A-Frame scene to fully load before adding any interactions
document.addEventListener('DOMContentLoaded', function () {
  console.log('DOM loaded, waiting for A-Frame scene...');

  const scene = document.querySelector('a-scene');

  if (scene.hasLoaded) {
    init();
  } else {
    scene.addEventListener('loaded', init);
  }

  // Auto-hide instruction overlay after 20 seconds
  setTimeout(function () {
    if (!hasStarted) {
      console.log('Auto-starting experience after 20 seconds...');
      startExperience();
    }
  }, AUTO_START_DELAY);
});

function init() {
  console.log('✓ Aviary scene loaded successfully');

  // Initialize Layout Manager
  LayoutManager.init();

  // Check if panorama image loaded correctly
  const aviaryImg = document.querySelector('#aviaryPanorama');
  if (aviaryImg) {
    if (aviaryImg.complete && aviaryImg.naturalHeight !== 0) {
      console.log('✓ Panorama image loaded:', aviaryImg.src);
      console.log('  Image dimensions:', aviaryImg.naturalWidth + 'x' + aviaryImg.naturalHeight);
    } else {
      console.error('✗ Panorama image failed to load. Check that the file exists at:', aviaryImg.src);
      console.error('  Expected location: img/panorama-aviary-2.jpg');
    }
  }

  // Initialize audio controls and UI
  initAudioControls();

  // Initialize Game Logic
  setupGameLogic();
}

/**
 * Setup Game Logic
 * Handles key collection, padlock interaction, and door interaction
 */
function setupGameLogic() {
  const keyEntity = document.querySelector('#key-entity');
  const doorCollider = document.querySelector('#door-collider');
  const keySlot = document.querySelector('#keySlot');
  const winOverlay = document.querySelector('#winOverlay');
  const padlockEntity = document.querySelector('#padlock');

  // New Entities
  const cageClosed = document.querySelector('#cage-closed');
  const cageOpen = document.querySelector('#cage-open');
  const birdRig = document.querySelector('#bird-rig');

  // Audio
  const sfxCage = document.querySelector('#sfx-cage-open');
  const sfxBirds = document.querySelector('#sfx-birds');
  const sfxKey = document.querySelector('#sfx-key');

  // Padlock Digits
  const digits = [
    document.querySelector('#digit1'),
    document.querySelector('#digit2'),
    document.querySelector('#digit3')
  ];

  // Key Interaction
  if (keyEntity) {
    keyEntity.addEventListener('click', function () {
      console.log('Key clicked!');

      // Play Sound
      if (sfxKey) sfxKey.play();

      // 1. Hide the 3D key
      keyEntity.setAttribute('visible', false);
      // Remove class to prevent further clicks
      keyEntity.classList.remove('clickable');
      // Also hide the collider child if it exists
      const collider = keyEntity.querySelector('.clickable');
      if (collider) collider.classList.remove('clickable');

      // 2. Update state
      hasKey = true;

      // 3. Show in inventory
      if (keySlot) {
        keySlot.classList.remove('hidden');
        // Add a little pop animation
        keySlot.style.transform = 'scale(1.2)';
        setTimeout(() => keySlot.style.transform = 'scale(1)', 200);
      }

      // 4. Make Door Glow
      if (doorCollider) {
        // Add emissive color to indicate it's unlocked
        // Since it's transparent, we might need to increase opacity slightly or just change color
        doorCollider.setAttribute('material', 'color', '#fff3c2');
        doorCollider.setAttribute('material', 'opacity', '0.6');
        console.log('Door is now glowing!');
      }

      console.log('✓ Key collected');
    });
  } else {
    console.error('✗ Key entity not found');
  }

  // Padlock Interaction
  digits.forEach((digit, index) => {
    if (digit) {
      digit.addEventListener('click', function () {
        if (isPadlockUnlocked) return; // Disable if already unlocked

        // Increment digit
        currentCode[index] = (currentCode[index] + 1) % 10;

        // Update text
        digit.setAttribute('value', currentCode[index]);

        // Check code
        checkPadlock();
      });
    }
  });

  function checkPadlock() {
    const isCorrect = currentCode.every((val, idx) => val === CORRECT_CODE[idx]);

    if (isCorrect) {
      console.log('✓ Padlock Unlocked!');
      isPadlockUnlocked = true;

      // Play Cage Sound
      if (sfxCage) sfxCage.play();

      // Visual feedback on digits
      digits.forEach(d => d.setAttribute('color', '#4CAF50')); // Green

      // Sequence:
      // 1. Hide Padlock (after delay?) -> User said "padlock opens... cage opens"
      // Let's hide padlock immediately or after short delay
      setTimeout(() => {
        if (padlockEntity) padlockEntity.setAttribute('visible', false);

        // 2. Swap Cages
        if (cageClosed) cageClosed.setAttribute('visible', false);
        if (cageOpen) cageOpen.setAttribute('visible', true);

        // 3. Show Bird and Start Flying
        if (birdRig) {
          birdRig.setAttribute('visible', true);
          // Play Bird Sound
          if (sfxBirds) sfxBirds.play();
        }

      }, 500); // 0.5s delay for effect
    }
  }

  // Door Interaction
  if (doorCollider) {
    doorCollider.addEventListener('click', function () {
      console.log('Door clicked!');

      // Check if key is collected (Padlock is implied because key comes from bird which comes from padlock)
      if (hasKey) {
        // WIN STATE
        console.log('✓ Door unlocked! You win!');

        // Show win overlay
        if (winOverlay) {
          winOverlay.classList.remove('hidden');
        }

        // Stop music
        if (bgmEntity && bgmEntity.components.sound) {
          bgmEntity.components.sound.stopSound();
        }

      } else {
        // LOCKED STATE
        let message = "The door is locked.";
        if (!isPadlockUnlocked) {
          message += " You need to open the cage first.";
        } else if (!hasKey) {
          message += " You need the key from the bird.";
        }

        console.log('✗ ' + message);
        alert(message);
      }
    });
  } else {
    console.error('✗ Door collider not found');
  }
}

/**
 * Start the experience
 * Reusable function that:
 * - Starts background music
 * - Hides instruction overlay
 * - Shows music toggle
 * - Marks experience as started
 */
function startExperience() {
  if (hasStarted) {
    console.log('Experience already started, skipping...');
    return;
  }

  console.log('Starting experience...');
  hasStarted = true;

  const startOverlay = document.querySelector('#startOverlay');
  const musicToggle = document.querySelector('#musicToggle');

  // Start background music if available
  if (bgmEntity && bgmEntity.components && bgmEntity.components.sound) {
    try {
      bgmEntity.components.sound.playSound();
      console.log('✓ Background music started');
    } catch (error) {
      console.error('✗ Error starting background music:', error);
    }
  }

  // Hide the instruction overlay
  if (startOverlay) {
    startOverlay.classList.add('hidden');
  }

  // Show the music toggle
  if (musicToggle) {
    musicToggle.style.display = 'block';
  }

  console.log('✓ Experience started successfully');
}

/**
 * Initialize audio controls and UI interactions
 * Sets up the Start button and Music toggle functionality
 */
function initAudioControls() {
  // Get UI elements
  const startButton = document.querySelector('#startButton');
  const musicToggle = document.querySelector('#musicToggle');

  // Get A-Frame background music entity
  bgmEntity = document.querySelector('#bgmEntity');

  if (!bgmEntity) {
    console.error('✗ Background music entity (#bgmEntity) not found in scene');
    return;
  }

  // Verify sound component exists
  if (!bgmEntity.components || !bgmEntity.components.sound) {
    console.error('✗ Sound component not found on bgmEntity. Make sure the sound component is properly attached.');
    return;
  }

  console.log('✓ Audio controls initialized');

  // Start Experience button handler
  // Calls the reusable startExperience() function
  if (startButton) {
    startButton.addEventListener('click', function () {
      startExperience();
    });
  } else {
    console.warn('⚠ Start button not found');
  }

  // Music toggle handler
  // Allows users to mute/unmute the background music
  // Uses the sound component's volume property (0 = muted, 0.3 = normal)
  if (musicToggle) {
    musicToggle.addEventListener('click', function () {
      if (!bgmEntity || !bgmEntity.components.sound) {
        console.error('✗ Cannot toggle music: sound component not available');
        return;
      }

      try {
        // Toggle mute state
        isMuted = !isMuted;

        if (isMuted) {
          // Mute: set volume to 0
          bgmEntity.setAttribute('sound', 'volume', 0);
          musicToggle.textContent = '🎵 Off';
          console.log('✓ Background music muted');
        } else {
          // Unmute: restore volume to 0.3
          bgmEntity.setAttribute('sound', 'volume', 0.3);
          musicToggle.textContent = '🎵 On';
          console.log('✓ Background music unmuted');
        }
      } catch (error) {
        console.error('✗ Error toggling music:', error);
      }
    });
  }
}
