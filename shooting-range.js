"use strict";

/*
    SHOOTING RANGE — Kanvas-anpassad version
    =========================================

    Ändringar jämfört med originalet:

    1) BUGFIX: Originalet refererade till variabeln `game`
       (closeButton.appendChild) INNAN `const game = ...`
       ens deklarerats längre ner i filen. Med `const`/`let`
       ger det en ReferenceError (temporal dead zone) och
       hela scriptet kraschade direkt vid körning — spelet
       kunde alltså aldrig starta. Ordningen är nu fixad.

    2) Allt är inkapslat i en IIFE (self-invoking function)
       så inga variabler läcker till `window`. Det gör att
       rutan kan köras flera gånger, eller sida vid sida med
       andra Kanvas-rutor, utan att krocka med `const`/`let`
       som redan finns i den delade scopen.

    3) CSS:en är omskriven så att ALLA regler är prefixade
       med en unik root-klass (.sr-app-XXXX) istället för
       breda selektorer som `*`, `button`, `canvas`, `html,body`.
       Originalets stil satte t.ex. cursor:none och stilar på
       ALLA <button>/<canvas> i hela dokumentet — om Kanvas
       kör flera rutor i samma DOM hade det förstört resten
       av appen. Nu påverkas bara den här rutans egna element.

    4) Alla #id-selektorer (#game, #hud, #score, ...) är
       bytta mot klasser och slås upp via querySelector på
       rutans egen root-container — inte document.getElementById.
       Annars hade en andra kopia av samma script i samma DOM
       returnerat samma element som den första kopian (id:n
       måste vara unika i ett dokument).

    5) Städning: en MutationObserver upptäcker om rutan tas
       bort ur DOM:en och stoppar då animationsloopen
       (cancelAnimationFrame) samt tar bort event-listeners,
       så att en borttagen/stoppad ruta inte fortsätter rendera
       i bakgrunden. Fungerar oavsett om Kanvas kör rutan i en
       egen iframe eller i delad DOM.

    6) Stäng-knappen försöker INTE längre stänga hela fliken
       eller skriva över hela <body>. Den anropar bara den
       lokala cleanup-funktionen, som tar bort rutans eget
       innehåll. Om ni vill hooka in detta i Kanvas egna
       "■ Stoppa"-knapp kan ni anropa:

           rootEl.kanvasStop()

       på det element som funktionen returnerar/monteras i —
       se `mount()` längst ner.

    7) Vapnet (drawWeapon) är omritat: metallslide med
       gradient/highlights, slide som rör sig separat från
       ramen vid rekyl (blowback-känsla), ejection port,
       avtryckarbygel + avtryckare, bakre/främre sikte,
       räfflor i slidens bakkant, magasinsbotten och mjuk
       skugga under vapnet.
*/

(function () {

    /* ---------- MOUNT-PUNKT ---------- */
    /*
        Vet vi inte hur Kanvas kör rutan (egen iframe eller
        delad DOM) så letar vi efter det egna <script>-taggens
        förälder som mount-punkt om det går. Annars faller vi
        tillbaka på document.body (fungerar fint om rutan körs
        i en egen iframe, vilket verkar mest troligt utifrån
        hur resten av det här scriptet redan var skrivet).
    */

    const scriptEl =
        document.currentScript;

    const mount =
        (scriptEl && scriptEl.parentElement) ||
        document.body;

    // Unikt instans-id så flera kopior kan leva sida vid sida
    const uid =
        "sr" + Math.random().toString(36).slice(2, 9);

    const rootClass = "sr-app-" + uid;

    // Om samma ruta av någon anledning körs igen på samma
    // mount-punkt: städa bort den gamla instansen först.
    if (mount.__shootingRangeCleanup) {
        try {
            mount.__shootingRangeCleanup();
        } catch (error) {
        }
    }


    /* ---------- STYLE (scopead, ingen global läckage) ---------- */

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
    background: #080a0c;
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
    background: #111;
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

.${rootClass} .sr-score {
    color: #d2e0c1 !important;
}

.${rootClass} .sr-combo {
    color: #d9b865 !important;
}

.${rootClass} .sr-ammo {
    font-size: 24px;
    font-weight: bold;
    color: #ddd;
}

.${rootClass} .sr-ammo span {
    color: #656c70;
    font-size: 14px;
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

.${rootClass} .sr-menu {
    position: absolute;
    inset: 0;
    z-index: 100;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(3,5,6,.84);
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

.${rootClass} .sr-card h1 span {
    color: #a9ba91;
}

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

.${rootClass} .sr-btn:hover {
    filter: brightness(1.15);
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

.${rootClass} .sr-close:hover {
    background: #7b302b;
    color: #fff;
}

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

.${rootClass} .sr-hidden {
    display: none !important;
}

@media (max-width: 800px) {
    .${rootClass} .sr-stat {
        display: none;
    }

    .${rootClass} .sr-controls {
        display: none;
    }
}
`;

    document.head.appendChild(style);


    /* ---------- ROT-CONTAINER ---------- */

    const app = document.createElement("div");
    app.className = rootClass;
    app.tabIndex = 0; // så vi kan fånga tangentbord lokalt utan document-listener

    mount.appendChild(app);


    /* ---------- GAME CONTAINER (skapas FÖRE close-knappen!) ---------- */

    const game = document.createElement("div");
    game.className = "sr-game";
    app.appendChild(game);


    /* ---------- CANVAS ---------- */

    const canvas = document.createElement("canvas");
    canvas.className = "sr-canvas";
    game.appendChild(canvas);

    const ctx = canvas.getContext("2d");

    const WIDTH = 1100;
    const HEIGHT = 700;


    /* ---------- HUD ---------- */

    const hud = document.createElement("div");
    hud.className = "sr-hud";

    hud.innerHTML = `
<div class="sr-hudLeft">

    <div class="sr-title">
        SHOOTING RANGE
        <small>TRAINING FACILITY</small>
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
        <span data-role="ammo">12</span>
        <span>/ 36</span>
    </div>

</div>
`;

    game.appendChild(hud);


    /* ---------- CROSSHAIR ---------- */

    const crosshair = document.createElement("div");
    crosshair.className = "sr-crosshair";
    crosshair.innerHTML = `<div class="sr-crosshairDot"></div>`;
    game.appendChild(crosshair);


    /* ---------- MESSAGE ---------- */

    const message = document.createElement("div");
    message.className = "sr-message";

    message.innerHTML = `
<div class="sr-messageMain" data-role="messageMain"></div>
<div class="sr-messageSub" data-role="messageSub"></div>
`;

    game.appendChild(message);


    /* ---------- CONTROLS ---------- */

    const controls = document.createElement("div");
    controls.className = "sr-controls";

    controls.innerHTML = `
MUS = SKJUT<br>
R = LADDA OM<br>
SPACE = NYTT MÅL
`;

    game.appendChild(controls);


    /* ---------- MENU ---------- */

    const menu = document.createElement("div");
    menu.className = "sr-menu";

    menu.innerHTML = `
<div class="sr-card">

    <h1>
        SHOOTING
        <span>RANGE</span>
    </h1>

    <p data-role="menuText">
        Testa din precision på en realistisk
        inomhusbana. Träffa målen snabbt,
        bygg combos och få högsta möjliga poäng.
    </p>

    <button class="sr-btn" data-role="start">
        STARTA
    </button>

</div>
`;

    game.appendChild(menu);


    /* ---------- CLOSE-KNAPP (skapas EFTER game finns) ---------- */

    const closeButton = document.createElement("button");
    closeButton.className = "sr-close";
    closeButton.textContent = "×";

    closeButton.addEventListener("click", function () {
        cleanup();
    });

    game.appendChild(closeButton);


    /* ---------- ELEMENT-REFERENSER (scopeade till app, inte document) ---------- */

    const startButton = menu.querySelector('[data-role="start"]');
    const menuText = menu.querySelector('[data-role="menuText"]');

    const scoreElement = hud.querySelector('[data-role="score"]');
    const hitsElement = hud.querySelector('[data-role="hits"]');
    const accuracyElement = hud.querySelector('[data-role="accuracy"]');
    const comboElement = hud.querySelector('[data-role="combo"]');
    const timeElement = hud.querySelector('[data-role="time"]');
    const ammoElement = hud.querySelector('[data-role="ammo"]');

    const messageMain = message.querySelector('[data-role="messageMain"]');
    const messageSub = message.querySelector('[data-role="messageSub"]');


    /* ---------- GAME VARIABLES ---------- */

    let running = false;
    let destroyed = false;

    let score = 0;
    let hits = 0;
    let shots = 0;
    let combo = 0;
    let bestCombo = 0;

    let ammo = 12;
    let reserveAmmo = 36;

    let timeLeft = 60;

    let mouseX = 550;
    let mouseY = 350;

    let recoil = 0;      // 0..1, styr slide + muzzle flash
    let muzzleFlash = 0;
    let shake = 0;

    let spawnTimer = 0;

    let lastFrame = 0;
    let rafId = null;

    let targets = [];
    let particles = [];
    let shells = [];
    let floatingTexts = [];
    let bulletHoles = [];

    let audioContext;

    let messageTimer = null;


    /* ---------- AUDIO ---------- */

    function sound(frequency, duration, type, volume) {

        try {

            if (!audioContext) {

                audioContext =
                    new (window.AudioContext || window.webkitAudioContext)();
            }

            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();

            oscillator.type = type || "sine";
            oscillator.frequency.value = frequency;
            gain.gain.value = volume || .03;

            oscillator.connect(gain);
            gain.connect(audioContext.destination);

            oscillator.start();

            gain.gain.exponentialRampToValueAtTime(
                .001,
                audioContext.currentTime + duration
            );

            oscillator.stop(audioContext.currentTime + duration);

        } catch (error) {
        }
    }


    /* ---------- START ---------- */

    function startGame() {

        if (destroyed) return;

        running = true;

        score = 0;
        hits = 0;
        shots = 0;
        combo = 0;
        bestCombo = 0;

        ammo = 12;
        reserveAmmo = 36;

        timeLeft = 60;

        recoil = 0;
        muzzleFlash = 0;
        shake = 0;

        targets = [];
        particles = [];
        shells = [];
        floatingTexts = [];
        bulletHoles = [];

        spawnTimer = .3;

        menu.classList.add("sr-hidden");

        lastFrame = performance.now();

        updateHUD();

        rafId = requestAnimationFrame(loop);
    }


    /* ---------- END ---------- */

    function endGame() {

        running = false;

        menu.classList.remove("sr-hidden");

        const accuracy =
            shots === 0 ? 100 : Math.round(hits / shots * 100);

        menuText.innerHTML =
            "Resultat<br><br>" +
            "Poäng: " + score + "<br>" +
            "Träffar: " + hits + "<br>" +
            "Precision: " + accuracy + "%<br>" +
            "Bästa combo: x" + bestCombo;

        startButton.textContent = "KÖR IGEN";
    }


    /* ---------- HUD ---------- */

    function updateHUD() {

        scoreElement.textContent = score.toLocaleString("sv-SE");
        hitsElement.textContent = hits;

        const accuracy =
            shots === 0 ? 100 : Math.round(hits / shots * 100);

        accuracyElement.textContent = accuracy + "%";
        comboElement.textContent = "x" + Math.max(1, combo);
        timeElement.textContent = Math.max(0, timeLeft).toFixed(1);
        ammoElement.textContent = ammo;
    }


    /* ---------- TARGET ---------- */

    function spawnTarget() {

        const size = 42 + Math.random() * 35;
        const x = 190 + Math.random() * 720;
        const y = 240 + Math.random() * 150;

        targets.push({
            x: x,
            y: y,
            size: size,
            life: 0,
            maxLife: 3.5 + Math.random() * 2,
            speed: .2 + Math.random() * .5,
            direction: Math.random() < .5 ? -1 : 1,
            moving: Math.random() < .25
        });
    }


    /* ---------- SHOOT ---------- */

    function shoot() {

        if (!running) return;

        if (ammo <= 0) {
            reload();
            return;
        }

        ammo--;
        shots++;

        recoil = 1;
        muzzleFlash = 1;
        shake = 2;

        sound(90, .07, "sawtooth", .08);

        ejectShell();

        let hitTarget = null;
        let closest = Infinity;

        for (const target of targets) {

            const dx = mouseX - target.x;
            const dy = mouseY - target.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < target.size / 2 && distance < closest) {
                closest = distance;
                hitTarget = target;
            }
        }

        if (hitTarget) {
            hit(hitTarget);
        } else {
            combo = 0;
            floatingText("MISS", mouseX, mouseY, "#a76c62");
        }

        updateHUD();
    }


    /* ---------- HIT ---------- */

    function hit(target) {

        hits++;
        combo++;
        bestCombo = Math.max(bestCombo, combo);

        const points = 100 + combo * 10;
        score += points;

        bulletHoles.push({
            x: target.x + (Math.random() - .5) * target.size * .35,
            y: target.y + (Math.random() - .5) * target.size * .5,
            life: 8
        });

        for (let i = 0; i < 18; i++) {

            const angle = Math.random() * Math.PI * 2;
            const speed = 40 + Math.random() * 100;

            particles.push({
                x: target.x,
                y: target.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: .3 + Math.random() * .3,
                size: 1 + Math.random() * 3
            });
        }

        floatingText(
            "+" + points,
            target.x,
            target.y,
            combo >= 5 ? "#e3bd63" : "#d3e3c0"
        );

        targets.splice(targets.indexOf(target), 1);

        sound(700, .05, "triangle", .035);
    }


    /* ---------- RELOAD ---------- */

    function reload() {

        if (ammo >= 12 || reserveAmmo <= 0) {
            return;
        }

        setMessage("LADDAR OM", "", "#ccc");

        setTimeout(() => {

            if (destroyed) return;

            const amount = Math.min(12 - ammo, reserveAmmo);

            ammo += amount;
            reserveAmmo -= amount;

            updateHUD();

        }, 800);
    }


    /* ---------- SHELL ---------- */

    function ejectShell() {

        shells.push({
            x: 705,
            y: 570,
            vx: 50 + Math.random() * 70,
            vy: -130 - Math.random() * 80,
            rotation: Math.random() * 6,
            spin: -5 + Math.random() * 10,
            life: 2
        });
    }


    /* ---------- MOUSE (scopeat till canvas, inte document) ---------- */

    function onPointerMove(event) {

        const rect = canvas.getBoundingClientRect();

        mouseX = (event.clientX - rect.left) / rect.width * WIDTH;
        mouseY = (event.clientY - rect.top) / rect.height * HEIGHT;

        const gameRect = game.getBoundingClientRect();

        crosshair.style.left = (event.clientX - gameRect.left) + "px";
        crosshair.style.top = (event.clientY - gameRect.top) + "px";
    }

    function onPointerDown(event) {
        event.preventDefault();
        app.focus();
        shoot();
    }

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);


    /* ---------- KEYBOARD (scopeat till appen, kräver fokus) ---------- */
    /*
        Lyssnar på appens EGET element (app.tabIndex = 0) istället
        för hela document. Det gör att R/SPACE bara triggar den här
        rutan när den är fokuserad — viktigt om flera Kanvas-rutor
        (och deras egna tangentbordsgenvägar) delar samma sida.
    */

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

    app.addEventListener("keydown", onKeyDown);

    // Klick i rutan ger den tangentbordsfokus
    app.addEventListener("pointerdown", function () {
        app.focus();
    });


    /* ---------- RANGE ---------- */

    function drawRange() {

        const ceiling = ctx.createLinearGradient(0, 65, 0, 220);
        ceiling.addColorStop(0, "#101315");
        ceiling.addColorStop(1, "#292720");
        ctx.fillStyle = ceiling;
        ctx.fillRect(0, 65, WIDTH, 160);

        const wall = ctx.createLinearGradient(0, 160, 0, 450);
        wall.addColorStop(0, "#28231d");
        wall.addColorStop(1, "#100f0d");
        ctx.fillStyle = wall;
        ctx.fillRect(120, 160, 860, 300);

        const floor = ctx.createLinearGradient(0, 430, 0, 700);
        floor.addColorStop(0, "#514a3d");
        floor.addColorStop(1, "#171715");
        ctx.fillStyle = floor;
        ctx.fillRect(0, 430, WIDTH, 270);

        ctx.fillStyle = "#27211b";
        ctx.fillRect(0, 120, 120, 380);
        ctx.fillRect(980, 120, 120, 380);

        ctx.strokeStyle = "rgba(190,150,100,.15)";
        ctx.lineWidth = 3;

        for (let y = 130; y < 500; y += 45) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(120, y);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(980, y);
            ctx.lineTo(1100, y);
            ctx.stroke();
        }

        ctx.strokeStyle = "rgba(220,200,160,.12)";
        ctx.lineWidth = 2;

        for (let x = 100; x <= 1000; x += 150) {
            ctx.beginPath();
            ctx.moveTo(550, 430);
            ctx.lineTo(x, 700);
            ctx.stroke();
        }

        ctx.fillStyle = "#151616";

        for (let x = 130; x < 1000; x += 175) {
            ctx.fillRect(x, 110, 25, 85);
        }

        for (let x = 210; x < 950; x += 180) {

            ctx.fillStyle = "#d7d0b9";
            ctx.fillRect(x, 135, 65, 7);

            const glow = ctx.createRadialGradient(
                x + 32, 142, 2,
                x + 32, 142, 90
            );

            glow.addColorStop(0, "rgba(255,235,190,.14)");
            glow.addColorStop(1, "rgba(255,235,190,0)");

            ctx.fillStyle = glow;
            ctx.fillRect(x - 60, 80, 185, 140);
        }

        ctx.font = "bold 22px Arial";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(220,210,190,.35)";

        const distances = [
            [230, "10"], [410, "15"], [590, "20"], [770, "25"], [930, "30"]
        ];

        for (const d of distances) {
            ctx.fillText(d[1], d[0], 105);
        }
    }


    /* ---------- TARGET ---------- */

    function drawTarget(target) {

        const s = target.size;

        ctx.save();

        ctx.fillStyle = "rgba(0,0,0,.45)";
        ctx.beginPath();
        ctx.ellipse(target.x + 5, target.y + 6, s * .52, s * .8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#d5d0c2";
        ctx.fillRect(target.x - s / 2, target.y - s * .75, s, s * 1.5);

        ctx.fillStyle = "#171819";
        ctx.beginPath();
        ctx.arc(target.x, target.y - s * .43, s * .15, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(target.x - s * .24, target.y - s * .25);
        ctx.quadraticCurveTo(target.x - s * .38, target.y + s * .15, target.x - s * .28, target.y + s * .65);
        ctx.lineTo(target.x + s * .28, target.y + s * .65);
        ctx.quadraticCurveTo(target.x + s * .38, target.y + s * .15, target.x + s * .24, target.y - s * .25);
        ctx.closePath();
        ctx.fill();

        const rings = [
            [.31, "#d5d0c2"],
            [.24, "#171819"],
            [.16, "#c3bcad"],
            [.09, "#18191a"],
            [.045, "#9c4d42"]
        ];

        for (const ring of rings) {
            ctx.strokeStyle = ring[1];
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(target.x, target.y, s * ring[0], s * ring[0] * 1.2, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        for (const hole of bulletHoles) {

            if (Math.abs(hole.x - target.x) < s && Math.abs(hole.y - target.y) < s) {

                ctx.fillStyle = "#111";
                ctx.beginPath();
                ctx.arc(hole.x, hole.y, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }


    /* ---------- TARGET UPDATE ---------- */

    function updateTargets(dt) {

        for (let i = targets.length - 1; i >= 0; i--) {

            const target = targets[i];
            target.life += dt;

            if (target.moving) {

                target.x += target.speed * target.direction * 35 * dt;

                if (target.x < 180 || target.x > 920) {
                    target.direction *= -1;
                }
            }

            if (target.life > target.maxLife) {
                targets.splice(i, 1);
                combo = 0;
                continue;
            }

            drawTarget(target);
        }
    }


    /* ---------- PARTICLES ---------- */

    function updateParticles(dt) {

        for (let i = particles.length - 1; i >= 0; i--) {

            const p = particles[i];

            p.life -= dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= .96;
            p.vy *= .96;

            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }

            ctx.globalAlpha = Math.min(1, p.life * 3);
            ctx.fillStyle = "#d3c5a5";
            ctx.fillRect(p.x, p.y, p.size, p.size);
            ctx.globalAlpha = 1;
        }
    }


    /* ---------- SHELLS ---------- */

    function updateShells(dt) {

        for (let i = shells.length - 1; i >= 0; i--) {

            const shell = shells[i];

            shell.life -= dt;
            shell.vy += 250 * dt;
            shell.x += shell.vx * dt;
            shell.y += shell.vy * dt;
            shell.rotation += shell.spin * dt;

            if (shell.life <= 0 || shell.y > 690) {
                shells.splice(i, 1);
                continue;
            }

            ctx.save();
            ctx.translate(shell.x, shell.y);
            ctx.rotate(shell.rotation);

            ctx.fillStyle = "#b58c4d";
            ctx.fillRect(-2, -6, 4, 12);

            ctx.fillStyle = "#e0b86c";
            ctx.fillRect(-2, -6, 4, 2);

            ctx.restore();
        }
    }


    /* ---------- FLOATING TEXT ---------- */

    function floatingText(text, x, y, color) {

        floatingTexts.push({
            text: text,
            x: x,
            y: y,
            color: color,
            life: 1
        });
    }

    function updateFloatingTexts(dt) {

        for (let i = floatingTexts.length - 1; i >= 0; i--) {

            const t = floatingTexts[i];

            t.life -= dt;
            t.y -= 25 * dt;

            if (t.life <= 0) {
                floatingTexts.splice(i, 1);
                continue;
            }

            ctx.globalAlpha = Math.min(1, t.life * 2);
            ctx.font = "bold 20px Arial";
            ctx.textAlign = "center";
            ctx.fillStyle = t.color;
            ctx.fillText(t.text, t.x, t.y);
            ctx.globalAlpha = 1;
        }
    }


    /* ---------- WEAPON (mer realistisk pistol) ---------- */
    /*
        Uppbyggnad, från botten till toppen:
        - Underarm + hand (oförändrat, bara referens)
        - Ram/grip med greppstruktur, avtryckarbygel,
          avtryckare och magasinsbotten (rör sig lite vid rekyl)
        - Slide (ovandel) som glider bakåt/uppåt separat från
          ramen vid skott — simulerar blowback — med
          metallgradient, räfflor i bakkant och ejection port
        - Främre/bakre sikte
        - Mynningsflamma vid pipans mynning
    */

    function drawWeapon() {

        ctx.save();

        // recoil går 1 -> 0 exponentiellt (sätts till 1 vid skott)
        const frameKick = recoil * 6;   // ramen/handen rör sig lite
        const slideKick = recoil * 16;  // sliden rör sig mer, och bakåt

        const baseX = 615; // ungefärlig pipa/mynnings-x
        const baseY = 552; // ungefärlig pipa/mynnings-y


        /* --- Underarm --- */

        ctx.fillStyle = "#4b382d";
        ctx.beginPath();
        ctx.moveTo(450, 700);
        ctx.lineTo(520, 700);
        ctx.lineTo(600, 555 + frameKick);
        ctx.lineTo(550, 540 + frameKick);
        ctx.closePath();
        ctx.fill();


        /* --- Hand --- */

        ctx.fillStyle = "#1d2020";
        ctx.beginPath();
        ctx.moveTo(510, 700);
        ctx.lineTo(580, 700);
        ctx.lineTo(625, 585 + frameKick);
        ctx.lineTo(580, 555 + frameKick);
        ctx.closePath();
        ctx.fill();


        /* --- Skugga under vapnet --- */

        ctx.fillStyle = "rgba(0,0,0,.35)";
        ctx.beginPath();
        ctx.ellipse(630, 672 + frameKick, 55, 8, 0, 0, Math.PI * 2);
        ctx.fill();


        /* --- Ram/frame (rör sig lite, mindre än sliden) --- */

        ctx.save();
        ctx.translate(0, frameKick);

        // Avtryckarbygel
        ctx.strokeStyle = "#0d0e0e";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.ellipse(596, 585, 16, 20, 0, 0.1, Math.PI * 1.5);
        ctx.stroke();

        // Avtryckare
        ctx.fillStyle = "#3a3d3e";
        ctx.fillRect(592, 572, 5, 16);

        // Grip (handtag)
        const gripGradient = ctx.createLinearGradient(550, 550, 640, 550);
        gripGradient.addColorStop(0, "#0c0d0d");
        gripGradient.addColorStop(0.5, "#1c1e1e");
        gripGradient.addColorStop(1, "#0c0d0d");

        ctx.fillStyle = gripGradient;
        ctx.beginPath();
        ctx.moveTo(575, 550);
        ctx.lineTo(640, 550);
        ctx.lineTo(628, 668);
        ctx.lineTo(552, 668);
        ctx.closePath();
        ctx.fill();

        // Greppstruktur (räfflor)
        ctx.strokeStyle = "#363939";
        ctx.lineWidth = 1;

        for (let y = 578; y < 648; y += 8) {
            ctx.beginPath();
            ctx.moveTo(559, y);
            ctx.lineTo(624, y);
            ctx.stroke();
        }

        // Magasinsbotten
        ctx.fillStyle = "#0a0b0b";
        ctx.fillRect(553, 664, 76, 10);
        ctx.strokeStyle = "#2b2d2d";
        ctx.strokeRect(553, 664, 76, 10);

        // Nedre delen av ramen (framifrån avtryckarbygel till pipbas)
        ctx.fillStyle = "#17181a";
        ctx.beginPath();
        ctx.moveTo(608, 555);
        ctx.lineTo(660, 555);
        ctx.lineTo(660, 578);
        ctx.lineTo(608, 578);
        ctx.closePath();
        ctx.fill();

        ctx.restore(); // slut på frame-translate


        /* --- Slide (glider bakåt + lite uppåt vid rekyl) --- */

        ctx.save();
        ctx.translate(-slideKick * 0.6, frameKick - slideKick);

        // Slide-kropp med metallgradient (ljusare upptill = highlight)
        const slideGradient = ctx.createLinearGradient(555, 515, 555, 558);
        slideGradient.addColorStop(0, "#3a3d3f");
        slideGradient.addColorStop(0.35, "#1c1e1f");
        slideGradient.addColorStop(1, "#0c0d0e");

        ctx.fillStyle = slideGradient;
        ctx.beginPath();
        ctx.moveTo(555, 525);
        ctx.lineTo(680, 525);
        ctx.lineTo(692, 555);
        ctx.lineTo(550, 555);
        ctx.closePath();
        ctx.fill();

        // Highlight-linje längs slidens ovankant
        ctx.strokeStyle = "rgba(180,190,195,.55)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(560, 527);
        ctx.lineTo(675, 527);
        ctx.stroke();

        // Ejection port (utkastningsöppning) på sidans slide
        ctx.fillStyle = "#050606";
        ctx.fillRect(600, 532, 30, 12);
        ctx.strokeStyle = "#2a2c2d";
        ctx.strokeRect(600, 532, 30, 12);

        // Räfflor bak på sliden (grepp för att dra tillbaka)
        ctx.strokeStyle = "#4d5253";
        ctx.lineWidth = 2;

        for (let x = 645; x < 678; x += 4) {
            ctx.beginPath();
            ctx.moveTo(x, 528);
            ctx.lineTo(x, 553);
            ctx.stroke();
        }

        // Pipa (syns i mynningen, mörkare rör)
        const barrelGradient = ctx.createLinearGradient(610, 546, 610, 560);
        barrelGradient.addColorStop(0, "#2a2c2d");
        barrelGradient.addColorStop(1, "#050606");

        ctx.fillStyle = barrelGradient;
        ctx.fillRect(610, 548, 65, 10);

        // Mynningsöppning (mörk cirkel)
        ctx.fillStyle = "#020303";
        ctx.beginPath();
        ctx.arc(675, 553, 5, 0, Math.PI * 2);
        ctx.fill();

        // Bakre sikte (notch)
        ctx.fillStyle = "#050606";
        ctx.fillRect(560, 517, 11, 10);
        ctx.fillStyle = "#8f9294";
        ctx.fillRect(563, 519, 2, 6);
        ctx.fillRect(567, 519, 2, 6);

        // Främre sikte (post) med liten vit prick, klassisk 3-punkt-sikte
        ctx.fillStyle = "#050606";
        ctx.fillRect(667, 516, 4, 13);
        ctx.fillStyle = "#dcd48a";
        ctx.beginPath();
        ctx.arc(669, 519, 1.4, 0, Math.PI * 2);
        ctx.fill();

        // Hammer/hane bak på sliden
        ctx.fillStyle = "#242627";
        ctx.beginPath();
        ctx.arc(554, 538, 6, Math.PI * 0.3, Math.PI * 1.7);
        ctx.fill();

        ctx.restore(); // slut på slide-translate


        /* --- Mynningsflamma --- */

        if (muzzleFlash > 0) {

            const flashX = baseX + 60 - slideKick * 0.6;
            const flashY = baseY - slideKick;

            const flash = ctx.createRadialGradient(
                flashX, flashY, 2,
                flashX, flashY, 55
            );

            flash.addColorStop(0, "rgba(255,255,220,.95)");
            flash.addColorStop(.2, "rgba(255,190,70,.8)");
            flash.addColorStop(1, "rgba(255,80,10,0)");

            ctx.fillStyle = flash;
            ctx.beginPath();
            ctx.arc(flashX, flashY, 55, 0, Math.PI * 2);
            ctx.fill();

            // extra ljuskärna
            ctx.fillStyle = "rgba(255,250,235,.9)";
            ctx.beginPath();
            ctx.arc(flashX, flashY, 8, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }


    /* ---------- MESSAGE ---------- */

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


    /* ---------- GAME LOOP ---------- */

    function loop(now) {

        if (!running || destroyed) return;

        const dt = Math.min(.033, (now - lastFrame) / 1000);
        lastFrame = now;

        timeLeft -= dt;

        recoil *= Math.pow(.02, dt * 6);
        muzzleFlash -= dt * 8;
        shake *= Math.pow(.03, dt);

        ctx.clearRect(0, 0, WIDTH, HEIGHT);

        ctx.save();

        if (shake > .05) {
            ctx.translate(
                (Math.random() - .5) * shake * 3,
                (Math.random() - .5) * shake * 3
            );
        }

        drawRange();

        spawnTimer -= dt;

        if (spawnTimer <= 0) {
            spawnTarget();
            spawnTimer = .5 + Math.random() * .8;
        }

        updateTargets(dt);
        updateParticles(dt);
        updateShells(dt);
        updateFloatingTexts(dt);
        drawWeapon();

        ctx.restore();

        updateHUD();

        if (timeLeft <= 0) {
            timeLeft = 0;
            endGame();
            return;
        }

        rafId = requestAnimationFrame(loop);
    }


    /* ---------- START BUTTON ---------- */

    startButton.addEventListener("click", startGame);


    /* ---------- CANVAS SCALE ---------- */

    function resizeCanvas() {

        const rect = canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;

        // Skydda mot 0x0 om rutan inte är synlig/mätbar ännu
        const w = Math.max(1, rect.width);
        const h = Math.max(1, rect.height);

        canvas.width = w * ratio;
        canvas.height = h * ratio;

        ctx.setTransform(
            (w * ratio) / WIDTH,
            0,
            0,
            (h * ratio) / HEIGHT,
            0,
            0
        );
    }

    // ResizeObserver istället för window "resize": fångar även
    // storleksändringar när Kanvas-rutan dras/ändras i storlek,
    // inte bara när hela webbläsarfönstret ändras.
    let resizeObserver = null;

    if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(game);
    } else {
        window.addEventListener("resize", resizeCanvas);
    }

    resizeCanvas();
    updateHUD();


    /* ---------- CLEANUP ---------- */

    function cleanup() {

        if (destroyed) return;

        destroyed = true;
        running = false;

        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }

        clearTimeout(messageTimer);

        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerdown", onPointerDown);
        app.removeEventListener("keydown", onKeyDown);

        if (resizeObserver) {
            resizeObserver.disconnect();
        }

        if (mutationObserver) {
            mutationObserver.disconnect();
        }

        if (app.parentElement) {
            app.parentElement.removeChild(app);
        }

        if (style.parentElement) {
            style.parentElement.removeChild(style);
        }

        delete mount.__shootingRangeCleanup;
    }

    // Om Kanvas rutans "■ Stoppa"-knapp finns i samma DOM och tar
    // bort rutans element ur trädet, städar vi automatiskt upp.
    let mutationObserver = null;

    if (typeof MutationObserver !== "undefined" && app.parentElement) {

        mutationObserver = new MutationObserver(function () {

            if (!document.body.contains(app)) {
                cleanup();
            }
        });

        mutationObserver.observe(mount, { childList: true });
    }

    // Publikt kopplingsställe ifall Kanvas vill anropa städningen
    // manuellt (t.ex. från en egen "Stoppa"-knapp i sitt UI):
    mount.__shootingRangeCleanup = cleanup;
    app.kanvasStop = cleanup;

})();
