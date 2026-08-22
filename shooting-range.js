"use strict";

/*
    SHOOTING RANGE — 3D-version (Three.js / WebGL)
    ================================================

    Detta är en ombyggnad av 2D-canvas-versionen till riktig 3D:

    - En riktig 3D-bana (golv, väggar, tak, lampor) med kamera som
      står still längst fram, ungefär som att stå vid en skjutbås.
    - Pappersmålen är riktiga 3D-plan i rummet på VARIERANDE DJUP
      (inte bara x/y som i 2D-versionen) — mål längre bort ser
      naturligt mindre ut genom kamerans perspektiv.
    - Träffdetektion sker med riktig 3D-raycasting (en stråle skjuts
      från kameran genom siktpunkten och testas mot målen i rummet),
      istället för en 2D-avståndsberäkning.
    - Vapnet är en egen 3D-modell som hänger i kamerans "hand":
        * Det svänger mjukt efter var du siktar (med en liten
          eftersläpning/lag, inte direkt hopp) — "aim sway".
        * Det har en egen liten andningsrörelse i vila (idle bob).
        * Vid skott: sliden rör sig separat bakåt (blowback-känsla)
          och hela vapnet knycker till och fjädrar tillbaka.
        * Mynningsflamma är ett riktigt ljus + en glödande sprite
          i 3D-rummet, inte bara en cirkel ritad på en 2D-yta.
    - Three.js laddas från cdnjs vid körning (kräver internet).
      Om det inte går att ladda visas ett felmeddelande i menyn
      istället för att scriptet kraschar.

    Samma grundstruktur som tidigare version behålls för allt som
    INTE har med 3D att göra: mount/cleanup-mönster, scopead CSS
    (ingen global läckage om flera Kanvas-rutor delar DOM), HUD,
    ljudmotor (brus + oscillatorer via Web Audio), oändlig ammo,
    och det kosmetiska omladdningsklicket.
*/

(function () {

    /* ---------- MOUNT-PUNKT ---------- */

    const scriptEl = document.currentScript;

    const mount =
        (scriptEl && scriptEl.parentElement) ||
        document.body;

    const uid = "sr" + Math.random().toString(36).slice(2, 9);
    const rootClass = "sr-app-" + uid;

    if (mount.__shootingRangeCleanup) {
        try {
            mount.__shootingRangeCleanup();
        } catch (error) {
        }
    }


    /* ---------- STYLE ---------- */

    const style = document.createElement("style");
    style.setAttribute("data-sr-instance", uid);

    style.textContent = `
.${rootClass}, .${rootClass} * {
    box-sizing: border-box;
}

.${rootClass} {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 320px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: Arial, sans-serif;
    background: #05070a;
    outline: none;
}

.${rootClass} .sr-game {
    position: relative;
    width: 100%;
    max-width: 1100px;
    aspect-ratio: 1100 / 700;
    overflow: hidden;
    border: 1px solid #303438;
    border-radius: 8px;
    box-shadow: 0 25px 80px rgba(0,0,0,.75);
    background: #05070a;
}

.${rootClass} .sr-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: none;
    display: block;
}

.${rootClass} .sr-hud {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 65px;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    background: linear-gradient(
        rgba(5,7,8,.95),
        rgba(5,7,8,.72)
    );
    border-bottom: 1px solid rgba(255,255,255,.08);
    pointer-events: none;
}

.${rootClass} .sr-hudLeft,
.${rootClass} .sr-hudRight {
    display: flex;
    align-items: center;
    gap: 25px;
}

.${rootClass} .sr-title {
    font-weight: bold;
    letter-spacing: 3px;
    font-size: 16px;
    color: #ddd;
}

.${rootClass} .sr-title small {
    display: block;
    color: #6e767b;
    font-size: 8px;
    letter-spacing: 2px;
    margin-top: 3px;
}

.${rootClass} .sr-stat span {
    display: block;
    color: #6f777b;
    font-size: 8px;
    text-transform: uppercase;
}

.${rootClass} .sr-stat strong {
    font-size: 19px;
    color: #ddd;
}

.${rootClass} .sr-score { color: #d2e0c1 !important; }
.${rootClass} .sr-combo { color: #d9b865 !important; }

.${rootClass} .sr-ammo {
    font-size: 24px;
    font-weight: bold;
    color: #ddd;
}

.${rootClass} .sr-crosshair {
    position: absolute;
    width: 24px;
    height: 24px;
    z-index: 30;
    transform: translate(-50%, -50%);
    pointer-events: none;
}

.${rootClass} .sr-crosshair:before {
    content: "";
    position: absolute;
    width: 1px;
    height: 24px;
    left: 12px;
    background: rgba(255,255,255,.7);
}

.${rootClass} .sr-crosshair:after {
    content: "";
    position: absolute;
    width: 24px;
    height: 1px;
    top: 12px;
    background: rgba(255,255,255,.7);
}

.${rootClass} .sr-crosshairDot {
    position: absolute;
    width: 4px;
    height: 4px;
    left: 10px;
    top: 10px;
    border-radius: 50%;
    background: #d5e6bf;
}

.${rootClass} .sr-message {
    position: absolute;
    left: 50%;
    top: 48%;
    transform: translate(-50%, -50%);
    z-index: 20;
    text-align: center;
    pointer-events: none;
    opacity: 0;
}

.${rootClass} .sr-messageMain {
    font-size: 34px;
    font-weight: bold;
    letter-spacing: 2px;
}

.${rootClass} .sr-messageSub {
    margin-top: 5px;
    font-size: 11px;
    color: #999;
}

.${rootClass} .sr-floattext {
    position: absolute;
    z-index: 25;
    transform: translate(-50%, -50%);
    font-weight: bold;
    font-size: 20px;
    pointer-events: none;
    text-shadow: 0 2px 6px rgba(0,0,0,.6);
    white-space: nowrap;
}

.${rootClass} .sr-menu {
    position: absolute;
    inset: 0;
    z-index: 100;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(3,5,6,.72);
}

.${rootClass} .sr-card {
    width: 410px;
    max-width: 88%;
    padding: 32px;
    background: #0d1012;
    border: 1px solid #303538;
    border-radius: 8px;
    text-align: center;
    box-shadow: 0 25px 70px rgba(0,0,0,.8);
}

.${rootClass} .sr-card h1 {
    margin: 0;
    color: #ddd;
    font-size: 37px;
    letter-spacing: 4px;
}

.${rootClass} .sr-card h1 span { color: #a9ba91; }

.${rootClass} .sr-card p {
    color: #858d91;
    font-size: 13px;
    line-height: 1.6;
    margin: 15px 0 25px;
}

.${rootClass} .sr-btn {
    width: 100%;
    padding: 13px;
    border: 1px solid #6c775f;
    border-radius: 5px;
    background: linear-gradient(#68745d, #4d5847);
    color: white;
    font-weight: bold;
    letter-spacing: 1px;
    cursor: pointer;
}

.${rootClass} .sr-btn:hover { filter: brightness(1.15); }

.${rootClass} .sr-btn:disabled {
    opacity: .5;
    cursor: default;
    filter: none;
}

.${rootClass} .sr-close {
    position: absolute;
    top: 10px;
    right: 12px;
    z-index: 50;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid rgba(255,255,255,.15);
    border-radius: 5px;
    background: rgba(0,0,0,.35);
    color: #aaa;
    font-size: 25px;
    line-height: 30px;
    font-weight: normal;
    cursor: pointer;
}

.${rootClass} .sr-close:hover { background: #7b302b; color: #fff; }

.${rootClass} .sr-controls {
    position: absolute;
    right: 18px;
    bottom: 15px;
    z-index: 10;
    color: #727a7e;
    font-size: 10px;
    line-height: 1.8;
    pointer-events: none;
}

.${rootClass} .sr-hidden { display: none !important; }

@media (max-width: 800px) {
    .${rootClass} .sr-stat { display: none; }
    .${rootClass} .sr-controls { display: none; }
}
`;

    document.head.appendChild(style);


    /* ---------- DOM-STRUKTUR ---------- */

    const app = document.createElement("div");
    app.className = rootClass;
    app.tabIndex = 0;
    mount.appendChild(app);

    const game = document.createElement("div");
    game.className = "sr-game";
    app.appendChild(game);

    const hud = document.createElement("div");
    hud.className = "sr-hud";

    hud.innerHTML = `
<div class="sr-hudLeft">
    <div class="sr-title">
        SHOOTING RANGE
        <small>3D TRAINING FACILITY</small>
    </div>
    <div class="sr-stat">
        <span>Poäng</span>
        <strong class="sr-score" data-role="score">0</strong>
    </div>
    <div class="sr-stat">
        <span>Träffar</span>
        <strong data-role="hits">0</strong>
    </div>
    <div class="sr-stat">
        <span>Precision</span>
        <strong data-role="accuracy">100%</strong>
    </div>
    <div class="sr-stat">
        <span>Combo</span>
        <strong class="sr-combo" data-role="combo">x1</strong>
    </div>
</div>
<div class="sr-hudRight">
    <div class="sr-stat">
        <span>Tid</span>
        <strong data-role="time">60</strong>
    </div>
    <div class="sr-ammo">
        <span data-role="ammo">∞</span>
    </div>
</div>
`;

    game.appendChild(hud);

    const crosshair = document.createElement("div");
    crosshair.className = "sr-crosshair";
    crosshair.innerHTML = `<div class="sr-crosshairDot"></div>`;
    game.appendChild(crosshair);

    const message = document.createElement("div");
    message.className = "sr-message";
    message.innerHTML = `
<div class="sr-messageMain" data-role="messageMain"></div>
<div class="sr-messageSub" data-role="messageSub"></div>
`;
    game.appendChild(message);

    const floatLayer = document.createElement("div");
    floatLayer.style.position = "absolute";
    floatLayer.style.inset = "0";
    floatLayer.style.zIndex = "25";
    floatLayer.style.pointerEvents = "none";
    game.appendChild(floatLayer);

    const controls = document.createElement("div");
    controls.className = "sr-controls";
    controls.innerHTML = `
MUS = SIKTA / SKJUT<br>
R = LADDA OM<br>
SPACE = NYTT MÅL
`;
    game.appendChild(controls);

    const menu = document.createElement("div");
    menu.className = "sr-menu";
    menu.innerHTML = `
<div class="sr-card">
    <h1>SHOOTING <span>RANGE</span></h1>
    <p data-role="menuText">
        Laddar 3D-motor …
    </p>
    <button class="sr-btn" data-role="start" disabled>
        STARTA
    </button>
</div>
`;
    game.appendChild(menu);

    const closeButton = document.createElement("button");
    closeButton.className = "sr-close";
    closeButton.textContent = "×";
    closeButton.addEventListener("click", function () {
        cleanup();
    });
    game.appendChild(closeButton);


    /* ---------- ELEMENT-REFERENSER ---------- */

    const startButton = menu.querySelector('[data-role="start"]');
    const menuText = menu.querySelector('[data-role="menuText"]');

    const scoreElement = hud.querySelector('[data-role="score"]');
    const hitsElement = hud.querySelector('[data-role="hits"]');
    const accuracyElement = hud.querySelector('[data-role="accuracy"]');
    const comboElement = hud.querySelector('[data-role="combo"]');
    const timeElement = hud.querySelector('[data-role="time"]');

    const messageMain = message.querySelector('[data-role="messageMain"]');
    const messageSub = message.querySelector('[data-role="messageSub"]');


    /* ---------- SPELVARIABLER ---------- */

    let running = false;
    let destroyed = false;
    let threeReady = false;

    let score = 0;
    let hits = 0;
    let shots = 0;
    let combo = 0;
    let bestCombo = 0;

    let timeLeft = 60;

    let spawnTimer = 0;
    let reloadCooldown = 0;
    let reloadDip = 0;

    let lastFrame = 0;
    let rafId = null;

    let messageTimer = null;

    // Musposition i "normaliserade enhetskoordinater" (-1..1),
    // det format Three.js raycaster vill ha för sikte.
    const mouseNDC = { x: 0, y: 0 };

    let targets = [];
    let shells = [];
    let floatingTexts = [];


    /* ---------- AUDIO (oförändrad ljudmotor) ---------- */

    let audioContext;
    let noiseBuffer = null;

    function getAudioContext() {
        if (!audioContext) {
            audioContext =
                new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioContext;
    }

    function getNoiseBuffer(ctxA) {
        if (noiseBuffer) return noiseBuffer;
        const length = ctxA.sampleRate * 0.5;
        const buffer = ctxA.createBuffer(1, length, ctxA.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        noiseBuffer = buffer;
        return noiseBuffer;
    }

    function playGunshot() {
        try {
            const ctxA = getAudioContext();
            const now = ctxA.currentTime;

            const crackSource = ctxA.createBufferSource();
            crackSource.buffer = getNoiseBuffer(ctxA);
            const crackFilter = ctxA.createBiquadFilter();
            crackFilter.type = "bandpass";
            crackFilter.frequency.value = 1800;
            crackFilter.Q.value = 0.6;
            const crackGain = ctxA.createGain();
            crackGain.gain.setValueAtTime(.5, now);
            crackGain.gain.exponentialRampToValueAtTime(.001, now + .09);
            crackSource.connect(crackFilter);
            crackFilter.connect(crackGain);
            crackGain.connect(ctxA.destination);
            crackSource.start(now);
            crackSource.stop(now + .1);

            const snapFilter = ctxA.createBiquadFilter();
            snapFilter.type = "highpass";
            snapFilter.frequency.value = 3500;
            const snapGain = ctxA.createGain();
            snapGain.gain.setValueAtTime(.35, now);
            snapGain.gain.exponentialRampToValueAtTime(.001, now + .035);
            const snapSource = ctxA.createBufferSource();
            snapSource.buffer = getNoiseBuffer(ctxA);
            snapSource.connect(snapFilter);
            snapFilter.connect(snapGain);
            snapGain.connect(ctxA.destination);
            snapSource.start(now);
            snapSource.stop(now + .04);

            const kick = ctxA.createOscillator();
            kick.type = "sine";
            kick.frequency.setValueAtTime(150, now);
            kick.frequency.exponentialRampToValueAtTime(45, now + .08);
            const kickGain = ctxA.createGain();
            kickGain.gain.setValueAtTime(.6, now);
            kickGain.gain.exponentialRampToValueAtTime(.001, now + .12);
            kick.connect(kickGain);
            kickGain.connect(ctxA.destination);
            kick.start(now);
            kick.stop(now + .13);

            const tailSource = ctxA.createBufferSource();
            tailSource.buffer = getNoiseBuffer(ctxA);
            const tailFilter = ctxA.createBiquadFilter();
            tailFilter.type = "lowpass";
            tailFilter.frequency.value = 900;
            const tailGain = ctxA.createGain();
            tailGain.gain.setValueAtTime(.08, now + .03);
            tailGain.gain.exponentialRampToValueAtTime(.001, now + .3);
            tailSource.connect(tailFilter);
            tailFilter.connect(tailGain);
            tailGain.connect(ctxA.destination);
            tailSource.start(now + .03);
            tailSource.stop(now + .32);

        } catch (error) {
        }
    }

    function playHit() {
        try {
            const ctxA = getAudioContext();
            const now = ctxA.currentTime;
            const freqs = [1400, 1660];

            for (const f of freqs) {
                const osc = ctxA.createOscillator();
                osc.type = "triangle";
                osc.frequency.setValueAtTime(f, now);
                osc.frequency.exponentialRampToValueAtTime(f * 0.85, now + .18);
                const gain = ctxA.createGain();
                gain.gain.setValueAtTime(.05, now);
                gain.gain.exponentialRampToValueAtTime(.001, now + .2);
                osc.connect(gain);
                gain.connect(ctxA.destination);
                osc.start(now);
                osc.stop(now + .22);
            }

            const noise = ctxA.createBufferSource();
            noise.buffer = getNoiseBuffer(ctxA);
            const noiseFilter = ctxA.createBiquadFilter();
            noiseFilter.type = "highpass";
            noiseFilter.frequency.value = 4000;
            const noiseGain = ctxA.createGain();
            noiseGain.gain.setValueAtTime(.06, now);
            noiseGain.gain.exponentialRampToValueAtTime(.001, now + .03);
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(ctxA.destination);
            noise.start(now);
            noise.stop(now + .04);

        } catch (error) {
        }
    }

    function playMechClick() {
        try {
            const ctxA = getAudioContext();
            const now = ctxA.currentTime;
            const clicks = [0, .09];

            for (const delay of clicks) {
                const clickSource = ctxA.createBufferSource();
                clickSource.buffer = getNoiseBuffer(ctxA);
                const clickFilter = ctxA.createBiquadFilter();
                clickFilter.type = "bandpass";
                clickFilter.frequency.value = 2600;
                clickFilter.Q.value = 1.2;
                const clickGain = ctxA.createGain();
                clickGain.gain.setValueAtTime(.4, now + delay);
                clickGain.gain.exponentialRampToValueAtTime(.001, now + delay + .025);
                clickSource.connect(clickFilter);
                clickFilter.connect(clickGain);
                clickGain.connect(ctxA.destination);
                clickSource.start(now + delay);
                clickSource.stop(now + delay + .03);
            }
        } catch (error) {
        }
    }


    /* ---------- MESSAGE / HUD ---------- */

    function setMessage(main, sub, color) {
        messageMain.textContent = main;
        messageSub.textContent = sub;
        messageMain.style.color = color;
        message.style.opacity = "1";
        clearTimeout(messageTimer);
        messageTimer = setTimeout(function () {
            message.style.opacity = "0";
        }, 600);
    }

    function updateHUD() {
        scoreElement.textContent = score.toLocaleString("sv-SE");
        hitsElement.textContent = hits;
        const accuracy = shots === 0 ? 100 : Math.round(hits / shots * 100);
        accuracyElement.textContent = accuracy + "%";
        comboElement.textContent = "x" + Math.max(1, combo);
        timeElement.textContent = Math.max(0, timeLeft).toFixed(1);
    }


    /* =========================================================
       ALLT NEDANFÖR KRÄVER THREE.JS — laddas asynkront
       ========================================================= */

    let THREE = null;

    let renderer = null;
    let scene = null;
    let camera = null;
    let cameraBaseEuler = null;
    let raycaster = null;

    let weaponGroup = null;
    let slideMesh = null;
    let slideBaseZ = 0;
    let muzzleLight = null;
    let muzzleSprite = null;
    let weaponBasePos = null;
    let weaponBaseRot = null;

    let recoilKick = 0;      // hela vapnets rekyl (0..1, avtar)
    let slideRecoilKick = 0; // sliden separat, avtar snabbare
    let muzzleFlash = 0;
    let shakeAmount = 0;

    let aimYaw = 0;
    let aimPitch = 0;
    let idleT = 0;

    let resizeObserver = null;
    let mutationObserver = null;

    const ROOM_HALF_WIDTH = 6;
    const TARGET_MIN_Z = -8;
    const TARGET_MAX_Z = -20;


    function loadThree() {
        return new Promise(function (resolve, reject) {

            if (window.THREE) {
                resolve(window.THREE);
                return;
            }

            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

            script.onload = function () {
                resolve(window.THREE);
            };

            script.onerror = function () {
                reject(new Error("Three.js kunde inte laddas (ingen internetanslutning?)"));
            };

            document.head.appendChild(script);
        });
    }


    /* ---------- TEXTURER (genereras med vanlig 2D-canvas) ---------- */

    function makeTargetTexture() {

        const w = 200;
        const h = 300;

        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;

        const tctx = c.getContext("2d");

        tctx.fillStyle = "#d5d0c2";
        tctx.fillRect(0, 0, w, h);

        // Siluett
        tctx.fillStyle = "#171819";
        tctx.beginPath();
        tctx.arc(w / 2, h * .27, w * .13, 0, Math.PI * 2);
        tctx.fill();

        tctx.beginPath();
        tctx.moveTo(w * .38, h * .42);
        tctx.quadraticCurveTo(w * .28, h * .62, w * .34, h * .92);
        tctx.lineTo(w * .66, h * .92);
        tctx.quadraticCurveTo(w * .72, h * .62, w * .62, h * .42);
        tctx.closePath();
        tctx.fill();

        // Ringar
        const rings = [
            [.42, "#d5d0c2"],
            [.33, "#171819"],
            [.23, "#c3bcad"],
            [.13, "#18191a"],
            [.06, "#9c4d42"]
        ];

        for (const ring of rings) {
            tctx.strokeStyle = ring[1];
            tctx.lineWidth = 3;
            tctx.beginPath();
            tctx.ellipse(w / 2, h * .5, w * ring[0], w * ring[0] * 1.15, 0, 0, Math.PI * 2);
            tctx.stroke();
        }

        const texture = new THREE.CanvasTexture(c);
        texture.needsUpdate = true;

        return { canvas: c, ctx: tctx, texture: texture, width: w, height: h };
    }

    function makeGripTexture() {

        const w = 64;
        const h = 64;

        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;

        const gctx = c.getContext("2d");

        gctx.fillStyle = "#141516";
        gctx.fillRect(0, 0, w, h);

        gctx.strokeStyle = "rgba(70,74,74,.9)";
        gctx.lineWidth = 1;

        for (let d = -w; d < w * 2; d += 6) {
            gctx.beginPath();
            gctx.moveTo(d, 0);
            gctx.lineTo(d + h, h);
            gctx.stroke();

            gctx.beginPath();
            gctx.moveTo(w - d, 0);
            gctx.lineTo(w - d - h, h);
            gctx.stroke();
        }

        const texture = new THREE.CanvasTexture(c);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 3);
        texture.needsUpdate = true;

        return texture;
    }

    function makeFlareTexture() {

        const size = 128;
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;

        const fctx = c.getContext("2d");

        const gradient = fctx.createRadialGradient(
            size / 2, size / 2, 0,
            size / 2, size / 2, size / 2
        );

        gradient.addColorStop(0, "rgba(255,255,240,1)");
        gradient.addColorStop(.25, "rgba(255,200,90,.9)");
        gradient.addColorStop(1, "rgba(255,90,20,0)");

        fctx.fillStyle = gradient;
        fctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(c);
        texture.needsUpdate = true;

        return texture;
    }


    /* ---------- SCEN, RUM & LJUS ---------- */

    function buildRoom() {

        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x4a3f2f,
            roughness: 0.95,
            metalness: 0
        });

        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(ROOM_HALF_WIDTH * 2 + 4, 34),
            floorMat
        );

        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0, -12);
        scene.add(floor);

        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x1c1712,
            roughness: 1,
            metalness: 0
        });

        const backWall = new THREE.Mesh(
            new THREE.PlaneGeometry(ROOM_HALF_WIDTH * 2 + 4, 9),
            wallMat
        );
        backWall.position.set(0, 4, -23);
        scene.add(backWall);

        const sideMat = new THREE.MeshStandardMaterial({
            color: 0x241d16,
            roughness: 1,
            metalness: 0
        });

        const leftWall = new THREE.Mesh(
            new THREE.PlaneGeometry(34, 9),
            sideMat
        );
        leftWall.rotation.y = Math.PI / 2;
        leftWall.position.set(-ROOM_HALF_WIDTH - 2, 4, -8);
        scene.add(leftWall);

        const rightWall = new THREE.Mesh(
            new THREE.PlaneGeometry(34, 9),
            sideMat
        );
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.position.set(ROOM_HALF_WIDTH + 2, 4, -8);
        scene.add(rightWall);

        const ceiling = new THREE.Mesh(
            new THREE.PlaneGeometry(ROOM_HALF_WIDTH * 2 + 4, 34),
            new THREE.MeshStandardMaterial({ color: 0x0e0f10, roughness: 1 })
        );
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(0, 8.2, -12);
        scene.add(ceiling);

        // Taklampor + punktljus, utplacerade längs banan
        const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2cf });

        for (let i = 0; i < 5; i++) {

            const z = -3 - i * 5;

            const lamp = new THREE.Mesh(
                new THREE.BoxGeometry(1.4, 0.08, 0.5),
                lampMat
            );
            lamp.position.set(0, 8, z);
            scene.add(lamp);

            const light = new THREE.PointLight(0xffe6b0, 1.1, 14, 2);
            light.position.set(0, 7.6, z);
            scene.add(light);
        }

        // Avståndsmarkeringar på sidoväggen
        const distances = [
            [10, -8], [15, -11], [20, -14], [25, -17], [30, -20]
        ];

        for (const d of distances) {

            const labelCanvas = document.createElement("canvas");
            labelCanvas.width = 128;
            labelCanvas.height = 64;

            const lctx = labelCanvas.getContext("2d");
            lctx.fillStyle = "rgba(220,210,190,.55)";
            lctx.font = "bold 40px Arial";
            lctx.textAlign = "center";
            lctx.textBaseline = "middle";
            lctx.fillText(String(d[0]), 64, 34);

            const labelTexture = new THREE.CanvasTexture(labelCanvas);

            const labelSprite = new THREE.Sprite(
                new THREE.SpriteMaterial({ map: labelTexture, transparent: true })
            );

            labelSprite.position.set(-ROOM_HALF_WIDTH - 1.85, 3.2, d[1]);
            labelSprite.scale.set(1.4, 0.7, 1);
            scene.add(labelSprite);
        }

        // Svag omgivningsbelysning + riktat ljus för mjuka skuggor i färgen
        scene.add(new THREE.HemisphereLight(0x4a4438, 0x0a0908, 0.55));

        const keyLight = new THREE.DirectionalLight(0xfff4e0, 0.35);
        keyLight.position.set(2, 6, 6);
        scene.add(keyLight);
    }


    /* ---------- VAPEN (3D-modell i kamerans "hand") ---------- */

    function buildWeapon() {

        weaponGroup = new THREE.Group();

        weaponBasePos = new THREE.Vector3(0.34, -0.34, -0.72);
        weaponBaseRot = new THREE.Euler(0, Math.PI * 0.045, -0.02);

        weaponGroup.position.copy(weaponBasePos);
        weaponGroup.rotation.copy(weaponBaseRot);

        camera.add(weaponGroup);
        scene.add(camera);


        const gripTexture = makeGripTexture();

        const gripMat = new THREE.MeshStandardMaterial({
            color: 0x1a1b1c,
            roughness: 0.85,
            metalness: 0.05,
            map: gripTexture
        });

        const slideMat = new THREE.MeshStandardMaterial({
            color: 0x2c2e30,
            roughness: 0.3,
            metalness: 0.85
        });

        const darkMetal = new THREE.MeshStandardMaterial({
            color: 0x0c0d0e,
            roughness: 0.4,
            metalness: 0.7
        });


        /* Grip/ram */

        const grip = new THREE.Mesh(
            new THREE.BoxGeometry(0.085, 0.16, 0.055),
            gripMat
        );
        grip.position.set(0, -0.09, 0.02);
        grip.rotation.x = 0.12;
        weaponGroup.add(grip);

        /* Avtryckarbygel */

        const guard = new THREE.Mesh(
            new THREE.TorusGeometry(0.035, 0.006, 8, 16, Math.PI * 1.3),
            darkMetal
        );
        guard.position.set(0, -0.015, 0.06);
        guard.rotation.z = Math.PI;
        guard.rotation.y = Math.PI / 2;
        weaponGroup.add(guard);

        /* Avtryckare */

        const trigger = new THREE.Mesh(
            new THREE.BoxGeometry(0.006, 0.03, 0.012),
            darkMetal
        );
        trigger.position.set(0, -0.02, 0.065);
        weaponGroup.add(trigger);

        /* Ram framtill (dust cover) */

        const dustCover = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.03, 0.1),
            darkMetal
        );
        dustCover.position.set(0, 0.005, 0.09);
        weaponGroup.add(dustCover);


        /* --- Slide (rör sig separat vid rekyl) --- */

        slideMesh = new THREE.Group();
        slideBaseZ = 0;
        slideMesh.position.set(0, 0.035, 0.02);
        weaponGroup.add(slideMesh);

        const slideBody = new THREE.Mesh(
            new THREE.BoxGeometry(0.075, 0.05, 0.22),
            slideMat
        );
        slideBody.position.set(0, 0, 0);
        slideMesh.add(slideBody);

        // Räfflor bak på sliden
        for (let i = 0; i < 6; i++) {
            const groove = new THREE.Mesh(
                new THREE.BoxGeometry(0.077, 0.052, 0.004),
                darkMetal
            );
            groove.position.set(0, 0, -0.07 + i * 0.009);
            slideMesh.add(groove);
        }

        // Pipa
        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.011, 0.011, 0.09, 14),
            darkMetal
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0, 0.14);
        slideMesh.add(barrel);

        // Bakre sikte
        const rearSight = new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 0.014, 0.012),
            darkMetal
        );
        rearSight.position.set(0, 0.032, -0.09);
        slideMesh.add(rearSight);

        // Främre sikte med vit prick
        const frontSight = new THREE.Mesh(
            new THREE.BoxGeometry(0.007, 0.018, 0.007),
            darkMetal
        );
        frontSight.position.set(0, 0.032, 0.175);
        slideMesh.add(frontSight);

        const frontSightDot = new THREE.Mesh(
            new THREE.SphereGeometry(0.0025, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xdcd48a })
        );
        frontSightDot.position.set(0, 0.034, 0.178);
        slideMesh.add(frontSightDot);

        // Hane
        const hammer = new THREE.Mesh(
            new THREE.SphereGeometry(0.012, 8, 8),
            darkMetal
        );
        hammer.position.set(0, 0.01, -0.115);
        slideMesh.add(hammer);


        /* --- Mynningsflamma --- */

        muzzleLight = new THREE.PointLight(0xffcc66, 0, 4, 2);
        muzzleLight.position.set(0, 0, 0.19);
        slideMesh.add(muzzleLight);

        const flareTexture = makeFlareTexture();

        muzzleSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: flareTexture,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        );
        muzzleSprite.position.set(0, 0, 0.2);
        muzzleSprite.scale.set(0.16, 0.16, 1);
        slideMesh.add(muzzleSprite);
    }


    /* ---------- MÅL ---------- */

    function createTargetEntry() {

        const t = makeTargetTexture();

        const material = new THREE.MeshStandardMaterial({
            map: t.texture,
            roughness: 0.85,
            metalness: 0
        });

        const geometry = new THREE.PlaneGeometry(0.9, 1.35);

        const mesh = new THREE.Mesh(geometry, material);

        const x = (Math.random() * 2 - 1) * (ROOM_HALF_WIDTH - 1.4);
        const y = 1.0 + Math.random() * 1.1;
        const z = TARGET_MIN_Z + Math.random() * (TARGET_MAX_Z - TARGET_MIN_Z);

        mesh.position.set(x, y, z);

        const scale = 0.75 + Math.random() * 0.55;
        mesh.scale.setScalar(scale);

        scene.add(mesh);

        return {
            mesh: mesh,
            geometry: geometry,
            material: material,
            texture: t.texture,
            canvas: t.canvas,
            ctx: t.ctx,
            texW: t.width,
            texH: t.height,
            life: 0,
            maxLife: 3.5 + Math.random() * 2.2,
            moving: Math.random() < 0.3,
            direction: Math.random() < 0.5 ? -1 : 1,
            speed: 0.4 + Math.random() * 0.6
        };
    }

    function disposeTarget(entry) {
        scene.remove(entry.mesh);
        entry.geometry.dispose();
        entry.material.dispose();
        entry.texture.dispose();
    }

    function spawnTarget() {
        if (!threeReady) return;
        targets.push(createTargetEntry());
    }

    function updateTargets(dt) {

        for (let i = targets.length - 1; i >= 0; i--) {

            const t = targets[i];
            t.life += dt;

            if (t.moving) {

                t.mesh.position.x += t.speed * t.direction * dt;

                const limit = ROOM_HALF_WIDTH - 1.4;

                if (t.mesh.position.x > limit || t.mesh.position.x < -limit) {
                    t.direction *= -1;
                }
            }

            if (t.life > t.maxLife) {
                disposeTarget(t);
                targets.splice(i, 1);
                combo = 0;
            }
        }
    }


    /* ---------- TOMHYLSOR ---------- */

    function ejectShell() {

        const geometry = new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8);
        const material = new THREE.MeshStandardMaterial({
            color: 0xb58c4d,
            metalness: 0.8,
            roughness: 0.35
        });

        const mesh = new THREE.Mesh(geometry, material);

        const worldPos = new THREE.Vector3();
        slideMesh.getWorldPosition(worldPos);
        worldPos.x += 0.05;

        mesh.position.copy(worldPos);
        scene.add(mesh);

        shells.push({
            mesh: mesh,
            geometry: geometry,
            material: material,
            velocity: new THREE.Vector3(
                0.6 + Math.random() * 0.5,
                1.4 + Math.random() * 0.5,
                -0.3 + Math.random() * 0.4
            ),
            spin: new THREE.Vector3(
                Math.random() * 8,
                Math.random() * 8,
                Math.random() * 8
            ),
            life: 2.2
        });
    }

    function updateShells(dt) {

        for (let i = shells.length - 1; i >= 0; i--) {

            const s = shells[i];

            s.life -= dt;
            s.velocity.y -= 2.6 * dt;

            s.mesh.position.x += s.velocity.x * dt;
            s.mesh.position.y += s.velocity.y * dt;
            s.mesh.position.z += s.velocity.z * dt;

            s.mesh.rotation.x += s.spin.x * dt;
            s.mesh.rotation.y += s.spin.y * dt;

            if (s.life <= 0 || s.mesh.position.y < -0.3) {
                scene.remove(s.mesh);
                s.geometry.dispose();
                s.material.dispose();
                shells.splice(i, 1);
            }
        }
    }


    /* ---------- FLYTANDE TEXT (DOM ovanpå 3D-scenen) ---------- */

    function floatingText(text, worldPos, color) {

        const el = document.createElement("div");
        el.className = "sr-floattext";
        el.textContent = text;
        el.style.color = color;
        floatLayer.appendChild(el);

        floatingTexts.push({
            el: el,
            pos: worldPos.clone(),
            life: 1
        });
    }

    function updateFloatingTexts(dt) {

        const rect = game.getBoundingClientRect();
        const projected = new THREE.Vector3();

        for (let i = floatingTexts.length - 1; i >= 0; i--) {

            const f = floatingTexts[i];

            f.life -= dt;
            f.pos.y += dt * 0.5;

            if (f.life <= 0) {
                f.el.remove();
                floatingTexts.splice(i, 1);
                continue;
            }

            projected.copy(f.pos).project(camera);

            const x = (projected.x * 0.5 + 0.5) * rect.width;
            const y = (1 - (projected.y * 0.5 + 0.5)) * rect.height;

            f.el.style.left = x + "px";
            f.el.style.top = y + "px";
            f.el.style.opacity = String(Math.min(1, f.life * 2));
        }
    }


    /* ---------- VAPEN-UPPDATERING (sway, rekyl, mynningsflamma) ---------- */

    function updateWeapon(dt) {

        // Siktet styr en liten svängning av vapnet, med eftersläpning
        // (lerp) så det känns levande och inte som ett stelt hopp.
        const targetYaw = -mouseNDC.x * 0.11;
        const targetPitch = mouseNDC.y * 0.07;

        const followSpeed = 1 - Math.pow(0.0006, dt);

        aimYaw += (targetYaw - aimYaw) * followSpeed;
        aimPitch += (targetPitch - aimPitch) * followSpeed;

        idleT += dt;

        const idleX = Math.sin(idleT * 0.9) * 0.0035;
        const idleY = Math.sin(idleT * 1.6) * 0.004 + Math.abs(Math.sin(idleT * 0.8)) * 0.001;

        recoilKick *= Math.pow(0.015, dt * 6);
        slideRecoilKick *= Math.pow(0.01, dt * 8);
        reloadDip *= Math.pow(0.02, dt * 5);

        weaponGroup.rotation.set(
            weaponBaseRot.x + aimPitch - recoilKick * 0.12 - reloadDip * 0.25,
            weaponBaseRot.y + aimYaw,
            weaponBaseRot.z
        );

        weaponGroup.position.set(
            weaponBasePos.x + idleX,
            weaponBasePos.y + idleY + recoilKick * 0.012 - reloadDip * 0.03,
            weaponBasePos.z + recoilKick * 0.05
        );

        slideMesh.position.z = 0.02 + slideRecoilKick * 0.045;

        muzzleFlash -= dt * 9;

        const flashVisible = Math.max(0, muzzleFlash);
        muzzleLight.intensity = flashVisible * 3.2;
        muzzleSprite.material.opacity = flashVisible;
        muzzleSprite.scale.setScalar(0.14 + (1 - flashVisible) * 0.05);
    }


    /* ---------- SKJUTA / TRÄFFA ---------- */

    function shoot() {

        if (!running || !threeReady) return;

        shots++;

        recoilKick = 1;
        slideRecoilKick = 1;
        muzzleFlash = 1;
        shakeAmount = 1;

        playGunshot();
        ejectShell();

        raycaster.setFromCamera(mouseNDC, camera);

        const meshes = targets.map(function (t) { return t.mesh; });
        const intersections = raycaster.intersectObjects(meshes);

        if (intersections.length > 0) {

            const hitMesh = intersections[0].object;
            const uv = intersections[0].uv;

            const entryIndex = targets.findIndex(function (t) {
                return t.mesh === hitMesh;
            });

            if (entryIndex !== -1) {
                hit(targets[entryIndex], entryIndex, uv);
            }

        } else {

            combo = 0;

            const missPoint = new THREE.Vector3(
                mouseNDC.x * 6,
                1.5 + mouseNDC.y * 3,
                -10
            );

            floatingText("MISS", missPoint, "#a76c62");
        }

        updateHUD();
    }

    function hit(entry, index, uv) {

        hits++;
        combo++;
        bestCombo = Math.max(bestCombo, combo);

        const points = 100 + combo * 10;
        score += points;

        if (uv) {

            const px = uv.x * entry.texW;
            const py = (1 - uv.y) * entry.texH;

            entry.ctx.fillStyle = "#111";
            entry.ctx.beginPath();
            entry.ctx.arc(px, py, 3.5, 0, Math.PI * 2);
            entry.ctx.fill();

            entry.texture.needsUpdate = true;
        }

        const worldPos = new THREE.Vector3();
        entry.mesh.getWorldPosition(worldPos);

        floatingText(
            "+" + points,
            worldPos,
            combo >= 5 ? "#e3bd63" : "#d3e3c0"
        );

        playHit();

        disposeTarget(entry);
        targets.splice(index, 1);
    }


    /* ---------- OMLADDNING (kosmetisk, ammo är oändlig) ---------- */

    function reload() {

        if (reloadCooldown > 0) return;

        reloadCooldown = 1.1;
        reloadDip = 1;

        setMessage("TAKTISK OMLADDNING", "", "#ccc");
        playMechClick();
    }


    /* ---------- START / SLUT ---------- */

    function disposeMaterial(material) {

        if (!material) return;

        const materials = Array.isArray(material) ? material : [material];

        for (const m of materials) {

            for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap"]) {
                if (m[key] && m[key].dispose) {
                    m[key].dispose();
                }
            }

            m.dispose();
        }
    }

    function disposeObject3D(root) {

        if (!root) return;

        root.traverse(function (obj) {

            if (obj.geometry) {
                obj.geometry.dispose();
            }

            if (obj.material) {
                disposeMaterial(obj.material);
            }
        });
    }

    function resetSceneObjects() {

        for (const t of targets) disposeTarget(t);
        targets = [];

        for (const s of shells) {
            scene.remove(s.mesh);
            s.geometry.dispose();
            s.material.dispose();
        }
        shells = [];

        for (const f of floatingTexts) f.el.remove();
        floatingTexts = [];

        recoilKick = 0;
        slideRecoilKick = 0;
        muzzleFlash = 0;
        shakeAmount = 0;
        reloadDip = 0;
        reloadCooldown = 0;
    }

    function startGame() {

        if (!threeReady || destroyed) return;

        running = true;

        score = 0;
        hits = 0;
        shots = 0;
        combo = 0;
        bestCombo = 0;
        timeLeft = 60;

        resetSceneObjects();

        spawnTimer = 0.3;

        menu.classList.add("sr-hidden");

        lastFrame = performance.now();
        updateHUD();
    }

    function endGame() {

        running = false;

        menu.classList.remove("sr-hidden");

        const accuracy = shots === 0 ? 100 : Math.round(hits / shots * 100);

        menuText.innerHTML =
            "Resultat<br><br>" +
            "Poäng: " + score + "<br>" +
            "Träffar: " + hits + "<br>" +
            "Precision: " + accuracy + "%<br>" +
            "Bästa combo: x" + bestCombo;

        startButton.textContent = "KÖR IGEN";
    }


    /* ---------- MUS / TANGENTBORD ---------- */

    function onPointerMove(event) {

        const canvasEl = renderer.domElement;
        const rect = canvasEl.getBoundingClientRect();

        mouseNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseNDC.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

        crosshair.style.left = (event.clientX - rect.left) + "px";
        crosshair.style.top = (event.clientY - rect.top) + "px";
    }

    function onPointerDown(event) {
        event.preventDefault();
        app.focus();
        shoot();
    }

    function onKeyDown(event) {

        if (event.key.toLowerCase() === "r") {
            reload();
        }

        if (event.code === "Space") {
            event.preventDefault();
            if (!running) {
                startGame();
            } else {
                spawnTarget();
            }
        }
    }


    /* ---------- HUVUDLOOP ---------- */

    function loop(now) {

        if (destroyed) return;

        const dt = Math.min(0.033, (now - lastFrame) / 1000);
        lastFrame = now;

        if (running) {

            timeLeft -= dt;

            spawnTimer -= dt;

            if (spawnTimer <= 0) {
                spawnTarget();
                spawnTimer = 0.5 + Math.random() * 0.8;
            }

            updateTargets(dt);
        }

        updateShells(dt);
        updateWeapon(dt);
        updateFloatingTexts(dt);

        shakeAmount *= Math.pow(0.03, dt);

        if (shakeAmount > 0.01) {
            camera.rotation.set(
                cameraBaseEuler.x + (Math.random() - 0.5) * shakeAmount * 0.015,
                cameraBaseEuler.y + (Math.random() - 0.5) * shakeAmount * 0.015,
                cameraBaseEuler.z
            );
        } else {
            camera.rotation.copy(cameraBaseEuler);
        }

        renderer.render(scene, camera);
        updateHUD();

        if (running && timeLeft <= 0) {
            timeLeft = 0;
            endGame();
        }

        rafId = requestAnimationFrame(loop);
    }


    /* ---------- STORLEK ---------- */

    function resizeRenderer() {

        if (!renderer || !camera) return;

        const rect = game.getBoundingClientRect();
        const w = Math.max(1, rect.width);
        const h = Math.max(1, rect.height);

        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }


    /* ---------- INITIERING AV 3D-SCEN ---------- */

    function initScene(threeLib) {

        if (destroyed) return;

        THREE = threeLib;
        raycaster = new THREE.Raycaster();

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.domElement.className = "sr-canvas";
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

        game.insertBefore(renderer.domElement, hud);

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x05070a);
        scene.fog = new THREE.Fog(0x05070a, 12, 30);

        camera = new THREE.PerspectiveCamera(55, 1100 / 700, 0.1, 100);
        camera.position.set(0, 1.55, 2);
        camera.lookAt(0, 1.4, -10);
        cameraBaseEuler = camera.rotation.clone();

        buildRoom();
        buildWeapon();

        resizeRenderer();

        threeReady = true;
        startButton.disabled = false;
        menuText.textContent =
            "Testa din precision på en realistisk 3D-inomhusbana. " +
            "Träffa målen snabbt, bygg combos och få högsta möjliga poäng.";

        rafId = requestAnimationFrame(loop);
    }


    /* ---------- EVENT-LYSSNARE ---------- */

    app.addEventListener("pointermove", onPointerMove);
    app.addEventListener("pointerdown", onPointerDown);
    app.addEventListener("keydown", onKeyDown);

    app.addEventListener("pointerdown", function () {
        app.focus();
    });

    startButton.addEventListener("click", startGame);

    if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(resizeRenderer);
        resizeObserver.observe(game);
    } else {
        window.addEventListener("resize", resizeRenderer);
    }


    /* ---------- STÄDNING ---------- */

    function cleanup() {

        if (destroyed) return;
        destroyed = true;
        running = false;

        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }

        clearTimeout(messageTimer);

        app.removeEventListener("pointermove", onPointerMove);
        app.removeEventListener("pointerdown", onPointerDown);
        app.removeEventListener("keydown", onKeyDown);

        if (resizeObserver) resizeObserver.disconnect();
        if (mutationObserver) mutationObserver.disconnect();

        if (threeReady) {

            resetSceneObjects();

            if (scene) {
                disposeObject3D(scene);
            }

            if (renderer) {

                renderer.dispose();

                // Frigör WebGL-kontexten direkt istället för att förlita
                // sig på att GC städar upp den vid ett senare tillfälle
                // — viktigt om rutan startas/stoppas många gånger, annars
                // kan webbläsaren hinna skapa fler WebGL-kontexter än den
                // tillåter innan de gamla hinner städas bort.
                const loseContextExt =
                    renderer.getContext &&
                    renderer.getContext().getExtension("WEBGL_lose_context");

                if (loseContextExt) {
                    loseContextExt.loseContext();
                }

                if (renderer.domElement.parentElement) {
                    renderer.domElement.parentElement.removeChild(renderer.domElement);
                }
            }
        }

        if (app.parentElement) app.parentElement.removeChild(app);
        if (style.parentElement) style.parentElement.removeChild(style);

        delete mount.__shootingRangeCleanup;
    }

    if (typeof MutationObserver !== "undefined" && app.parentElement) {
        mutationObserver = new MutationObserver(function () {
            if (!document.body.contains(app)) {
                cleanup();
            }
        });
        mutationObserver.observe(mount, { childList: true });
    }

    mount.__shootingRangeCleanup = cleanup;
    app.kanvasStop = cleanup;


    /* ---------- STARTA LADDNING AV THREE.JS ---------- */

    loadThree()
        .then(initScene)
        .catch(function (error) {
            menuText.textContent =
                "Kunde inte ladda 3D-motorn (Three.js). " +
                "Kontrollera internetanslutningen och försök igen.";
        });

})();
