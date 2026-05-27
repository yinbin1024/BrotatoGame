const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 1. 🚀 游戏无尽矩阵状态
let gameOver = false;
let isPaused = false; 
let score = 0;
let level = 1;
let exp = 0;
let expNeeded = 5;
let currentLoop = 1; // 当前循环大波次（每60斩升级一次）

// 2. 🚀 玩家属性（新增 baseProjectiles 弹道数量属性）
const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    size: 15,
    speed: 3.5,
    hp: 100,
    maxHp: 100,
    color: "#f39c12", 
    shootCooldown: 30, 
    shootTimer: 0,
    damage: 1,
    gunType: "pistol",
    baseProjectiles: 3 // 散弹枪的初始子弹数，后续可无限 +1 叠加
};

// 3. 🚀 动态进化道具池（重构：散弹枪变成可无限叠加弹道）
const shopItems = [
    { id: "speed", name: "👟 疾行土豆", desc: "移动速度提升 15%", effect: () => { player.speed *= 1.15; } },
    { id: "atkSpd", name: "⚔️ 疯狂加特林", desc: "射击速度提升 20%", effect: () => { player.shootCooldown = Math.max(6, player.shootCooldown * 0.8); } },
    { id: "maxHp", name: "🛡️ 防护壳", desc: "生命上限 +25 并补满血", effect: () => { player.maxHp += 25; player.hp = player.maxHp; } },
    { id: "damage", name: "🔥 尖刺外壳", desc: "子弹伤害提升 1 点", effect: () => { player.damage += 1; } },
    { 
        id: "shotgun", 
        name: "💥 散弹枪改装", 
        desc: "未解锁时激活散弹；已解锁则使散弹枪弹道数永久 +1！", 
        effect: () => { 
            if (player.gunType !== "shotgun") {
                player.gunType = "shotgun";
            } else {
                player.baseProjectiles += 1; // 🚀 可重复选择，弹道无限堆叠！
            }
        } 
    }
];

// 4. 游戏实体容器
const enemies = [];
const bullets = [];
const gems = [];

// 5. 输入控制监听（电脑键盘）
const keys = {};
window.addEventListener("keydown", (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener("keyup", (e) => keys[e.key.toLowerCase()] = false);

// 6. 输入控制监听（手机虚拟摇杆）
let joystick = { active: false, startX: 0, startY: 0, curX: 0, curY: 0, vx: 0, vy: 0 };

canvas.addEventListener("touchstart", (e) => {
    if (isPaused || gameOver) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const tx = (touch.clientX - rect.left) * (canvas.width / rect.width);
    const ty = (touch.clientY - rect.top) * (canvas.height / rect.height);
    
    if (tx < canvas.width / 2) {
        joystick.active = true;
        joystick.startX = tx;
        joystick.startY = ty;
        joystick.curX = tx;
        joystick.curY = ty;
    }
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
    if (!joystick.active || isPaused || gameOver) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    joystick.curX = (touch.clientX - rect.left) * (canvas.width / rect.width);
    joystick.curY = (touch.clientY - rect.top) * (canvas.height / rect.height);

    let dx = joystick.curX - joystick.startX;
    let dy = joystick.curY - joystick.startY;
    let dist = Math.hypot(dx, dy);
    let maxDist = 40;

    if (dist > maxDist) {
        dx = (dx / dist) * maxDist;
        dy = (dy / dist) * maxDist;
    }
    joystick.vx = dx / maxDist;
    joystick.vy = dy / maxDist;
}, { passive: false });

canvas.addEventListener("touchend", () => {
    joystick.active = false;
    joystick.vx = 0;
    joystick.vy = 0;
});
// 7. 🚀 玩家位移与无限叠加散射矩阵弹道算法
function updatePlayer() {
    let dx = 0;
    let dy = 0;

    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;

    if (dx !== 0 && dy !== 0) {
        dx *= 0.7071;
        dy *= 0.7071;
    }

    if (joystick.active) {
        dx = joystick.vx;
        dy = joystick.vy;
    }

    player.x += dx * player.speed;
    player.y += dy * player.speed;

    player.x = Math.max(player.size, Math.min(canvas.width - player.size, player.x));
    player.y = Math.max(player.size, Math.min(canvas.height - player.size, player.y));

    player.shootTimer++;
    if (player.shootTimer >= player.shootCooldown && enemies.length > 0) {
        let nearestEnemy = null;
        let minDist = Infinity;
        
        for (let enemy of enemies) {
            let d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
            if (d < minDist) {
                minDist = d;
                nearestEnemy = enemy;
            }
        }

        if (nearestEnemy) {
            let baseAngle = Math.atan2(nearestEnemy.y - player.y, nearestEnemy.x - player.x);
            
            if (player.gunType === "shotgun") {
                // 🚀 散弹枪无限叠加算法：根据弹道总数计算扇形夹角间隔
                const count = player.baseProjectiles;
                const spread = 0.18; // 每发子弹之间的弧度间隔
                const startAngle = baseAngle - ((count - 1) * spread) / 2;

                for (let i = 0; i < count; i++) {
                    let angle = startAngle + i * spread;
                    bullets.push({
                        x: player.x,
                        y: player.y,
                        vx: Math.cos(angle) * 7,
                        vy: Math.sin(angle) * 7,
                        size: 4
                    });
                }
            } else {
                // 普通手枪模式
                bullets.push({
                    x: player.x,
                    y: player.y,
                    vx: Math.cos(baseAngle) * 7,
                    vy: Math.sin(baseAngle) * 7,
                    size: 4
                });
            }
            player.shootTimer = 0;
        }
    }
}

// 8. 触发三选一商店函数
function triggerShop() {
    isPaused = true;
    const modal = document.getElementById("shopModal");
    const container = document.getElementById("itemContainer");
    container.innerHTML = "";

    const shuffled = [...shopItems].sort(() => 0.5 - Math.random());
    const selectedItems = shuffled.slice(0, 3);

    selectedItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "shop-card";
        
        // 🚀 动态显示当前的弹道加成情况
        let displayDesc = item.desc;
        if (item.id === "shotgun" && player.gunType === "shotgun") {
            displayDesc = `使当前的散弹枪攻击弹道数进化至：${player.baseProjectiles + 1} 发！`;
        }

        card.innerHTML = `
            <div class="item-name">${item.name}</div>
            <div class="item-desc">${displayDesc}</div>
        `;
        
        card.addEventListener("click", () => {
            item.effect();
            document.getElementById("hp").innerText = `生命值: ${Math.floor(player.hp)}/${player.maxHp}`;
            document.getElementById("level").innerText = `等级: ${level} (EXP: ${exp}/${expNeeded})`;
            
            modal.classList.add("hidden");
            isPaused = false;
            gameLoop();
        });
        container.appendChild(card);
    });

    modal.classList.remove("hidden");
}
// 9. 🚀 变异刷怪与无尽波次进化核心算法
let enemyTimer = 0;
let bossActive = false; // 全局追踪场上是否有 Boss

function spawnEnemies() {
    enemyTimer++;
    
    // 根据总击杀数计算当前应该处于第几轮大循环（每 60 斩为一个 Loop）
    currentLoop = 1 + Math.floor(score / 60);

    // 🚀 【阶段 A：Boss 降临判定】
    // 每当击杀数到达 60、120、180... 的整倍数时，且场上还没有这一轮的 Boss，直接强行降临
    const shouldSpawnBoss = (score > 0 && score % 60 === 0);
    if (shouldSpawnBoss && !bossActive) {
        enemies.push({
            type: "boss",
            x: canvas.width / 2,
            y: -40,
            size: 40, // 4倍普通怪体积
            speed: 1.0, // 速度稍慢方便拉扯
            hp: 100 * currentLoop, // 每轮循环 Boss 血量翻倍增长
            maxHp: 100 * currentLoop,
            color: "#9b59b6" // 高贵紫色
        });
        bossActive = true;
        
        // 显示顶部的 Boss 血条 UI 容器
		const bossContainer = document.getElementById("bossHealthContainer");
		if (bossContainer) {
			bossContainer.classList.remove("hidden");
		}
        updateBossBar(100, 100);
    }

    // 🚀 【阶段 B：普通怪与精英怪的高频刷新控制】
    // 刷怪频率会随着等级增加而稍微变快
    if (enemyTimer > Math.max(12, 45 - level * 2)) {
        let x, y;
        // 四周边缘随机点出场
        if (Math.random() < 0.5) {
            x = Math.random() < 0.5 ? -10 : canvas.width + 10;
            y = Math.random() * canvas.height;
        } else {
            x = Math.random() * canvas.width;
            y = Math.random() < 0.5 ? -10 : canvas.height + 10;
        }

        // 判定当前击杀数是否解锁了精英怪（30斩以上，且30%几率随出）
        const isEliteUnlocked = (score >= 30);
        if (isEliteUnlocked && Math.random() < 0.3) {
            // 🚀 亮蓝色精英怪属性定义
            enemies.push({
                type: "elite",
                x: x,
                y: y,
                size: 20, // 2倍体积
                speed: 1.4 + (currentLoop * 0.1),
                hp: 4 * currentLoop, // 血量随循环递增
                color: "#3498db", // 亮蓝色
                // 💡 新增变异：蓄力冲刺状态机变量
                state: "walk", // walk=寻路移动, charge=红光蓄力, dash=暴走冲刺
                timer: 0,
                dashVx: 0,
                dashVy: 0
            });
        } else {
            // 🚀 普通小怪属性定义
            enemies.push({
                type: "normal",
                x: x,
                y: y,
                size: 10,
                speed: 1.2 + (currentLoop * 0.1),
                hp: 1 + Math.floor(currentLoop / 2),
                color: "#e74c3c", // 鲜红色
                // 💡 新增变异：普通怪到达 Loop 2 后也拥有概率蓄力冲刺能力
                state: "walk",
                timer: 0,
                dashVx: 0,
                dashVy: 0
            });
        }
        enemyTimer = 0;
    }
}

// 10. 🚀 新增：辅助更新顶部 Boss 血条的纯前端 UI 函数
function updateBossBar(current, max) {
    const bar = document.getElementById("bossHpBar");
    if (bar) {
        const percentage = Math.max(0, (current / max) * 100);
        bar.style.width = percentage + "%";
    }
}
// 11. 🚀 核心物理碰撞、蓄力红绿灯AI与分裂算法主循环
function gameLoop() {
    if (gameOver || isPaused) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    updatePlayer();
    spawnEnemies();

    // 【逻辑 A】绘制并拾取经验石（普通=1点，精英爆金/大绿=3点）
    for (let i = gems.length - 1; i >= 0; i--) {
        let gem = gems[i];
        ctx.fillStyle = gem.color || "#2ecc71";
        ctx.beginPath();
        ctx.arc(gem.x, gem.y, gem.size, 0, Math.PI * 2);
        ctx.fill();

        let d = Math.hypot(player.x - gem.x, player.y - gem.y);
        if (d < 50) {
            gem.x += (player.x - gem.x) * 0.2;
            gem.y += (player.y - gem.y) * 0.2;
        }

        if (d < player.size + gem.size) {
            gems.splice(i, 1);
            exp += gem.value; // 根据宝石权值加经验
            
            if (exp >= expNeeded) {
                level++;
                exp = 0;
                expNeeded = Math.floor(expNeeded * 1.5);
                triggerShop();
            } else {
                document.getElementById("level").innerText = `等级: ${level} (EXP: ${exp}/${expNeeded})`;
            }
        }
    }

    // 【逻辑 B】子弹位移与命中、Boss 血条、强行升空商店判定
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;

        ctx.fillStyle = "#f1c40f";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
        ctx.fill();

        if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
            bullets.splice(i, 1);
            continue;
        }

        for (let j = enemies.length - 1; j >= 0; j--) {
            let e = enemies[j];
            if (Math.hypot(b.x - e.x, b.y - e.y) < b.size + e.size) {
                bullets.splice(i, 1);
                e.hp -= player.damage; 

                // 如果击中 Boss，实时更新顶部大血条
                if (e.type === "boss") {
                    updateBossBar(e.hp, e.maxHp);
                }

                // 怪物死亡判定
                if (e.hp <= 0) {
                    if (e.type === "boss") {
                        // 🟢 [Boss 斩首处理]
                        bossActive = false;
                        const bossContainer = document.getElementById("bossHealthContainer");
						if (bossContainer) {
							bossContainer.classList.add("hidden");
						}
                        
                        // 原地爆出 10 颗高额经验宝石
                        for (let k = 0; k < 10; k++) {
                            gems.push({ x: e.x + (Math.random() * 30 - 15), y: e.y + (Math.random() * 30 - 15), size: 6, value: 3, color: "#f1c40f" });
                        }
                        // 强制赠送额外一次商店升级强化
                        setTimeout(() => { triggerShop(); }, 20);
                        
                    } else if (e.type === "elite") {
                        // 🟢 [精英怪死亡处理] 爆金宝石 + 🚀 触发分裂出 2 只高移速小蜘蛛
                        gems.push({ x: e.x, y: e.y, size: 6, value: 3, color: "#f1c40f" }); 
                        
                        for (let k = 0; k < 2; k++) {
                            enemies.push({
                                type: "spider",
                                x: e.x + (k === 0 ? -10 : 10),
                                y: e.y,
                                size: 6, // 极小体积
                                speed: 2.8, // 速度极快
                                hp: 1, // 1血脆皮，但速度具威胁
                                color: "#e67e22" // 橘色蜘蛛
                            });
                        }
                    } else {
                        // 普通怪和小蜘蛛死亡，正常掉落普通绿宝石
                        gems.push({ x: e.x, y: e.y, size: 4, value: 1, color: "#2ecc71" });
                    }

                    enemies.splice(j, 1);
                    score++;
                    document.getElementById("score").innerText = "击杀数: " + score;
                }
                break;
            }
        }
    }

    // 【逻辑 C】怪物 AI 状态机更新（蓄力红绿灯控制）与伤害判定
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        
        if (e.type === "boss" || e.type === "spider") {
            // Boss和蜘蛛不参与冲刺状态机，保持基础追踪
            let angle = Math.atan2(player.y - e.y, player.x - e.x);
            e.x += Math.cos(angle) * e.speed;
            e.y += Math.sin(angle) * e.speed;
        } else {
            // 🚀 普通怪与精英怪的“冲刺蓄力状态机”
            e.timer++;
            
            if (e.state === "walk") {
                // 1. 寻路跟踪状态
                let angle = Math.atan2(player.y - e.y, player.x - e.x);
                e.x += Math.cos(angle) * e.speed;
                e.y += Math.sin(angle) * e.speed;
                
                // 每走大约 3~4 秒，有概率触发原地蓄力
                if (e.timer > 180 && Math.random() < 0.02) {
                    e.state = "charge";
                    e.timer = 0;
                }
            } else if (e.state === "charge") {
                // 2. 原地蓄力状态（此时怪完全锁死不能动，外观渲染红光警示）
                e.timer++;
                // 锁定冲刺发射的方向向量
                let angle = Math.atan2(player.y - e.y, player.x - e.x);
                e.dashVx = Math.cos(angle) * (e.speed * 3.5); // 冲刺速度提高数倍
                e.dashVy = Math.sin(angle) * (e.speed * 3.5);

                if (e.timer > 35) { // 蓄力持续约 0.5 秒
                    e.state = "dash";
                    e.timer = 0;
                }
            } else if (e.state === "dash") {
                // 3. 极速冲刺状态（顺着向量向前滑行，不修正方向）
                e.x += e.dashVx;
                e.y += e.dashVy;
                
                if (e.timer > 20) { // 冲刺滑行约 0.3 秒后力竭
                    e.state = "walk";
                    e.timer = 0;
                }
            }
        }

        // 核心渲染绘制
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        
        if (e.state === "charge") {
            ctx.fillStyle = "#ffffff"; // 蓄力时发出危险白/红闪烁（Canvas用亮白色突出）
            ctx.strokeStyle = "#ff0000";
            ctx.lineWidth = 3;
            ctx.stroke();
        } else {
            ctx.fillStyle = e.color;
        }
        ctx.fill();

        // 玩家触敌扣血判定
        if (Math.hypot(player.x - e.x, player.y - e.y) < player.size + e.size) {
            // 冲刺状态下的怪对玩家造成双倍撞击伤害
            let damageFactor = (e.state === "dash") ? 1.0 : 0.5;
            player.hp -= damageFactor;
            
            document.getElementById("hp").innerText = `生命值: ${Math.max(0, Math.floor(player.hp))}/${player.maxHp}`;
            if (player.hp <= 0) {
                gameOver = true;
                alert(`不幸阵亡！你英勇地突围到了第 ${currentLoop} 轮无尽维度，最终拿下了 ${score} 个击杀斩首！`);
                window.location.reload();
            }
        }
    }

    // 【逻辑 D】绘制土豆主角
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2);
    ctx.fill();

    // 【逻辑 E】绘制手机端摇杆 UI
    if (joystick.active) {
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(joystick.startX, joystick.startY, 40, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.beginPath();
        ctx.arc(joystick.curX, joystick.curY, 15, 0, Math.PI * 2);
        ctx.fill();
    }

    requestAnimationFrame(gameLoop);
}

// 12. 最终启动进化状态机
gameLoop();
