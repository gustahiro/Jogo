const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const healthEl = document.getElementById('health');
const scoreEl = document.getElementById('score');
const gameOverEl = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const startMenuEl = document.getElementById('start-menu');
const startBtn = document.getElementById('start-btn');
const statsEl = document.getElementById('stats');
const highScoreEl = document.getElementById('high-score');
const pauseBtn = document.getElementById('pause-btn');
const pauseMenuEl = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const menuBtnPause = document.getElementById('menu-btn-pause');
const menuBtnOver = document.getElementById('menu-btn-over');
const specialCdEl = document.getElementById('special-cd');

let highScore = localStorage.getItem('sengokuHighScore') || 0;
if (highScoreEl) highScoreEl.innerText = highScore;

let isPaused = false;
let isMainMenu = true;
let loopId = null;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Input state
const keys = { w: false, a: false, s: false, d: false, e: false, " ": false, shift: false };
const keysOnThisFrame = { " ": false, shift: false, e: false };
let facingRight = true;

window.addEventListener('keydown', e => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) {
        if (!keys[e.key.toLowerCase()]) keysOnThisFrame[e.key.toLowerCase()] = true;
        keys[e.key.toLowerCase()] = true;
    }
    if (e.key === ' ') {
        if (!keys[" "]) keysOnThisFrame[" "] = true;
        keys[" "] = true;
    }
    if (e.key === 'Shift') {
        if (!keys["shift"]) keysOnThisFrame["shift"] = true;
        keys["shift"] = true;
    }
    if (e.key === 'e' || e.key === 'E') {
        if (!keys["e"]) keysOnThisFrame["e"] = true;
        keys["e"] = true;
    }
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        togglePause();
    }
});
window.addEventListener('keyup', e => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
    if (e.key === ' ') keys[" "] = false;
    if (e.key === 'Shift') keys["shift"] = false;
    if (e.key === 'e' || e.key === 'E') keys["e"] = false;
});

// Game State
let isGameOver = false;
let score = 0;
let health = 5;
let lastTime = 0;
let camera = { x: 0, y: 0 };

// World/Collision geometry
const platforms = [];

function generateWorld() {
    platforms.length = 0;
    // Ground (wide battlefield)
    platforms.push({ x: -800, y: 600, w: 3800, h: 800 });

    // Floating Scaffolds / Wood Platforms
    platforms.push({ x: 300, y: 450, w: 200, h: 40, type: 'wood' });
    platforms.push({ x: 650, y: 350, w: 250, h: 40, type: 'wood' });
    platforms.push({ x: 100, y: 250, w: 150, h: 40, type: 'wood' });
    platforms.push({ x: 1050, y: 450, w: 300, h: 40, type: 'wood' });
    platforms.push({ x: 1400, y: 300, w: 200, h: 40, type: 'wood' });

    // Invisible Walls to prevent falling off the "island"
    platforms.push({ x: -850, y: -1000, w: 50, h: 2500, invisible: true });
    platforms.push({ x: 3000, y: -1000, w: 50, h: 2500, invisible: true });
}

// AABB Collision check
function rectIntersect(r1, r2) {
    return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;
}

// Entities
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 34;
        this.h = 48; // Bounding box for farmer
        this.vx = 0;
        this.vy = 0;

        // Physics logic
        this.gravity = 1800;
        this.speed = 1500;
        this.maxSpeed = 350;
        this.friction = 0.82; // Slippery/tightness
        this.jumpForce = -750;
        this.isGrounded = false;

        // Dash
        this.isDashing = false;
        this.dashSpeed = 900;
        this.dashTime = 0;
        this.dashDuration = 0.15;
        this.dashCooldown = 0;
        this.dashCooldownDuration = 0.6;

        // Dash Attack
        this.isDashAttacking = false;
        this.dashAttackCooldown = 0;
        this.dashAttackCooldownDuration = 3.0; // 3 secs cooldown

        // Combat
        this.attackState = 0; // 0=ready, 1=swinging, 2=cooldown
        this.swingTime = 0;
        this.swingDuration = 0.15; // Fast Hollow Knight nail swings
        this.attackCooldown = 0;
        this.attackCooldownDuration = 0.25;
        this.attackDir = { x: 1, y: 0 }; // 1=right, -1=left, 2=up, 3=down
        this.swordLength = 70;
        this.swordArc = Math.PI * 0.8;

        this.invulnerableTimer = 0;
        this.knockbackTime = 0;
    }

    update(dt) {
        if (this.invulnerableTimer > 0) this.invulnerableTimer -= dt;
        if (this.dashCooldown > 0) this.dashCooldown -= dt;

        if (this.dashAttackCooldown > 0) {
            this.dashAttackCooldown -= dt;
            let secs = Math.ceil(this.dashAttackCooldown);
            if (specialCdEl && specialCdEl.innerText !== secs + 's') specialCdEl.innerText = secs + 's';
        } else {
            if (specialCdEl && specialCdEl.innerText !== 'Pronto') specialCdEl.innerText = 'Pronto';
        }

        // Attack input processing
        if (this.attackState === 0 && keysOnThisFrame[" "] && this.knockbackTime <= 0) {
            this.attackState = 1;
            this.swingTime = 0;

            // Determine direction
            if (keys.w) {
                this.attackDir = { x: 0, y: -1 }; // Up slash
            } else if (keys.s && !this.isGrounded) {
                this.attackDir = { x: 0, y: 1 };  // Down pogo
            } else {
                this.attackDir = { x: facingRight ? 1 : -1, y: 0 }; // Forward slash
            }
        }

        // Attack logic
        if (this.attackState === 1) {
            this.swingTime += dt;

            // Melee Hitbox check
            const swordCenter = {
                x: this.x + this.w / 2 + this.attackDir.x * (this.w / 2 + 20),
                y: this.y + this.h / 2 + this.attackDir.y * (this.h / 2 + 20)
            };

            for (let i = enemies.length - 1; i >= 0; i--) {
                let enemy = enemies[i];
                let dist = Math.hypot(swordCenter.x - (enemy.x + enemy.w / 2), swordCenter.y - (enemy.y + enemy.h / 2));
                if (dist < 60 + enemy.w / 2 && !enemy.isDead && enemy.knockbackTime <= 0) { // Hit!
                    createHitSparks(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
                    enemy.takeDamage(1, this.attackDir);

                    // Pogo bounce! (Hollow Knight mechanic)
                    if (this.attackDir.y === 1) { // Down slash hit
                        this.vy = this.jumpForce * 0.8; // Bounce up
                        this.dashCooldown = 0; // Reset dash on pogo!
                    }
                }
            }

            if (this.swingTime >= this.swingDuration) {
                this.attackState = 2; // cooldown
                this.attackCooldown = this.attackCooldownDuration;
            }
        } else if (this.attackState === 2) {
            this.attackCooldown -= dt;
            if (this.attackCooldown <= 0) {
                this.attackState = 0;
            }
        }

        // Dash Initiation
        if (keysOnThisFrame["shift"] && this.dashCooldown <= 0 && !this.isDashing && !this.isDashAttacking && this.knockbackTime <= 0) {
            this.isDashing = true;
            this.dashTime = this.dashDuration;
            this.dashCooldown = this.dashCooldownDuration;
            this.vy = 0; // Stall gravity
        }

        // Dash Attack Initiation
        if (keysOnThisFrame["e"] && this.dashAttackCooldown <= 0 && !this.isDashing && !this.isDashAttacking && this.knockbackTime <= 0) {
            this.isDashAttacking = true;
            this.dashTime = 0.25; // slightly longer than normal dash
            this.dashAttackCooldown = this.dashAttackCooldownDuration;
            this.vy = 0;
        }

        // Movement & Physics
        if (this.knockbackTime > 0) {
            this.knockbackTime -= dt;
            this.vy += this.gravity * dt; // Gravity still applies during knockback
        } else if (this.isDashing || this.isDashAttacking) {
            this.dashTime -= dt;
            this.vx = facingRight ? this.dashSpeed : -this.dashSpeed;
            if (this.isDashAttacking) this.vx *= 1.25; // dash attack is faster
            this.vy = 0; // No gravity while dashing
            createDashParticles(this.x + this.w / 2, this.y + this.h / 2, facingRight ? -1 : 1);

            // IF DASH ATTACKING -> Hit Check
            if (this.isDashAttacking) {
                for (let i = enemies.length - 1; i >= 0; i--) {
                    let enemy = enemies[i];
                    let dist = Math.hypot((this.x + this.w / 2) - (enemy.x + enemy.w / 2), (this.y + this.h / 2) - (enemy.y + enemy.h / 2));
                    // Hit!
                    if (dist < 60 + enemy.w / 2 && !enemy.isDead && enemy.knockbackTime <= 0) {
                        createHitSparks(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
                        enemy.takeDamage(3, { x: facingRight ? 1 : -1, y: 0 }); // 3 damage instantly

                        // Small freeze/stall on hit? (optional hk mechanic, we skip for now)
                    }
                }
            }

            if (this.dashTime <= 0) {
                this.isDashing = false;
                this.isDashAttacking = false;
                this.vx = facingRight ? this.maxSpeed : -this.maxSpeed;
            }
        } else {
            // Normal Horizontal movement
            if (keys.a) {
                this.vx -= this.speed * dt;
                facingRight = false;
            } else if (keys.d) {
                this.vx += this.speed * dt;
                facingRight = true;
            } else {
                this.vx *= this.friction;
            }
            this.vx = Math.max(-this.maxSpeed, Math.min(this.maxSpeed, this.vx));

            // Gravity
            this.vy += this.gravity * dt;
            this.vy = Math.min(this.vy, 1000); // Terminal velocity

            // Jump
            if (keysOnThisFrame.w && this.isGrounded) {
                this.vy = this.jumpForce;
                this.isGrounded = false;
            } else if (!keys.w && this.vy < 0) {
                // Variable jump height (release jump to fall faster)
                this.vy *= 0.5; // Cut velocity
                keysOnThisFrame.w = false; // consume it so it doesn't trigger repeatedly
            }
        }

        // Apply velocities and Handle Collisions X
        this.x += this.vx * dt;
        let playerRect = { x: this.x, y: this.y, w: this.w, h: this.h };
        for (let p of platforms) {
            if (rectIntersect(playerRect, p)) {
                if (this.vx > 0) {
                    this.x = p.x - this.w;
                    this.vx = 0;
                } else if (this.vx < 0) {
                    this.x = p.x + p.w;
                    this.vx = 0;
                }
            }
        }
        playerRect.x = this.x; // update after x collision

        // Handle Collisions Y
        this.y += this.vy * dt;
        playerRect.y = this.y;
        this.isGrounded = false;

        for (let p of platforms) {
            if (rectIntersect(playerRect, p)) {
                if (this.vy > 0) { // falling
                    this.y = p.y - this.h;
                    this.vy = 0;
                    this.isGrounded = true;
                } else if (this.vy < 0) { // jumping up hitting ceiling
                    this.y = p.y + p.h;
                    this.vy = 0;
                }
            }
        }

        // Death by falling off screen
        if (this.y > 1500) {
            takeDamage(5); // Insta death
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x + this.w / 2, this.y + this.h / 2); // Center

        if (this.invulnerableTimer > 0 && Math.floor(performance.now() / 100) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        // 3D-like movement and breathing
        let time = performance.now() * 0.005;
        let breathX = 1.0;
        let breathY = 1.0;
        
        // Breathing squash and stretch when idle
        if (this.isGrounded && Math.abs(this.vx) < 10 && this.attackState === 0) {
            breathX = 1.0 + Math.sin(time) * 0.03;
            breathY = 1.0 - Math.sin(time) * 0.04;
        }
        
        // Leaning into movement (Pseudo-3D rotation)
        let lean = 0;
        if (!this.isGrounded) lean = (this.vy * 0.0004);
        if (Math.abs(this.vx) > 10) lean += (this.vx * 0.0003);
        ctx.rotate(lean);

        // Walk bobbing translation
        if (this.isGrounded && Math.abs(this.vx) > 10) {
            let bob = Math.abs(Math.sin(time * 3)) * 4;
            ctx.translate(0, -bob);
        }

        // Draw Player (Samurai)
        // Flip context if facing left and apply breathing
        if (!facingRight) {
            ctx.scale(-breathX, breathY);
        } else {
            ctx.scale(breathX, breathY);
        }

        // Flowing Cloak/Scarf (Hollow Knight style)
        ctx.fillStyle = '#11131a';
        ctx.beginPath();
        let clothSway = Math.sin(performance.now() * 0.005) * 8;
        if (!this.isGrounded) clothSway = -15;
        if (Math.abs(this.vx) > 50) clothSway = -20;
        ctx.moveTo(-5, -15);
        ctx.quadraticCurveTo(-20 + clothSway, 0, -15 + clothSway, 20);
        ctx.lineTo(-5 + clothSway, 22);
        ctx.lineTo(10, 5);
        ctx.fill();

        // Legs (Dark Hakama)
        ctx.fillStyle = '#21252b';
        ctx.fillRect(-12, 5, 24, 19);

        // Torso/Armor (Darker faded Red)
        ctx.fillStyle = '#611a1a';
        ctx.fillRect(-15, -10, 30, 15);

        // Armor details (pale silver instead of gold)
        ctx.fillStyle = '#859ca2';
        ctx.fillRect(-15, -5, 30, 2);
        ctx.fillRect(-15, 0, 30, 2);

        // Head (Skin tone)
        ctx.fillStyle = '#ffcc80';
        ctx.fillRect(-10, -26, 20, 16);

        // Helmet (Kabuto)
        ctx.fillStyle = '#333333';
        ctx.fillRect(-14, -32, 28, 12); // Dome
        ctx.fillRect(-18, -26, 36, 4);  // Brim

        // Helmet Crest (Kuwagata)
        ctx.fillStyle = '#ffca28';
        ctx.beginPath();
        ctx.moveTo(0, -32);
        ctx.lineTo(-10, -42);
        ctx.lineTo(-5, -30);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -32);
        ctx.lineTo(10, -42);
        ctx.lineTo(5, -30);
        ctx.fill();

        // One-armed stump (Front arm is missing)
        ctx.fillStyle = '#b71c1c'; // armor sleeve
        ctx.fillRect(8, -8, 8, 8);
        ctx.fillStyle = '#7f0000'; // stump/bandage
        ctx.fillRect(10, 0, 4, 4);

        // Draw Sword Swipes
        if (this.isDashAttacking) {
            ctx.save();

            // Draw red glowing aura
            ctx.fillStyle = 'rgba(255, 60, 60, 0.4)';
            ctx.fillRect(-35, -20, 70, 48);

            // Draw sword pointing straight forward
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(this.swordLength + 20, 0); // extra long reach
            ctx.lineWidth = 14;
            ctx.strokeStyle = '#ffd700'; // Gold blade
            ctx.lineCap = 'round';
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(this.swordLength + 20, 0);
            ctx.lineWidth = 6;
            ctx.strokeStyle = '#fff';
            ctx.stroke();

            ctx.restore();
        } else if (this.attackState === 1) {
            ctx.save();
            const progress = this.swingTime / this.swingDuration;

            // Reorient based on actual attackDir!
            // Remember ctx is scaled to face right already, but attackDir could be left/right/up/down.
            // Actually, if we are facing left, the scale(-1,1) flipped X.
            // If attackDir.y != 0, we rotate.
            if (this.attackDir.x === 0 && this.attackDir.y === -1) { // Up
                ctx.rotate(-Math.PI / 2);
            } else if (this.attackDir.x === 0 && this.attackDir.y === 1) { // Down
                ctx.rotate(Math.PI / 2);
            }

            // Sword Arc
            const startAngle = -this.swordArc / 2;
            const currentAngle = startAngle + (this.swordArc * progress);

            ctx.rotate(currentAngle);

            // Draw swipe trail
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, this.swordLength, -0.2, 0);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fill();

            // The Blade itself (Legendary yellow/gold)
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(this.swordLength, 0);
            ctx.lineWidth = 10;
            ctx.strokeStyle = '#ffd700';
            ctx.lineCap = 'round';
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(this.swordLength, 0);
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#fff';
            ctx.stroke();

            ctx.restore();
        } else {
            // Sword resting on back
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(-6, -20, 12, 40);
        }

        ctx.restore();
    }
}

class Ninja {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 32;
        this.h = 40;
        this.vx = (Math.random() < 0.5 ? -1 : 1) * 150;
        this.vy = 0;
        this.gravity = 1500;
        this.isGrounded = false;
        this.jumpTimer = Math.random() * 2;

        this.color = '#1a1a1a'; // Dark ninja suit
        this.isDead = false;
        this.knockbackTime = 0;
        this.health = 1;
    }

    takeDamage(amount, direction) {
        this.health -= amount;
        this.knockbackTime = 0.2;
        this.vx = direction.x * 300; // Knockback
        this.vy = direction.y !== 0 ? direction.y * 300 : -200; // Pop up

        if (this.health <= 0) {
            this.isDead = true;
            score++;
            scoreEl.innerText = score;
            updateHighScore();

            // Health boost every 10 enemies
            if (score === 10 || score === 20) {
                // Capping health to maximum 5
                health = Math.min(maxHealth, health + 2);
                healthEl.innerText = health;
                // Green heal particles
                for (let j = 0; j < 20; j++) {
                    particles.push(new Particle(player.x + 17, player.y + 24, (Math.random() - 0.5) * 200, -100 - Math.random() * 200, '#4caf50', 0.8));
                }
            }
        }
    }

    update(dt) {
        if (this.isDead) return;

        if (this.knockbackTime > 0) {
            this.knockbackTime -= dt;
        } else {
            // Ninja jumping/dashing behavior
            this.jumpTimer -= dt;
            if (this.jumpTimer <= 0 && this.isGrounded) {
                this.vy = -600; // Jump!
                this.jumpTimer = 1.0 + Math.random();

                // Track player
                if (player.x < this.x) {
                    this.vx = -180;
                } else {
                    this.vx = 180;
                }
            } else if (this.isGrounded) {
                // Apply friction on ground
                this.vx *= 0.9;
            }
        }

        // Gravity
        this.vy += this.gravity * dt;

        // Apply & collisions X
        this.x += this.vx * dt;
        let rect = { x: this.x, y: this.y, w: this.w, h: this.h };
        for (let p of platforms) {
            if (rectIntersect(rect, p)) {
                if (this.vx > 0) { this.x = p.x - this.w; this.vx *= -1; }
                else if (this.vx < 0) { this.x = p.x + p.w; this.vx *= -1; }
            }
        }
        rect.x = this.x;

        // Collisions Y
        this.y += this.vy * dt;
        rect.y = this.y;
        this.isGrounded = false;
        for (let p of platforms) {
            if (rectIntersect(rect, p)) {
                if (this.vy > 0) { this.y = p.y - this.h; this.vy = 0; this.isGrounded = true; }
                else if (this.vy < 0) { this.y = p.y + p.h; this.vy = 0; }
            }
        }

        // Damage Player
        if (rectIntersect(player, { x: this.x, y: this.y, w: this.w, h: this.h }) && player.invulnerableTimer <= 0 && player.dashTime <= 0) {
            let knockDir = { x: player.x < this.x ? -1 : 1, y: -1 };
            takeDamage(1);
            player.vx = knockDir.x * 500;
            player.vy = knockDir.y * 300;
            player.knockbackTime = 0.2;
        }

        // Prevent falling forever
        if (this.y > 1500) this.isDead = true;
    }

    draw() {
        if (this.isDead) return;
        ctx.save();
        ctx.translate(this.x + this.w / 2, this.y + this.h);

        let scaleY = 1;
        let scaleX = 1;
        
        let time = performance.now() * 0.005;

        // 3D-like breathing and lean
        if (this.isGrounded && Math.abs(this.vx) < 10) {
            scaleX += Math.sin(time + this.x) * 0.04;
            scaleY -= Math.sin(time + this.x) * 0.05;
        }

        if (!this.isGrounded) {
            scaleY = 1.1;
            scaleX = 0.9;
        } else if (this.knockbackTime > 0) {
            scaleY = 0.9;
            scaleX = 1.1;
        }
        
        // Lean into jump/run direction
        let lean = (this.vx * 0.001);
        ctx.rotate(lean);

        // Walking bob
        if (this.isGrounded && Math.abs(this.vx) > 10) {
            let bob = Math.abs(Math.sin(time * 3)) * 4;
            ctx.translate(0, -bob);
        }

        let facingRight = this.vx > 0;
        if (!facingRight) {
            ctx.scale(-scaleX, scaleY);
        } else {
            ctx.scale(scaleX, scaleY);
        }

        // Ninja body (Black suit)
        ctx.fillStyle = this.color;
        // Legs
        ctx.fillRect(-10, -15, 20, 15);
        // Torso
        ctx.fillRect(-12, -30, 24, 15);
        // Head
        ctx.fillRect(-10, -45, 20, 15);

        // Headband / mask opening
        ctx.fillStyle = '#ffcc80'; // skin
        ctx.fillRect(0, -40, 10, 6);

        // Eye
        ctx.fillStyle = '#fff';
        ctx.fillRect(4, -39, 4, 4);
        ctx.fillStyle = '#f00'; // red glowing eye
        ctx.fillRect(5, -38, 2, 2);

        // Scarf (Red)
        ctx.fillStyle = '#d32f2f';
        ctx.fillRect(-14, -30, 28, 4);
        ctx.fillRect(-18, -32, 8, 12);

        ctx.restore();
    }
}

class Particle {
    constructor(x, y, vx, vy, color, life) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.size = Math.random() * 4 + 2;
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
    }
    draw() {
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.globalAlpha = 1.0;
    }
}

class HondaTadakatsu {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 32;
        this.h = 50;
        this.vx = 0;
        this.vy = 0;
        this.gravity = 1800;
        this.isGrounded = false;

        this.state = 'idle';
        this.stateTimer = 1.0;
        this.dashSpeed = 500; // was 700
        this.runSpeed = 160;  // was 220

        this.color = '#111';
        this.isDead = false;
        this.knockbackTime = 0;
        this.health = 8;
    }

    takeDamage(amount, direction) {
        this.health -= amount;
        this.knockbackTime = 0.2;
        this.vx = direction.x * 100;
        this.vy = direction.y !== 0 ? direction.y * 50 : -100;

        if (this.health <= 0) {
            this.isDead = true;
            score += 100;
            scoreEl.innerText = score;
            updateHighScore();
            triggerVictory();
        }
    }

    update(dt) {
        if (this.isDead) return;

        if (this.knockbackTime > 0) {
            this.knockbackTime -= dt;
        } else {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                let rand = Math.random();
                if (rand < 0.4) {
                    this.state = 'chase';
                    this.stateTimer = 1.8 + Math.random();
                } else if (rand < 0.7 && this.isGrounded) {
                    this.state = 'jump';
                    this.vy = -650;
                    this.stateTimer = 0.5;
                    this.vx = (player.x < this.x ? -1 : 1) * 250;
                } else if (rand <= 1.0) {
                    this.state = 'dash';
                    this.stateTimer = 0.4;
                    this.vx = (player.x < this.x ? -1 : 1) * this.dashSpeed;
                }
            }

            if (this.state === 'chase' && this.isGrounded) {
                if (player.x < this.x - 20) this.vx = -this.runSpeed;
                else if (player.x > this.x + 20) this.vx = this.runSpeed;
                else this.vx *= 0.8;
            } else if (this.state === 'jump') {
                if (this.isGrounded && this.vy >= 0) {
                    this.state = 'idle';
                    this.stateTimer = 0.2;
                    this.vx = 0;
                }
            } else if (this.state === 'dash') {
                if (Math.random() < 0.3) {
                    createDashParticles(this.x + this.w / 2, this.y + this.h / 2, this.vx > 0 ? -1 : 1);
                }
            } else if (this.state === 'idle') {
                if (this.isGrounded) this.vx *= 0.8;
            }
        }

        this.vy += this.gravity * dt;

        this.x += this.vx * dt;
        let rect = { x: this.x, y: this.y, w: this.w, h: this.h };
        for (let p of platforms) {
            if (rectIntersect(rect, p)) {
                if (this.vx > 0) { this.x = p.x - this.w; this.vx *= -0.5; }
                else if (this.vx < 0) { this.x = p.x + p.w; this.vx *= -0.5; }
            }
        }
        rect.x = this.x;

        this.y += this.vy * dt;
        rect.y = this.y;
        this.isGrounded = false;
        for (let p of platforms) {
            if (rectIntersect(rect, p)) {
                if (this.vy > 0) { this.y = p.y - this.h; this.vy = 0; this.isGrounded = true; }
                else if (this.vy < 0) { this.y = p.y + p.h; this.vy = 0; }
            }
        }

        if (rectIntersect(player, { x: this.x, y: this.y, w: this.w, h: this.h }) && player.invulnerableTimer <= 0 && player.dashTime <= 0) {
            let knockDir = { x: player.x < this.x ? -1 : 1, y: -1 };
            takeDamage(1);
            player.vx = knockDir.x * 600;
            player.vy = knockDir.y * 400;
            player.knockbackTime = 0.25;
        }

        if (this.y > 1500) this.isDead = true;
    }

    draw() {
        if (this.isDead) return;
        ctx.save();
        ctx.translate(this.x + this.w / 2, this.y + this.h);

        let scaleY = 1;
        let scaleX = 1;
        let time = performance.now() * 0.005;

        if (this.state === 'idle') {
            scaleX += Math.sin(time) * 0.03;
            scaleY -= Math.sin(time) * 0.03;
        }

        if (!this.isGrounded) {
            scaleY = 1.05;
            scaleX = 0.95;
        } else if (this.knockbackTime > 0) {
            scaleY = 0.95;
            scaleX = 1.05;
        } else if (this.state === 'dash') {
            scaleY = 0.9;
            scaleX = 1.1;
        }
        
        let lean = (this.vx * 0.0008);
        if (this.state === 'jump') lean = this.vx * 0.0004;
        ctx.rotate(lean);

        // Heavy walking bob
        if (this.state === 'chase' && this.isGrounded) {
            let bob = Math.abs(Math.sin(time * 3)) * 6;
            ctx.translate(0, -bob);
        }

        let facingRight = (player.x > this.x);
        if (this.state === 'dash') facingRight = this.vx > 0;
        
        if (!facingRight) {
            ctx.scale(-scaleX, scaleY);
        } else {
            ctx.scale(scaleX, scaleY);
        }

        ctx.fillStyle = '#111'; // Black cape
        ctx.beginPath();
        let flutter = Math.sin(performance.now() * 0.01) * 5;
        if (this.state === 'dash' || !this.isGrounded) flutter = -15;
        ctx.moveTo(-10, -50);
        ctx.lineTo(-30 + flutter, -10);
        ctx.lineTo(-20 + flutter, 0);
        ctx.lineTo(-10, -20);
        ctx.fill();

        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.ellipse(0, -25, 14, 25, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffb300';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, -35); ctx.lineTo(10, -30);
        ctx.moveTo(-12, -25); ctx.lineTo(12, -20);
        ctx.moveTo(-10, -15); ctx.lineTo(10, -10);
        ctx.stroke();

        ctx.fillStyle = '#e0e0e0';
        ctx.beginPath();
        ctx.moveTo(-12, -60);
        ctx.quadraticCurveTo(0, -65, 12, -60);
        ctx.lineTo(10, -45);
        ctx.quadraticCurveTo(0, -38, -10, -45);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#0a0a0a';
        ctx.beginPath();
        ctx.ellipse(-4, -50, 3, 5, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(6, -50, 4, 6, 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f00';
        ctx.beginPath();
        ctx.arc(6, -50, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffb300';
        ctx.beginPath();
        ctx.moveTo(-10, -58);
        ctx.quadraticCurveTo(-25, -75, -15, -90);
        ctx.lineTo(-12, -80);
        ctx.lineTo(-5, -60);
        ctx.moveTo(10, -58);
        ctx.quadraticCurveTo(25, -75, 15, -90);
        ctx.lineTo(12, -80);
        ctx.lineTo(5, -60);
        ctx.fill();

        ctx.strokeStyle = '#5d4037';
        ctx.lineWidth = 4;
        ctx.beginPath();
        if (this.state === 'dash' || this.state === 'chase') {
            ctx.moveTo(-10, -20);
            ctx.lineTo(40, -15);
            ctx.fillStyle = '#e0e0e0';
            ctx.beginPath();
            ctx.moveTo(40, -15);
            ctx.lineTo(55, -15);
            ctx.lineTo(45, -10);
            ctx.fill();
        } else {
            ctx.moveTo(15, 0);
            ctx.lineTo(25, -60);
            ctx.fillStyle = '#e0e0e0';
            ctx.beginPath();
            ctx.moveTo(25, -60);
            ctx.lineTo(28, -85);
            ctx.lineTo(22, -75);
            ctx.fill();
        }

        ctx.restore();
    }
}

let player;
let enemies = [];
let particles = [];
let enemySpawnTimer = 0;
let bossSpawned = false;
let maxHealth = 5;

function createHitSparks(x, y) {
    for (let i = 0; i < 15; i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 300 + 100;
        particles.push(new Particle(
            x, y,
            Math.cos(angle) * speed, Math.sin(angle) * speed,
            Math.random() > 0.5 ? '#fff' : '#ffd700', // Sparkles
            0.3 + Math.random() * 0.2
        ));
    }
}

function createDashParticles(x, y, dirX) {
    if (Math.random() < 0.5) return;
    particles.push(new Particle(
        x + (Math.random() - 0.5) * 30,
        y + (Math.random() - 0.5) * 30,
        dirX * 50, (Math.random() - 0.5) * 50,
        'rgba(255, 255, 255, 0.5)',
        0.2
    ));
}

function takeDamage(amount) {
    health -= amount;
    healthEl.innerText = Math.max(0, health);
    player.invulnerableTimer = 1.5;

    // Heart break particles
    for (let i = 0; i < 20; i++) {
        particles.push(new Particle(player.x + 17, player.y + 24, (Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400, '#e53935', 0.5));
    }

    if (health <= 0) {
        endGame();
    }
}

function spawnEnemy() {
    if (bossSpawned) return; // Stop spawning regular enemies when boss is around

    if (score >= 30) {
        // Spawn Honda Tadakatsu
        let spawnX = player.x > 500 ? player.x - 400 : player.x + 400;
        let spawnY = 550; // Near ground

        enemies.push(new HondaTadakatsu(spawnX, spawnY));
        bossSpawned = true;

        // Full heal player
        health = maxHealth;
        healthEl.innerText = health;
        for (let j = 0; j < 30; j++) {
            particles.push(new Particle(player.x + 17, player.y + 24, (Math.random() - 0.5) * 300, -200 - Math.random() * 300, '#4caf50', 1.0));
        }

        // Huge dark smoke explosion to announce the boss
        for (let i = 0; i < 50; i++) {
            particles.push(new Particle(spawnX + 16, spawnY + 24, (Math.random() - 0.5) * 600, (Math.random() - 0.5) * 600, '#0a0a0a', 1.0));
            particles.push(new Particle(spawnX + 16, spawnY + 24, (Math.random() - 0.5) * 600, (Math.random() - 0.5) * 600, '#ffb300', 0.6));
        }
        return;
    }

    // Filter invisible walls from spawning choices
    let visiblePlatforms = platforms.filter(plat => !plat.invisible);
    let p = visiblePlatforms[Math.floor(Math.random() * visiblePlatforms.length)];

    // Don't spawn too close to player
    let spawnX = p.x + Math.random() * p.w;
    let spawnY = p.y - 40;

    if (Math.abs(spawnX - player.x) > 300) {
        enemies.push(new Ninja(spawnX, spawnY));
    }
}

function init() {
    isMainMenu = false;
    isPaused = false;
    startMenuEl.classList.add('hidden');
    statsEl.classList.remove('hidden');
    gameOverEl.classList.add('hidden');
    pauseMenuEl.classList.add('hidden');
    pauseBtn.classList.remove('hidden');

    highScoreEl.innerText = highScore;

    generateWorld();

    player = new Player(400, 400); // Start position
    enemies = [];
    particles = [];
    score = 0;
    maxHealth = 5;
    health = maxHealth;
    isGameOver = false;
    bossSpawned = false;

    scoreEl.innerText = score;
    healthEl.innerText = health;

    // Initial enemies
    for (let i = 0; i < 3; i++) spawnEnemy();

    lastTime = performance.now();
    if (loopId) cancelAnimationFrame(loopId);
    loopId = requestAnimationFrame(gameLoop);
}

function endGame() {
    isGameOver = true;
    pauseBtn.classList.add('hidden');
    updateHighScore();
    gameOverEl.classList.remove('hidden');

    // Reset style to Death screen
    gameOverEl.querySelector('h2').innerText = "Você morreu";
    gameOverEl.querySelector('p').innerText = "Os inimigos da era Sengoku tomaram conta do vilarejo.";
    gameOverEl.style.backgroundColor = "#8e5539";
    gameOverEl.style.borderColor = "#4a2f1d";

    finalScoreEl.innerText = score;
}

function triggerVictory() {
    isGameOver = true;
    pauseBtn.classList.add('hidden');
    updateHighScore();
    gameOverEl.classList.remove('hidden');

    // Change style to Victory screen
    gameOverEl.querySelector('h2').innerText = "Vitória!";
    gameOverEl.querySelector('p').innerText = "Você derrotou Honda Tadakatsu e concluiu sua vingança!";
    gameOverEl.style.backgroundColor = "#4caf50";
    gameOverEl.style.borderColor = "#2e7d32";

    finalScoreEl.innerText = score;
}

function update(dt) {
    if (isGameOver) return;

    player.update(dt);

    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].update(dt);
        if (enemies[i].isDead) {
            // Leave a splash on the ground
            for (let j = 0; j < 10; j++) {
                particles.push(new Particle(enemies[i].x + Math.random() * 30, enemies[i].y + 20, (Math.random() - 0.5) * 100, -Math.random() * 150, enemies[i].color, 0.5));
            }
            enemies.splice(i, 1);
        }
    }

    // Camera follow (Lerp)
    let targetCamX = player.x - canvas.width / 2 + player.w / 2;
    let targetCamY = player.y - canvas.height / 2 + player.h / 2;

    // clamp camera Y so we don't see beneath the ground endlessly
    targetCamY = Math.min(targetCamY, 300);

    camera.x += (targetCamX - camera.x) * 5 * dt;
    camera.y += (targetCamY - camera.y) * 5 * dt;

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(dt);
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }

    // Ambient embers / fire particles
    if (Math.random() < 0.4) {
        particles.push(new Particle(
            camera.x + Math.random() * canvas.width,
            camera.y + canvas.height + 50, // floating up from bottom
            (Math.random() - 0.5) * 80, -50 - Math.random() * 100, // moving up
            Math.random() > 0.5 ? '#ff6600' : '#ffcc00', // orange/yellow embers
            2.0 + Math.random() * 2.0
        ));
    }

    enemySpawnTimer -= dt;
    if (enemySpawnTimer <= 0) {
        spawnEnemy();
        enemySpawnTimer = Math.max(1.0, 3.0 - (score * 0.05)); // Gets faster
    }

    // Reset keysOnThisFrame exactly here after all gameplay code has run!
    for (let k in keysOnThisFrame) keysOnThisFrame[k] = false;
}

function drawBackground() {
    // Dark ominous sky with smoky red gradient
    let skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    skyGrad.addColorStop(0, '#0a0505');
    skyGrad.addColorStop(1, '#3d1212');
    ctx.fillStyle = skyGrad; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camera.x * 0.05, -camera.y * 0.05);
    // Blood Moon
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(600, 300, 100, 0, Math.PI * 2);
    ctx.fill();
    // Smoke covering moon
    ctx.fillStyle = 'rgba(20, 10, 10, 0.6)';
    ctx.beginPath();
    ctx.arc(550, 350, 120, 0, Math.PI * 2);
    ctx.arc(680, 280, 100, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(-camera.x * 0.15, -camera.y * 0.15 + 100);
    // Distant hills/mountains with smoke
    ctx.fillStyle = '#140808';
    ctx.beginPath();
    ctx.moveTo(-500, 600);
    ctx.lineTo(100, 200);
    ctx.lineTo(400, 350);
    ctx.lineTo(800, 150);
    ctx.lineTo(1200, 400);
    ctx.lineTo(1800, 250);
    ctx.lineTo(2500, 600);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(-camera.x * 0.3, -camera.y * 0.3 + 250);
    // Japanese Village Houses Silhouettes
    ctx.fillStyle = '#0a0303';
    
    // Draw string of houses
    for(let i=0; i<30; i++) {
        let hx = -800 + i * 180 + ((i * 13) % 50); // Stable deterministic offset
        let pY = 400; // ground base
        
        // House base
        ctx.fillRect(hx, pY - 80, 100, 80);
        
        // Japanese curved roof
        ctx.beginPath();
        ctx.moveTo(hx - 20, pY - 80);
        ctx.quadraticCurveTo(hx + 50, pY - 120, hx + 120, pY - 80);
        ctx.fill();
        
        // Sometimes a second tier (pagoda style)
        if (i % 4 === 0) {
            ctx.fillRect(hx + 20, pY - 130, 60, 50);
            ctx.beginPath();
            ctx.moveTo(hx - 10, pY - 130);
            ctx.quadraticCurveTo(hx + 50, pY - 160, hx + 110, pY - 130);
            ctx.fill();
        }

        // Fire on the houses!
        let fireFlicker = Math.sin(performance.now() * 0.01 + i) * 10;
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.moveTo(hx + 20, pY - 80);
        ctx.lineTo(hx + 30 + fireFlicker, pY - 130 + fireFlicker);
        ctx.lineTo(hx + 50, pY - 80);
        ctx.fill();
        
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.moveTo(hx + 25, pY - 80);
        ctx.lineTo(hx + 30 + fireFlicker/2, pY - 110 + fireFlicker/2);
        ctx.lineTo(hx + 40, pY - 80);
        ctx.fill();

        ctx.fillStyle = '#0a0303'; // reset for next house
    }

    ctx.fillRect(-1000, 400, 5000, 400);
    ctx.restore();
}

function drawPlatforms() {
    for (let p of platforms) {
        if (p.invisible) continue;

        if (p.type === 'wood') {
            ctx.fillStyle = '#1c2430'; // dark metal/stone
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.fillStyle = '#121822';
            ctx.fillRect(p.x, p.y + 10, p.w, 4);
            ctx.fillRect(p.x, p.y + 20, p.w, 4);
        } else {
            // Ground (dark cavern ground)
            ctx.fillStyle = '#0e141d';
            ctx.fillRect(p.x, p.y, p.w, p.h);
            
            // Top surface (cold pale stone)
            ctx.fillStyle = '#223040';
            ctx.fillRect(p.x, p.y, p.w, 14);
        }
    }
}

function draw() {
    // Clear screen
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    drawPlatforms();

    particles.forEach(p => p.draw());
    enemies.forEach(e => e.draw());
    player.draw();

    ctx.restore();
}

function gameLoop(time) {
    if (isPaused || isGameOver || isMainMenu) return;

    let dt = (time - lastTime) / 1000;
    dt = Math.max(0, Math.min(dt, 0.05)); // prevent huge jumps/physics glitches and clamp negative drift
    lastTime = time;

    update(dt);
    draw();

    if (!isGameOver && !isPaused) {
        loopId = requestAnimationFrame(gameLoop);
    }
}

restartBtn.addEventListener('click', init);
startBtn.addEventListener('click', init);

function updateHighScore() {
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('sengokuHighScore', highScore);
        if (highScoreEl) highScoreEl.innerText = highScore;
    }
}

function togglePause() {
    if (isGameOver || isMainMenu) return;
    isPaused = !isPaused;
    if (isPaused) {
        pauseMenuEl.classList.remove('hidden');
        if (loopId) cancelAnimationFrame(loopId);
    } else {
        pauseMenuEl.classList.add('hidden');
        lastTime = performance.now(); // avoid huge dt skip
        if (loopId) cancelAnimationFrame(loopId); // Ensure no overlapping loops
        loopId = requestAnimationFrame(gameLoop);
    }
}
pauseBtn.addEventListener('click', togglePause);
resumeBtn.addEventListener('click', togglePause);

function backToMenu() {
    isGameOver = true;
    isMainMenu = true;
    isPaused = false;

    gameOverEl.classList.add('hidden');
    pauseMenuEl.classList.add('hidden');
    statsEl.classList.add('hidden');
    pauseBtn.classList.add('hidden');
    startMenuEl.classList.remove('hidden');

    updateHighScore();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMenuBg();
}
menuBtnPause.addEventListener('click', backToMenu);
menuBtnOver.addEventListener('click', backToMenu);

// Draw static background for start menu
function drawMenuBg() {
    let skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    skyGrad.addColorStop(0, '#0a0505');
    skyGrad.addColorStop(1, '#3d1212');
    ctx.fillStyle = skyGrad; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Blood Moon
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2 - 50, 120, 0, Math.PI * 2);
    ctx.fill();

    // Burning Village silhouettes for menu
    ctx.fillStyle = '#070303';
    ctx.fillRect(0, canvas.height - 150, canvas.width, 150);
    
    let numHouses = Math.ceil(canvas.width / 150);
    for(let i=0; i<numHouses; i++) {
        let hx = i * 150 + 20;
        let pY = canvas.height - 150;
        
        ctx.fillRect(hx, pY - 100, 100, 100);
        
        ctx.beginPath();
        ctx.moveTo(hx - 20, pY - 100);
        ctx.quadraticCurveTo(hx + 50, pY - 150, hx + 120, pY - 100);
        ctx.fill();
        
        // Fire
        let fireFlicker = Math.sin(performance.now() * 0.01 + i) * 10;
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.moveTo(hx + 30, pY - 100);
        ctx.lineTo(hx + 40 + fireFlicker, pY - 160 + fireFlicker);
        ctx.lineTo(hx + 70, pY - 100);
        ctx.fill();

        ctx.fillStyle = '#070303';
    }
}
drawMenuBg();
